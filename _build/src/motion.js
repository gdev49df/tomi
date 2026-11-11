/* инерционный скролл и появление секций */
import Lenis from 'lenis';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;

/* ---------- инерционный скролл (колесо и тачпад; на телефоне остаётся родная инерция) ---------- */
if (!reduce) {
  const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true, anchors: { offset: 0 } });
  window.__lenis = lenis;
  const raf = t => { lenis.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}

/* ---------- появление ---------- */
if (!reduce && 'IntersectionObserver' in window) {
  root.classList.add('anim');

  // заголовки: слова выезжают из-под маски
  document.querySelectorAll('.sec-title, .specs h2, .finale h2').forEach(h => {
    const words = h.textContent.trim().split(/\s+/);
    h.setAttribute('aria-label', h.textContent.trim());
    h.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
    h.classList.add('split');
    h.dataset.anim = '';
  });

  // группы с каскадом
  const groups = [
    ['.sec-sub, .since, .clock, .days, .sign, .trip-panel, .book-ctrl, .book-more', 'rise'],
    ['.milestones li', 'rise'],
    ['.specs dl > div', 'rise'],
    ['.map', 'zoom'],
    ['.book', 'deal']
  ];
  groups.forEach(([sel, kind]) => {
    const byParent = new Map();
    document.querySelectorAll(sel).forEach(el => {
      const n = byParent.get(el.parentNode) || 0;
      byParent.set(el.parentNode, n + 1);
      el.dataset.anim = kind;
      el.style.setProperty('--i', n);
    });
  });

  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in');
    io.unobserve(en.target);
  }), { threshold: 0.15, rootMargin: '0px 0px -7% 0px' });
  const watch = () => document.querySelectorAll('[data-anim]:not(.in)').forEach(el => io.observe(el));
  watch();
  // списки, которые дорисовываются позже (ближайшие даты)
  new MutationObserver(() => {
    document.querySelectorAll('.milestones li:not([data-anim])').forEach((el, i) => { el.dataset.anim = 'rise'; el.style.setProperty('--i', i); });
    watch();
  }).observe(document.querySelector('#tMiles'), { childList: true });
}
