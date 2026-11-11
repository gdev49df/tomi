/* таймер, карта маршрута, книга причин */
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const T = window.TOMI || {};

function stepSpring(s, target, zeta, response, dt) {
  const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * zeta / response;
  s.v += (-k * (s.x - target) - c * s.v) * dt;
  s.x += s.v * dt;
}
function springs(list, dt) { // list: [state, target, zeta, response]
  const n = Math.ceil(dt / (1 / 120)), h = dt / n;
  for (let i = 0; i < n; i++) list.forEach(([s, t, z, r]) => stepSpring(s, t, z, r, h));
}
const settled = (s, t, eps = 0.05) => Math.abs(s.x - t) < eps && Math.abs(s.v) < eps * 4;
function rubberband(over, dim, c = 0.55) { return (over * dim * c) / (dim + c * Math.abs(over)); }
function project(v, d = 0.99) { return (v / 1000) * d / (1 - d); }
const plural = (n, a) => { const x = Math.abs(n) % 100, y = x % 10; return (x > 10 && x < 15) ? a[2] : y === 1 ? a[0] : (y > 1 && y < 5) ? a[1] : a[2]; };
const W_DAY = ['день', 'дня', 'дней'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const TZ = 5 * 3600e3; // астана, utc+5
const local = ms => new Date(ms + TZ);
const fmtDate = ms => { const d = local(ms); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const pad = n => String(n).padStart(2, '0');
const nf = n => n.toLocaleString('ru-RU').replace(/,/g, ' ');

/* ================= таймер ================= */
(function timer() {
  const start = Date.parse(T.start || '2025-01-26T00:00:00+05:00');
  const elD = $('#tDays'), elW = $('#tDaysWord'), elH = $('#tH'), elM = $('#tM'), elS = $('#tS');
  const DAY = 86400e3;

  // «1 год, 9 месяцев и 16 дней» — календарная разница по астане
  function calendar(now) {
    const a = local(start), b = local(now);
    let y = b.getUTCFullYear() - a.getUTCFullYear();
    let m = b.getUTCMonth() - a.getUTCMonth();
    let d = b.getUTCDate() - a.getUTCDate();
    if (d < 0) { m--; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
    if (m < 0) { y--; m += 12; }
    const parts = [];
    if (y) parts.push(`${y} ${plural(y, ['год', 'года', 'лет'])}`);
    if (m) parts.push(`${m} ${plural(m, ['месяц', 'месяца', 'месяцев'])}`);
    if (d || !parts.length) parts.push(`${d} ${plural(d, W_DAY)}`);
    return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' и ' + parts[parts.length - 1] : parts[0];
  }

  function milestones(now) {
    const days = Math.floor((now - start) / DAY);
    const out = [];
    let k = Math.floor(days / 100) * 100 + 100;
    for (let i = 0; i < 2; i++, k += 100) out.push({ at: start + k * DAY, label: `${nf(k)} ${plural(k, W_DAY)}` });
    if (days < 1000) out.push({ at: start + 1000 * DAY, label: '1 000 дней' });
    const a = local(start);
    for (let yr = 1; yr < 60; yr++) {
      const at = Date.UTC(a.getUTCFullYear() + yr, a.getUTCMonth(), a.getUTCDate()) - TZ;
      if (at > now) { out.push({ at, label: `${yr} ${plural(yr, ['год', 'года', 'лет'])} вместе` }); break; }
    }
    const uniq = [...new Map(out.map(o => [o.at, o])).values()].sort((x, y) => x.at - y.at).slice(0, 3);
    $('#tMiles').innerHTML = uniq.map(o => {
      const left = Math.ceil((o.at - now) / DAY);
      return `<li><span class="m-label">${o.label}</span><span class="m-date">${fmtDate(o.at)}<em>через ${nf(left)} ${plural(left, W_DAY)}</em></span></li>`;
    }).join('');
  }

  let counted = reduce || !('IntersectionObserver' in window);
  if (!counted) {
    const io = new IntersectionObserver(es => {
      if (!es[0].isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = 1700;
      const run = now => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 4);
        elD.textContent = nf(Math.round(lastDay * e));
        if (t < 1) requestAnimationFrame(run); else counted = true;
      };
      requestAnimationFrame(run);
    }, { threshold: 0.6 });
    io.observe(elD);
  }
  let lastDay = -1;
  function tick() {
    const now = Date.now();
    const ms = Math.max(0, now - start);
    const days = Math.floor(ms / DAY), r = ms % DAY;
    elH.textContent = pad(Math.floor(r / 3600e3));
    elM.textContent = pad(Math.floor(r % 3600e3 / 60e3));
    elS.textContent = pad(Math.floor(r % 60e3 / 1e3));
    if (days !== lastDay) {
      lastDay = days;
      if (counted) elD.textContent = nf(days);
      elW.textContent = plural(days, W_DAY);
      const pd = $('#pDays'); if (pd) pd.textContent = `${nf(days)} ${plural(days, W_DAY)}`;
      $('#tSince').textContent = `с ${fmtDate(start)} года. это ${calendar(now)}.`;
      milestones(now);
    }
  }
  tick();
  setInterval(tick, 1000);
})();

/* ================= карта ================= */
(function map() {
  const P = window.MAP_POINTS;
  const svg = $('#mapSvg');
  if (!P || !svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const mk = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; };
  const GEO = { home: [71.43, 51.17], tr: [28.98, 41.01], ae: [55.27, 25.2], cn: [116.4, 39.9], jp: [139.69, 35.69] };

  const trip = (T.trip || []).filter(s => P[s.id]);
  const stops = [{ id: 'home', city: 'астана' }, ...trip];
  const pts = stops.map(s => P[s.id]);

  // дуги между городами, изогнутые к северу
  let d = `M${pts[0][0]},${pts[0][1]}`;
  const legs = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let nx = -dy / len, ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const cx = mx + nx * len * 0.22, cy = my + ny * len * 0.22;
    const seg = `Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx},${by}`;
    legs.push(`M${ax},${ay} ${seg}`);
    d += ' ' + seg;
  }
  const routeG = $('#route');
  const route = mk('path', { d, class: 'route' }, routeG);
  const total = route.getTotalLength();
  const cum = [0];
  legs.forEach(l => { const p = mk('path', { d: l }, routeG); cum.push(cum[cum.length - 1] + p.getTotalLength()); p.remove(); });
  route.style.strokeDasharray = `${total} ${total}`;
  route.style.strokeDashoffset = total;

  // булавки
  const pinsG = $('#pins');
  const pins = stops.map((s, i) => {
    const g = mk('g', { class: 'pin' + (i === 0 ? ' home' : ''), 'data-i': i }, pinsG);
    const c = mk('circle', { cx: pts[i][0], cy: pts[i][1], r: 6 }, g);
    const t = mk('text', { x: pts[i][0], y: pts[i][1] }, g);
    t.textContent = s.city;
    return { g, c, t };
  });
  const plane = $('#plane');

  // расстояние по прямой между городами
  const R = 6371, rad = x => x * Math.PI / 180;
  const hav = (a, b) => { const dLat = rad(b[1] - a[1]), dLon = rad(b[0] - a[0]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += hav(GEO[stops[i - 1].id], GEO[stops[i].id]);
  km = Math.round(km / 100) * 100;

  { const pt = $('#pTrip'); if (pt) pt.textContent = `${trip.length} ${plural(trip.length, ['страна', 'страны', 'стран'])}`; }
  // панель
  const chips = $('#chips'), stop = $('#stop'), reset = $('#mapReset');
  chips.innerHTML = `<button role="tab" data-i="-1">весь маршрут</button>` + trip.map((s, i) => `<button role="tab" data-i="${i + 1}">${s.country}</button>`).join('');
  let sel = -1;
  function panel() {
    [...chips.children].forEach(b => b.setAttribute('aria-selected', String(+b.dataset.i === sel)));
    if (sel < 1) {
      stop.innerHTML = `<p class="leg">весь маршрут</p><h3>астана → ${stops[stops.length - 1].city}</h3>
        <p class="city">${trip.length} ${plural(trip.length, ['страна', 'страны', 'стран'])}, ${stops.length} ${plural(stops.length, ['город', 'города', 'городов'])}</p>
        <p class="body">примерно ${nf(km)} км по прямой между городами. хочу пролететь их все вместе с тобой.</p>`;
    } else {
      const s = stops[sel];
      stop.innerHTML = `<p class="leg">остановка ${sel} из ${trip.length}</p><h3>${s.country}</h3><p class="city">${s.city}</p><p class="body">${s.text}</p>`;
    }
    stop.classList.remove('pop'); void stop.offsetWidth; stop.classList.add('pop');
    svg.querySelectorAll('.dest').forEach(p => p.classList.toggle('on', sel > 0 && p.dataset.c === stops[sel].id));
    pins.forEach((p, i) => p.g.classList.toggle('on', i === sel));
    reset.hidden = sel < 1;
  }

  // камера (viewBox) на пружинах
  const box = svg.getBoundingClientRect.bind(svg);
  function targetView() {
    const r = box(), asp = (r.height || 640) / (r.width || 1000);
    let cx, cy, w;
    if (sel < 1) {
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const pad = 90;
      const bw = Math.max(...xs) - Math.min(...xs) + pad * 2, bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
      w = Math.max(bw, bh / asp);
      cx = (Math.max(...xs) + Math.min(...xs)) / 2; cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    } else {
      w = r.width < 600 ? 300 : 380;
      [cx, cy] = pts[sel];
    }
    return [cx, cy, w, w * asp];
  }
  let tv = targetView();
  const vx = { x: tv[0], v: 0 }, vy = { x: tv[1], v: 0 }, vw = { x: tv[2], v: 0 };
  const pl = { x: 0, v: 0 };
  let plTarget = 0, drawP = reduce ? 1 : 0, drawing = false, raf = 0, last = 0;

  function apply() {
    const r = box(), asp = (r.height || 640) / (r.width || 1000);
    const w = vw.x, h = w * asp;
    svg.setAttribute('viewBox', `${(vx.x - w / 2).toFixed(2)} ${(vy.x - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    const k = w / (r.width || 1000); // единиц svg на css-пиксель
    const shown = drawP * total;
    pins.forEach((p, i) => {
      const vis = shown >= cum[i] - 0.5;
      p.g.style.opacity = vis ? 1 : 0;
      p.c.setAttribute('r', (i === sel ? 7.5 : 5.5) * k);
      p.c.style.strokeWidth = 2.5 * k;
      p.t.setAttribute('font-size', 13 * k);
      p.t.setAttribute('dy', -13 * k);
    });
    route.style.strokeWidth = 2.5 * k;
    route.style.strokeDashoffset = total * (1 - drawP);
    const L = drawing ? shown : pl.x;
    const pt = route.getPointAtLength(clamp(L, 0, total));
    plane.setAttribute('transform', `translate(${pt.x.toFixed(2)} ${pt.y.toFixed(2)}) scale(${k.toFixed(4)})`);
    plane.style.opacity = drawP > 0.001 ? 1 : 0;
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    tv = targetView();
    const resp = reduce ? 0.05 : 0.6;
    springs([[vx, tv[0], 1, resp], [vy, tv[1], 1, resp], [vw, tv[2], 1, resp], [pl, plTarget, 1, reduce ? 0.05 : 0.8]], dt);
    if (drawing) {
      drawT += dt;
      const t = clamp(drawT / 2.8, 0, 1);
      drawP = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      if (t >= 1) { drawing = false; pl.x = total; }
    }
    apply();
    const done = !drawing && settled(vx, tv[0], .05) && settled(vy, tv[1], .05) && settled(vw, tv[2], .05) && settled(pl, plTarget, .2);
    raf = done ? 0 : requestAnimationFrame(loop);
  }
  let drawT = 0;
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  function select(i) {
    sel = i;
    plTarget = i < 1 ? total : cum[i];
    if (drawing || drawP < 1) { drawing = false; drawP = 1; pl.x = total; }
    panel();
    kick();
  }
  chips.addEventListener('click', e => { const b = e.target.closest('button'); if (b) select(+b.dataset.i); });
  reset.addEventListener('click', () => select(-1));
  svg.addEventListener('click', e => {
    const pin = e.target.closest('.pin');
    if (pin) return select(+pin.dataset.i || -1);
    const land = e.target.closest('.dest');
    if (!land) return;
    const i = stops.findIndex(s => s.id === land.dataset.c);
    select(i > 0 ? (i === sel ? -1 : i) : -1);
  });

  panel();
  plTarget = total; pl.x = 0;
  apply();
  if (reduce) { pl.x = total; apply(); }
  else {
    const io = new IntersectionObserver(es => {
      if (es[0].isIntersecting && drawP === 0 && !drawing) { drawing = true; drawT = 0; kick(); io.disconnect(); }
    }, { threshold: 0.45 });
    io.observe(svg);
  }
  addEventListener('resize', kick);
})();

/* ================= книга причин ================= */
(function book() {
  const list = T.reasons || [];
  const n = list.length;
  if (!n) return;
  const page = $('#page'), u1 = $('.under1'), u2 = $('.under2');
  const num = $('#rNum'), text = $('#rText'), bar = $('#rBar');
  $('#rSub').textContent = `${n} ${plural(n, ['причина', 'причины', 'причин'])}. листай, как книгу: свайп влево или стрелки.`;
  { const pr = $('#pReasons'); if (pr) pr.textContent = `${n} ${plural(n, ['причина', 'причины', 'причин'])}`; }
  let idx = 0;
  function render() {
    num.textContent = `№ ${idx + 1}`;
    text.textContent = list[idx];
    bar.style.width = ((idx + 1) / n * 100) + '%';
    $('#rPrev').disabled = idx === 0;
    $('#rNext').disabled = idx === n - 1;
  }
  render();

  const x = { x: 0, v: 0 }, sc = { x: 1, v: 0 };
  let tx = 0, tsc = 1, pending = 0, raf = 0, last = 0, drag = null;
  const width = () => page.getBoundingClientRect().width || 400;

  function apply() {
    const w = width();
    const rot = clamp(x.x / w, -1.5, 1.5) * 6;
    page.style.transform = `translateX(${x.x.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.x.toFixed(4)})`;
    const p = clamp(Math.abs(x.x) / w, 0, 1);
    u1.style.transform = `translateY(${14 - 14 * p}px) scale(${0.95 + 0.05 * p})`;
    u1.style.opacity = 0.7 + 0.3 * p;
    u2.style.transform = `translateY(${28 - 14 * p}px) scale(${0.9 + 0.05 * p})`;
  }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
    springs([[x, tx, pending ? 1 : 0.8, reduce ? 0.05 : 0.38], [sc, tsc, 1, reduce ? 0.05 : 0.35]], dt);
    const w = width();
    if (pending && Math.abs(x.x) > w * 1.05) {
      idx = clamp(idx + pending, 0, n - 1);
      render();
      // следующая поднимается из-под низа стопки
      x.x = 0; x.v = 0; tx = 0; sc.x = 0.95; sc.v = 0; tsc = 1;
      pending = 0;
    }
    apply();
    if (!drag && !pending && settled(x, tx, .5) && settled(sc, tsc, .002)) { x.x = tx; sc.x = tsc; apply(); raf = 0; return; }
    raf = requestAnimationFrame(loop);
  }
  const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

  function go(dir, v = 0, fromDrag = false) {
    if (pending) return;
    const target = idx + dir;
    if (target < 0 || target >= n) { x.v += dir * -600; tx = 0; kick(); return; }
    if (navigator.vibrate) navigator.vibrate(6);
    if (dir > 0) {                      // вперёд: верхняя уходит влево
      pending = 1; tx = -width() * 1.2; x.v = Math.min(v, -900);
    } else {                            // назад: предыдущая возвращается слева, тем же путём
      idx = target; render();
      if (!fromDrag) { x.x = -width() * 1.2; x.v = 0; }
      tx = 0; sc.x = 1; tsc = 1;
    }
    kick();
  }
  function jump(i) {
    if (i === idx) return;
    pending = 0;
    idx = i; render();
    x.x = 0; x.v = 0; tx = 0; sc.x = 0.92; tsc = 1; kick();
  }

  page.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    if (pending) return;
    page.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, x0: e.clientX - x.x, hist: [{ x: e.clientX, t: performance.now() }] };
    sc.v -= 0.4; // отклик на нажатие
    page.classList.add('grab');
    kick();
  });
  page.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    let dx = e.clientX - drag.x0;
    const w = width();
    if ((idx === 0 && dx > 0) || (idx === n - 1 && dx < 0)) dx = rubberband(dx, w);
    x.x = dx; x.v = 0; tx = dx;
    const now = performance.now();
    drag.hist.push({ x: e.clientX, t: now });
    while (drag.hist.length > 2 && now - drag.hist[0].t > 100) drag.hist.shift();
    apply();
  });
  function up(e, cancel) {
    if (!drag || e.pointerId !== drag.id) return;
    const h = drag.hist, a = h[0], b = h[h.length - 1];
    const v = cancel ? 0 : (b.x - a.x) / (Math.max(16, b.t - a.t) / 1000);
    drag = null;
    page.classList.remove('grab');
    x.v = v;
    const w = width(), end = x.x + project(v);
    if (end < -w * 0.35) go(1, v);
    else if (end > w * 0.35 && idx > 0) go(-1, v, true);
    else { tx = 0; kick(); }
  }
  page.addEventListener('pointerup', e => up(e, false));
  page.addEventListener('pointercancel', e => up(e, true));

  $('#rNext').addEventListener('click', () => go(1));
  $('#rPrev').addEventListener('click', () => go(-1));
  $('#rRandom').addEventListener('click', () => {
    let i; do { i = Math.floor(Math.random() * n); } while (i === idx && n > 1);
    jump(i);
  });

  // клавиатура, когда книга на экране
  let inView = false;
  new IntersectionObserver(es => { inView = es[0].isIntersecting; }, { threshold: 0.5 }).observe($('#book'));
  addEventListener('keydown', e => {
    if (!inView || e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });

  // все причины списком
  const all = $('#rList'), btn = $('#rAll');
  btn.addEventListener('click', () => {
    if (!all.children.length) all.innerHTML = list.map((r, i) => `<li><button data-i="${i}">${r}</button></li>`).join('');
    all.hidden = !all.hidden;
    btn.setAttribute('aria-expanded', String(!all.hidden));
    btn.textContent = all.hidden ? 'показать все' : 'скрыть список';
    dispatchEvent(new Event('resize'));
  });
  all.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    jump(+b.dataset.i);
    if (window.__lenis) window.__lenis.scrollTo($('#book'), { offset: -innerHeight * 0.22 });
    else $('#book').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });
})();
