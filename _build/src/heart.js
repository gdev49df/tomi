import {
  WebGLRenderer, Scene, PerspectiveCamera, Shape, ExtrudeGeometry, MeshPhysicalMaterial, Mesh, Group,
  PMREMGenerator, DirectionalLight, Color, ACESFilmicToneMapping, SRGBColorSpace, Raycaster, Vector2,
  CanvasTexture, SpriteMaterial, Sprite, AdditiveBlending
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './features.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* пружина в терминах apple: damping ratio + response (сек) */
function stepSpring(s, target, zeta, response, dt) {
  const k = (2 * Math.PI / response) ** 2;
  const c = 4 * Math.PI * zeta / response;
  const a = -k * (s.x - target) - c * s.v;
  s.v += a * dt;
  s.x += s.v * dt;
}
function rubberband(over, dim, c = 0.55) {
  return (over * dim * c) / (dim + c * Math.abs(over));
}

/* ---------- слова, проявляющиеся при прокрутке ---------- */
const wordsEl = $('#words');
wordsEl.innerHTML = wordsEl.textContent.trim().split(/\s+/).map(w => `<span>${w}</span> `).join('');
const wordSpans = [...wordsEl.children];

/* ---------- подсказка, меняющаяся от нажатий ---------- */
const hint = $('#hint');
const replies = [
  'тук-тук',
  'чувствуешь? это из-за тебя',
  'оно так каждый раз, когда ты рядом',
  'ещё раз, мне нравится',
  'оно твоё, можешь не возвращать'
];
let replyI = 0, hintTimer;
function nextReply() {
  hint.classList.add('swap');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.textContent = replies[replyI++ % replies.length];
    hint.classList.remove('swap');
  }, 180);
}

/* ---------- геометрия страницы ---------- */
let vh = innerHeight, anchors = {};
function measure() {
  vh = innerHeight;
  const top = id => $(id).getBoundingClientRect().top + scrollY;
  const st = $('#statement');
  const sec = id => { const el = $(id); return { t: top(id), h: el.offsetHeight }; };
  anchors = {
    S: top('#statement'),
    SH: st.offsetHeight,
    secs: ['#statement', '#together', '#trip', '#reasons', '#specs'].map(sec),
    F: top('#finale'),
    END: document.documentElement.scrollHeight - vh
  };
}

/* позы сердца: x, y — доля половины видимой области, s — множитель масштаба */
function poses() {
  const narrow = innerWidth / innerHeight < 0.8;
  const off = [0, 1.9, 0.45];
  return narrow ? {
    hero: [0, 0.24, 1], list: [[0, 0.42, 0.72], off, off, off, off], finale: [0, 0.4, 0.86]
  } : {
    hero: [0, 0.3, 0.86], list: [[0.56, 0.02, 0.72], [-0.52, 0.02, 0.72], off, off, [-0.5, 0.02, 0.74]], finale: [0, 0.5, 0.6]
  };
}

function scrollPose() {
  const y = scrollY, P = poses(), a = anchors;
  const keys = [[0, P.hero]];
  a.secs.forEach((s, i) => {
    const prev = keys[keys.length - 1][0];
    const start = Math.max(prev + 1, s.t - vh * 0.25);
    const end = Math.max(start + 1, s.t + s.h - vh * 0.85);
    keys.push([start, P.list[i]], [end, P.list[i]]);
  });
  keys.push([Math.max(a.END, keys[keys.length - 1][0] + 1), P.finale]);
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (y <= keys[i][0]) {
      const t = smooth(clamp((y - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0] || 1), 0, 1));
      return keys[i - 1][1].map((v, j) => lerp(v, keys[i][1][j], t));
    }
  }
  return keys[keys.length - 1][1];
}

/* фон: светлый → чёрный перед финалом */
const paper = [245, 245, 247];
let dark = 0;
const meta = document.querySelector('meta[name=theme-color]');
function updatePage() {
  dark = clamp((scrollY - (anchors.F - vh * 0.7)) / (vh * 0.55), 0, 1);
  const c = paper.map(v => Math.round(v * (1 - dark)));
  const col = `rgb(${c.join(',')})`;
  document.body.style.backgroundColor = col;
  meta.setAttribute('content', col);
  document.body.classList.toggle('dark', dark > 0.5);

  // слова
  const p = clamp((scrollY - anchors.S + vh * 0.25) / (anchors.SH - vh * 0.75), 0, 1);
  const n = wordSpans.length;
  wordSpans.forEach((s, i) => s.classList.toggle('on', reduce || p * (n + 2) > i + 1));
}

