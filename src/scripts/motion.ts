// Micro-interactions, ported from The Growth Lab site and adapted to print:
// scroll reveals, registration-mark cursor, header hide/progress, magnetic buttons,
// tilt, counters and a CMYK halftone field. Everything stays off under reduced motion,
// and nothing is hidden unless this script runs (the `.js` class gates the CSS).

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));

/* ---------- Scroll reveals ---------- */
function splitWords(el: HTMLElement) {
  let i = 0;
  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        (n.textContent || '').split(/(\s+)/).forEach((p) => {
          if (!p) return;
          if (/^\s+$/.test(p)) return frag.appendChild(document.createTextNode(' '));
          const w = document.createElement('span');
          w.className = 'w';
          const s = document.createElement('span');
          s.textContent = p;
          s.style.setProperty('--i', String(i++));
          w.appendChild(s);
          frag.appendChild(w);
        });
        n.parentNode!.replaceChild(frag, n);
      } else if (n.nodeType === 1 && (n as HTMLElement).tagName !== 'BR') walk(n);
    });
  };
  walk(el);
}

function initReveal() {
  const targets = $$('[data-reveal]');
  if (reduced) return targets.forEach((t) => t.classList.add('is-in'));
  targets.forEach((el) => {
    if (el.dataset.reveal === 'words') splitWords(el);
    if (el.dataset.reveal === 'stagger') Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));
    if (el.dataset.delay) el.style.setProperty('--d', el.dataset.delay);
  });
  // A fully clipped element has no visible area, so IntersectionObserver never reports it.
  // For `feed` reveals, watch the parent instead and reveal the child.
  const watched = new Map<Element, HTMLElement[]>();
  targets.forEach((t) => {
    const w = t.dataset.reveal === 'feed' && t.parentElement ? t.parentElement : t;
    watched.set(w, [...(watched.get(w) || []), t]);
  });
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting || e.boundingClientRect.top < 0) {
          watched.get(e.target)?.forEach((t) => t.classList.add('is-in'));
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  watched.forEach((_, w) => io.observe(w));
}

