import {
  WebGLRenderer, Scene, PerspectiveCamera, SphereGeometry, MeshPhysicalMaterial, Mesh, Group,
  PMREMGenerator, DirectionalLight, Color, ACESFilmicToneMapping, SRGBColorSpace, Raycaster, Vector2, Vector3,
  CanvasTexture, SpriteMaterial, Sprite, AdditiveBlending, BackSide, FrontSide
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import './features.js';
import './motion.js';

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* пружина: damping ratio + response (сек) */
function stepSpring(s, target, zeta, response, dt) {
  const k = (2 * Math.PI / response) ** 2;
  const c = 4 * Math.PI * zeta / response;
  s.v += (-k * (s.x - target) - c * s.v) * dt;
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
let vh = innerHeight, vw = innerWidth, anchors = { secs: [], F: 0, END: 0, S: 0, SH: 1, word: null };
function measure() {
  vh = innerHeight; vw = innerWidth;
  const top = id => $(id).getBoundingClientRect().top + scrollY;
  const sec = id => ({ t: top(id), h: $(id).offsetHeight });
  const w = $('#wordmark').getBoundingClientRect();
  anchors = {
    S: top('#statement'),
    SH: $('#statement').offsetHeight,
    secs: ['#statement', '#together', '#trip', '#reasons', '#specs'].map(sec),
    F: top('#finale'),
    END: document.documentElement.scrollHeight - vh,
    word: { cx: w.left + w.width / 2, cy: w.top + scrollY + w.height / 2, w: w.width, h: w.height }
  };
}

/* позы сердца: [x, y, ширина в px]; x, y — доля половины экрана */
function poses() {
  const narrow = vw / vh < 0.8;
  const wd = anchors.word;
  const hero = [wd.cx / vw * 2 - 1, -(wd.cy / vh * 2 - 1), Math.min(wd.w * 0.62, wd.h * 1.02)];
  const off = [0, 1.9, 120];
  if (narrow) {
    return { hero, list: [[0, 0.44, vw * 0.5], off, off, off, off], finale: [0, 0.5, vw * 0.46] };
  }
  const side = Math.min(vw * 0.27, vh * 0.46);
  return {
    hero,
    list: [[0.56, 0.02, side], [-0.5, 0.02, side], off, off, [-0.5, 0.02, side]],
    finale: [0, 0.6, Math.min(vw * 0.2, vh * 0.24)]
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

/* фон: лавандовый лист и сиреневая рамка темнеют перед финалом */
const LAV = [233, 228, 255], MAUVE = [127, 95, 120];
let dark = 0;
const meta = document.querySelector('meta[name=theme-color]');
const sheet = $('#sheet');
const mix = (c, t) => `rgb(${c.map(v => Math.round(v * (1 - t))).join(',')})`;
function updatePage() {
  dark = clamp((scrollY - (anchors.F - vh * 0.7)) / (vh * 0.55), 0, 1);
  sheet.style.backgroundColor = mix(LAV, dark);
  const frame = mix(MAUVE, dark);
  document.body.style.backgroundColor = frame;
  meta.setAttribute('content', frame);

  const p = clamp((scrollY - anchors.S + vh * 0.25) / (anchors.SH - vh * 0.75), 0, 1);
  const n = wordSpans.length;
  wordSpans.forEach((s, i) => s.classList.toggle('on', reduce || p * (n + 2) > i + 1));
}

measure(); updatePage();
addEventListener('scroll', updatePage, { passive: true });
addEventListener('resize', () => { measure(); updatePage(); });
addEventListener('load', () => { measure(); updatePage(); });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); updatePage(); });

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
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  const key = new DirectionalLight(0xffffff, 1.8);
  key.position.set(-3, 4, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xcfc4ff, 1.4);
  rim.position.set(4, -1, -3);
  scene.add(rim);
  const fill = new DirectionalLight(0xffe4ee, 0.8);
  fill.position.set(0, -4, 6);
  scene.add(fill);

  /* сердце: неявная поверхность (x²+9/4·z²+y²−1)³ − x²y³ − 9/80·z²y³ = 0,
     вершины сферы «натягиваются» на неё по лучу из центра */
  /* сердце: сфера, у которой сечения — классическая кривая сердца.
     ближе к центру лицевой стороны кривая плавно переходит в круг, поэтому складок нет */
  let geo = new SphereGeometry(1, 160, 120);
  geo.rotateX(Math.PI / 2);                       // полюса сферы — спереди и сзади
  {
    const pos = geo.attributes.position;
    const d = new Vector3(), DEPTH = 0.66;
    for (let i = 0; i < pos.count; i++) {
      d.fromBufferAttribute(pos, i).normalize();
      const rho = Math.min(1, Math.hypot(d.x, d.y));
      const t = Math.atan2(d.x, d.y);             // 0 — верх (ложбинка), π — низ (остриё)
      const s1 = Math.sin(t);
      const hx = s1 * s1 * s1;
      const hy = (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16;
      const cx = Math.sin(t) * 0.78, cy = Math.cos(t) * 0.78 - 0.12;
      const w = Math.pow(smooth(rho), 0.7) * (1 - 0.3 * smooth(clamp((-Math.cos(t) - 0.75) / 0.25, 0, 1)));
      pos.setXYZ(i, rho * lerp(cx, hx, w), rho * lerp(cy, hy, w), DEPTH * d.z * (0.86 + 0.14 * (1 - rho)));
    }
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    geo = mergeVertices(geo, 1e-4);
    geo.computeVertexNormals();
    geo.center();
    geo.computeBoundingBox();
  }
  const HEART_W = geo.boundingBox.max.x - geo.boundingBox.min.x;

  /* стекло: внутренняя и внешняя стенки */
  const glass = {
    roughness: 0.07, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    iridescence: 0.45, iridescenceIOR: 1.35, iridescenceThicknessRange: [160, 420],
    transparent: true, envMapIntensity: 1.5
  };
  const matBack = new MeshPhysicalMaterial({ ...glass, color: new Color('#c81e5c'), side: BackSide, opacity: 0.42, depthWrite: false });
  const mat = new MeshPhysicalMaterial({
    ...glass, color: new Color('#ff5a8c'), side: FrontSide, opacity: 0.66,
    emissive: new Color('#ff2a6a'), emissiveIntensity: 0,
    sheen: 0.5, sheenColor: new Color('#ffd0e0'), sheenRoughness: 0.4
  });
  const heartBack = new Mesh(geo, matBack);
  const heart = new Mesh(geo, mat);
  heartBack.renderOrder = 2; heart.renderOrder = 3;
  const spinG = new Group(), tiltG = new Group(), root = new Group();
  spinG.add(heartBack, heart);
  tiltG.add(spinG);
  root.add(tiltG);
  scene.add(root);

  /* мягкая тень и свечение */
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
    map: radial([[0, 'rgba(90,30,90,.5)'], [0.5, 'rgba(90,30,90,.16)'], [1, 'rgba(90,30,90,0)']]),
    transparent: true, depthWrite: false
  }));
  shadow.renderOrder = 0;
  scene.add(shadow);
  const glow = new Sprite(new SpriteMaterial({
    map: radial([[0, 'rgba(255,60,120,.9)'], [0.35, 'rgba(220,30,100,.35)'], [1, 'rgba(120,0,60,0)']]),
    transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0
  }));
  glow.position.z = -1.5;
  glow.renderOrder = 0;
  scene.add(glow);

  /* состояние движения */
  const half = { w: 1, h: 1 };
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    half.h = camera.position.z * Math.tan((camera.fov / 2) * Math.PI / 180);
    half.w = half.h * camera.aspect;
  }
  resize();
  addEventListener('resize', resize);
  const pxToScale = px => (px / innerHeight) * (2 * half.h) / HEART_W;

  const pos = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, w: { x: 100, v: 0 } };
  { const p = scrollPose(); pos.x.x = p[0]; pos.y.x = p[1]; pos.w.x = p[2]; }
  const beat = { x: reduce ? 1 : 0, v: 0 };          // появляется с пружинкой
  const tilt = { x: 0, v: 0 }, look = { x: 0, v: 0 };
  let spin = -0.5, omega = reduce ? 0 : 0.45, idleDir = 1;
  const mouse = { x: 0, y: 0, on: false };

  /* ---------- жесты: 1:1, инерция, резинка, нажатие ---------- */
  const ray = new Raycaster();
  const ndc = new Vector2();
  function hits(cx, cy) {
    ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(heart, false).length > 0;
  }
  const busy = t => t && t.closest && t.closest('a,button,#page,#map,input,textarea');

  let drag = null;
  const ROT_PER_PX = 0.0105, TILT_PER_PX = 0.006, TILT_LIMIT = 0.4;

  addEventListener('pointerdown', e => {
    if ((e.button && e.button !== 0) || busy(e.target) || !hits(e.clientX, e.clientY)) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    drag = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: performance.now(), type: e.pointerType,
      spin0: spin, hist: [{ x: e.clientX, y: e.clientY, t: performance.now() }], moved: false
    };
    omega = 0;                       // схватила — останавливается под пальцем
    beat.v -= 1.2;                   // мгновенный отклик на нажатие
    document.body.classList.add('dragging');
  });

  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') {
      mouse.x = e.clientX / innerWidth * 2 - 1; mouse.y = e.clientY / innerHeight * 2 - 1; mouse.on = true;
      if (!drag) document.documentElement.style.cursor = !busy(e.target) && hits(e.clientX, e.clientY) ? 'grab' : '';
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 8) drag.moved = true;
    spin = drag.spin0 + dx * ROT_PER_PX;
    if (drag.type !== 'touch') {
      const raw = dy * TILT_PER_PX, over = Math.abs(raw) - TILT_LIMIT;
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
    omega = clamp((cancelled ? 0 : (b.x - a.x) / dt) * ROT_PER_PX, -28, 28);   // скорость пальца передаётся дальше
    if (Math.abs(omega) > 0.8) idleDir = Math.sign(omega);
    tilt.v = clamp((cancelled ? 0 : (b.y - a.y) / dt) * TILT_PER_PX, -8, 8);
    if (!drag.moved && !cancelled && performance.now() - drag.t0 < 450) tap();
    drag = null;
    document.body.classList.remove('dragging');
  }
  addEventListener('pointerup', e => release(e, false));
  addEventListener('pointercancel', e => release(e, true));

  function tap() {
    beat.v += 5.5;
    if (navigator.vibrate) navigator.vibrate(12);
    nextReply();
  }

  /* ---------- кадр ---------- */
  let last = performance.now(), time = 0, nextBeat = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
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
    const follow = reduce ? 0.05 : 0.6;
    const sub = Math.ceil(dt / (1 / 120)), h = dt / sub;
    for (let i = 0; i < sub; i++) {
      stepSpring(pos.x, target[0], 1, follow, h);
      stepSpring(pos.y, target[1], 1, follow, h);
      stepSpring(pos.w, target[2], 1, follow, h);
      stepSpring(beat, 1, 0.42, 0.32, h);
      if (!drag) stepSpring(tilt, mouse.on && !reduce ? mouse.y * 0.14 : 0, 0.8, 0.5, h);
      stepSpring(look, mouse.on && !reduce && !drag ? mouse.x * 0.22 : 0, 1, 0.6, h);
    }

    if (!drag) {
      const idle = reduce ? 0 : 0.42 * idleDir * (0.45 + 1.7 * Math.sin(spin) ** 2);   // лицом — медленно, боком — быстро
      if (dark > 0.5 && !reduce) {
        // в финале сердце поворачивается лицом и только слегка покачивается
        const want = Math.round(spin / Math.PI) * Math.PI + Math.sin(time * 0.9) * 0.32;
        const k = (2 * Math.PI / 1.3) ** 2, c = 4 * Math.PI / 1.3;
        omega += (-k * (spin - want) - c * omega) * dt;
      } else {
        omega += (idle - omega) * (1 - Math.exp(-dt / 1.1));
      }
      spin += omega * dt;
    }

    const bob = reduce ? 0 : Math.sin(time * 2.1) * 0.04;
    const s = pxToScale(pos.w.x);
    root.position.set(pos.x.x * half.w, pos.y.x * half.h + bob * s, 0);
    root.scale.setScalar(Math.max(0.0001, s * beat.x));
    tiltG.rotation.x = tilt.x;
    tiltG.rotation.y = look.x;
    spinG.rotation.y = spin;
    mat.emissiveIntensity = clamp((beat.x - 1) * 2.2, 0, 0.6) + dark * 0.1;

    shadow.position.set(root.position.x, root.position.y - 1.14 * s - bob * s * 0.5, -0.5);
    shadow.scale.set(2.0 * s * (1 - bob * 1.2), 0.42 * s, 1);
    shadow.material.opacity = (1 - dark) * 0.75 * clamp(beat.x, 0, 1);

    glow.position.x = root.position.x;
    glow.position.y = root.position.y;
    glow.scale.setScalar(5 * s * (0.9 + (beat.x - 1) * 1.4));
    glow.material.opacity = dark * 0.5;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