measure(); updatePage();
addEventListener('scroll', updatePage, { passive: true });
addEventListener('resize', () => { measure(); updatePage(); });
addEventListener('load', () => { measure(); updatePage(); });

/* ---------- 3d ---------- */
const canvas = $('#stage');
let renderer;
try {
  renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-gl');
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new DirectionalLight(0xffffff, 1.6);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xffd6dc, 1.2);
  rim.position.set(4, -1, -3);
  scene.add(rim);
  const fill = new DirectionalLight(0xffe4e8, 0.9);
  fill.position.set(0, -4, 6);
  scene.add(fill);

  /* форма сердца */
  const sh = new Shape();
  sh.moveTo(5, 5);
  sh.bezierCurveTo(5, 5, 4, 0, 0, 0);
  sh.bezierCurveTo(-6, 0, -6, 7, -6, 7);
  sh.bezierCurveTo(-6, 11, -3, 15.4, 5, 19);
  sh.bezierCurveTo(12, 15.4, 16, 11, 16, 7);
  sh.bezierCurveTo(16, 7, 16, 0, 10, 0);
  sh.bezierCurveTo(7, 0, 5, 5, 5, 5);
  const geo = new ExtrudeGeometry(sh, {
    depth: 1.6, bevelEnabled: true, bevelSegments: 16, steps: 1,
    bevelSize: 2.4, bevelThickness: 3.2, curveSegments: 48
  });
  geo.center();
  geo.rotateZ(Math.PI);
  geo.scale(0.1, 0.1, 0.1);
  geo.computeVertexNormals();

  const mat = new MeshPhysicalMaterial({
    color: new Color('#c40f2c'),
    roughness: 0.24,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    sheen: 0.6,
    sheenColor: new Color('#ff7d90'),
    sheenRoughness: 0.45,
    emissive: new Color('#ff1a3c'),
    emissiveIntensity: 0,
    envMapIntensity: 1
  });
  const heart = new Mesh(geo, mat);
  const tiltG = new Group();
  const root = new Group();
  tiltG.add(heart);
  root.add(tiltG);
  scene.add(root);

  /* мягкая тень и свечение — радиальные текстуры */
  function radial(stops) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }
  const shadow = new Sprite(new SpriteMaterial({
    map: radial([[0, 'rgba(60,10,20,.55)'], [0.5, 'rgba(60,10,20,.18)'], [1, 'rgba(60,10,20,0)']]),
    transparent: true, depthWrite: false
  }));
  scene.add(shadow);
  const glow = new Sprite(new SpriteMaterial({
    map: radial([[0, 'rgba(255,40,70,.9)'], [0.35, 'rgba(200,10,40,.35)'], [1, 'rgba(120,0,20,0)']]),
    transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0
  }));
  glow.position.z = -1.5;
  scene.add(glow);

  /* состояние движения */
  const pos = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, s: { x: 1, v: 0 } };
  { const p = scrollPose(); pos.x.x = p[0]; pos.y.x = p[1]; pos.s.x = p[2]; }
  const beat = { x: 1, v: 0 };
  const tilt = { x: 0, v: 0 };
  let spin = 0.4, omega = reduce ? 0 : 0.55, idleDir = 1;
  let half = { w: 1, h: 1 }, base = 1;

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    half.h = camera.position.z * Math.tan((camera.fov / 2) * Math.PI / 180);
    half.w = half.h * camera.aspect;
    base = Math.min(1, (half.w * 0.74) / 1.35);
  }
  resize();
  addEventListener('resize', resize);

  /* ---------- жесты: 1:1, инерция, резинка, нажатие ---------- */
  const ray = new Raycaster();
  const ndc = new Vector2();
  function hits(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(heart, false).length > 0;
  }

  let drag = null;
  const ROT_PER_PX = 0.0105, TILT_PER_PX = 0.006, TILT_LIMIT = 0.35;

  canvas.addEventListener('pointerdown', e => {
    if (e.button && e.button !== 0) return;
    const onHeart = hits(e.clientX, e.clientY);
    drag = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(),
      spin0: spin, onHeart, hist: [{ x: e.clientX, y: e.clientY, t: performance.now() }], moved: false
    };
    canvas.setPointerCapture(e.pointerId);
    omega = 0;                                     // схватила — сердце останавливается под пальцем
    if (onHeart) { beat.v -= 1.2; }                 // мгновенный отклик на нажатие: лёгкое «вдавливание»
  });

  canvas.addEventListener('pointermove', e => {
    if (!drag) {
      if (e.pointerType === 'mouse') canvas.style.cursor = hits(e.clientX, e.clientY) ? 'grab' : 'default';
      return;
    }
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
    if (e.pointerType === 'mouse') canvas.style.cursor = 'grabbing';
    spin = drag.spin0 + dx * ROT_PER_PX;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      const raw = dy * TILT_PER_PX;
      const over = Math.abs(raw) - TILT_LIMIT;
      tilt.x = over > 0 ? Math.sign(raw) * (TILT_LIMIT + rubberband(over, 1)) : raw;
      tilt.v = 0;
    }
    const now = performance.now();
    drag.hist.push({ x: e.clientX, y: e.clientY, t: now });
    while (drag.hist.length > 2 && now - drag.hist[0].t > 100) drag.hist.shift();
  });

  function release(e, cancelled) {
    if (!drag || e.pointerId !== drag.id) return;
    const h = drag.hist, a = h[0], b = h[h.length - 1];
    const dt = Math.max(16, b.t - a.t) / 1000;
    const vx = cancelled ? 0 : (b.x - a.x) / dt;
    const vy = cancelled ? 0 : (b.y - a.y) / dt;
    omega = clamp(vx * ROT_PER_PX, -28, 28);       // передаём скорость пальца дальше
    if (Math.abs(omega) > 0.8) idleDir = Math.sign(omega);
    tilt.v = clamp(vy * TILT_PER_PX, -8, 8);
    if (!drag.moved && !cancelled && drag.onHeart && performance.now() - drag.t0 < 450) tap();
    canvas.style.cursor = e.pointerType === 'mouse' && hits(e.clientX, e.clientY) ? 'grab' : 'default';
    drag = null;
  }
  canvas.addEventListener('pointerup', e => release(e, false));
  canvas.addEventListener('pointercancel', e => release(e, true));

  function tap() {
    beat.v += 5.5;
    if (navigator.vibrate) navigator.vibrate(12);
    nextReply();
  }

  // клавиатура: пробел/enter по холсту — тоже удар
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); }
    if (e.key === 'ArrowLeft') omega -= 3;
    if (e.key === 'ArrowRight') omega += 3;
  });

  /* ---------- кадр ---------- */
  let last = performance.now(), time = 0, nextBeat = 0;
  function frame(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    // автоматический пульс в финале: тук-тук
    if (!reduce && dark > 0.85) {
      if (time >= nextBeat) {
        beat.v += 3.2;
        setTimeout(() => { beat.v += 2.1; }, 290);
        nextBeat = time + 1.15;
      }
    } else nextBeat = time + 0.4;

    const target = scrollPose();
    const sub = Math.ceil(dt / (1 / 120));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      stepSpring(pos.x, target[0], 1, reduce ? 0.05 : 0.6, h);
      stepSpring(pos.y, target[1], 1, reduce ? 0.05 : 0.6, h);
      stepSpring(pos.s, target[2], 1, reduce ? 0.05 : 0.6, h);
      stepSpring(beat, 1, 0.42, 0.32, h);
      if (!drag) stepSpring(tilt, 0, 0.8, 0.4, h);
    }

    if (!drag) {
      const idle = reduce ? 0 : 0.55 * idleDir;
      omega += (idle - omega) * (1 - Math.exp(-dt / 1.1));
      spin += omega * dt;
    }

    const bob = reduce ? 0 : Math.sin(time * 2.1) * 0.045;
    const s = base * pos.s.x;
    root.position.set(pos.x.x * half.w, pos.y.x * half.h + bob * s, 0);
    root.scale.setScalar(s * beat.x);
    tiltG.rotation.x = tilt.x;
    heart.rotation.y = spin;
    mat.emissiveIntensity = clamp((beat.x - 1) * 2.2, 0, 0.6) + dark * 0.08;

    shadow.position.set(root.position.x, root.position.y - 1.55 * s - bob * s * 0.5, -0.5);
    shadow.scale.set(2.6 * s * (1 - bob * 1.2), 0.5 * s, 1);
    shadow.material.opacity = (1 - dark) * 0.9;

    glow.position.x = root.position.x;
    glow.position.y = root.position.y;
    glow.scale.setScalar(6.5 * s * (0.9 + (beat.x - 1) * 1.4));
    glow.material.opacity = dark * 0.55;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