/* ---------- Registration-mark cursor ---------- */
function initCursor() {
  const el = document.getElementById('cursor');
  if (!fine || reduced || !el) return;
  const label = el.querySelector<HTMLElement>('.cursor__label')!;
  document.documentElement.classList.add('has-cursor');
  el.classList.add('is-hidden');
  addEventListener('pointermove', (e) => {
    el.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`;
    el.classList.remove('is-hidden');
  }, { passive: true });
  document.addEventListener('mouseleave', () => el.classList.add('is-hidden'));
  addEventListener('pointerdown', () => el.classList.add('is-down'));
  addEventListener('pointerup', () => el.classList.remove('is-down'));
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    el.classList.toggle('is-hidden', !!t.closest('input, textarea, select'));
    el.classList.toggle('is-link', !!t.closest('a, button, summary, label, [role="button"]'));
    const c = t.closest<HTMLElement>('[data-cursor]');
    if (c?.dataset.cursor) { label.textContent = c.dataset.cursor; el.classList.add('has-label'); }
    else el.classList.remove('has-label');
  });
}

/* ---------- Header: shadow, hide on scroll down, reading progress ---------- */
function initScroll() {
  const root = document.documentElement;
  const header = document.querySelector<HTMLElement>('.site-header');
  let last = scrollY, ticking = false;
  const run = () => {
    ticking = false;
    const y = scrollY, max = root.scrollHeight - innerHeight;
    root.style.setProperty('--progress', String(max > 0 ? y / max : 0));
    if (header) {
      header.classList.toggle('is-scrolled', y > 24);
      const open = header.dataset.menu === 'open';
      if (!reduced && !open && y > 320 && y > last + 4) header.classList.add('is-hidden');
      if (y < last - 4 || open) header.classList.remove('is-hidden');
    }
    last = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(run); } }, { passive: true });
  // Keyboard users tabbing into the header should always see it.
  header?.addEventListener('focusin', () => header.classList.remove('is-hidden'));
  run();
}

/* ---------- Counters ---------- */
function initCounters() {
  const els = $$('[data-count]');
  if (!els.length || reduced) return;
  const fmt = (el: HTMLElement, v: number) => Math.round(v) + (el.dataset.suffix || '');
  els.forEach((el) => (el.textContent = fmt(el, 0)));
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const el = e.target as HTMLElement, to = parseFloat(el.dataset.count!), t0 = performance.now(), dur = 1700;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      el.textContent = fmt(el, to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
}

/* ---------- Tilt + magnetic ---------- */
function initTilt() {
  if (!fine || reduced) return;
  $$('[data-tilt]').forEach((el) => {
    const zone = (el.closest('section, .service-head') as HTMLElement) || el;
    const max = parseFloat(el.dataset.tilt || '6');
    zone.addEventListener('pointermove', (e) => {
      const r = zone.getBoundingClientRect();
      el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * max * 2}deg`);
      el.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * max * 2}deg`);
    });
    zone.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
}
function initMagnetic() {
  if (!fine || reduced) return;
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px,${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
    });
    el.addEventListener('pointerleave', () => (el.style.transform = ''));
  });
}

/* ---------- CMYK halftone field behind the hero proof ---------- */
function initHalftone() {
  const c = document.getElementById('halftone') as HTMLCanvasElement | null;
  const ctx = c?.getContext('2d');
  if (!c || !ctx) return;
  let w = 0, h = 0, raf = 0, visible = true, lastMove = -1e9;
  let rect = c.getBoundingClientRect();
  const p = { x: -9999, y: -9999, tx: -9999, ty: -9999 };
  const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  const resize = () => {
    rect = c.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = rect.width; h = rect.height;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (reduced) draw(0);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    const g = w < 640 ? 12 : 16, maxR = g * 0.5;
    const cx = w * 0.5, cy = h * 0.5, R = Math.hypot(w, h) * 0.5;
    const infl = Math.max(110, Math.min(w, h) * 0.26);
    const base = new Path2D(), cyan = new Path2D(), mag = new Path2D();
    for (let y = g / 2; y < h; y += g) {
      for (let x = g / 2; x < w; x += g) {
        const d = Math.hypot(x - cx, y - cy);
        // Ink coverage falls off from the centre, with a slow ripple like a running press.
        let f = Math.max(0, 1 - d / R);
        f = Math.pow(f, 1.6) * (1 + 0.08 * Math.sin(t * 0.0015 + d * 0.03));
        const pd = Math.hypot(x - p.x, y - p.y);
        let q = 0;
        if (pd < infl) { q = 1 - pd / infl; q = q * q * (3 - 2 * q); }
        const r = Math.min(maxR, (f * 0.75 + q * 0.95) * maxR);
        if (r < 0.45) continue;
        const path = q > 0.55 ? mag : q > 0.2 ? cyan : base;
        path.moveTo(x + r, y);
        path.arc(x, y, r, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = css('--dot'); ctx.fill(base);
    ctx.fillStyle = css('--cyan'); ctx.fill(cyan);
    ctx.fillStyle = css('--magenta'); ctx.fill(mag);
  };

  const loop = (t: number) => {
    if (!visible) { raf = 0; return; }
    if (!fine || t - lastMove > 2200) {
      // Gentle autopilot for touch devices and idle desktops
      p.tx = w * 0.5 + Math.cos(t * 0.0007) * w * 0.3;
      p.ty = h * 0.5 + Math.sin(t * 0.0011) * h * 0.26;
    }
    p.x += (p.tx - p.x) * 0.14; p.y += (p.ty - p.y) * 0.14;
    draw(t);
    raf = requestAnimationFrame(loop);
  };

  resize();
  new ResizeObserver(resize).observe(c);
  // Redraw on theme change so dot colours follow the tokens.
  new MutationObserver(() => reduced && draw(0)).observe(document.documentElement, { attributeFilter: ['data-theme'] });
  if (reduced) return;
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(loop);
  }).observe(c);
  if (fine) addEventListener('pointermove', (e) => {
    rect = c.getBoundingClientRect();
    p.tx = e.clientX - rect.left; p.ty = e.clientY - rect.top; lastMove = performance.now();
  }, { passive: true });
}

document.documentElement.classList.add('motion');
initReveal();
initCursor();
initScroll();
initCounters();
initTilt();
initMagnetic();
initHalftone();
