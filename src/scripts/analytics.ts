// GA4 events. Every event goes two ways:
//  1. gtag('event', ...) so GA4 receives it today, and
//  2. a GTM-style dataLayer.push({ event, ... }) so a Tag Manager container can use the same events later.
//     gtag.js ignores plain objects in dataLayer, so nothing is counted twice.
// Never pass names, phone numbers, emails or message text: GA4's terms forbid personal data.

type Params = Record<string, string | number | boolean | undefined>;
declare global {
  interface Window { dataLayer: unknown[]; gtag?: (...args: unknown[]) => void }
}

window.dataLayer = window.dataLayer || [];

export function track(event: string, params: Params = {}, done?: () => void) {
  window.dataLayer.push({ event, ...params });
  if (!done) {
    window.gtag?.('event', event, params);
    return;
  }
  // When the page is about to leave (e.g. opening WhatsApp), wait for GA to confirm the hit,
  // but never more than 1s, and still continue if gtag is blocked or disabled.
  let called = false;
  const go = () => { if (!called) { called = true; done(); } };
  if (window.gtag) window.gtag('event', event, { ...params, transport_type: 'beacon', event_callback: go, event_timeout: 1000 });
  setTimeout(go, 1100);
}

/* ---------- Click tracking (delegated, covers every page) ---------- */
document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('a, button');
  if (!el) return;
  const href = el.getAttribute('href') || '';
  const area = el.closest('[data-track-area]')?.getAttribute('data-track-area') || 'body';

  // Direct contact links (not the quote form)
  if (href.startsWith('https://wa.me/')) track('click_whatsapp', { link_location: area });
  else if (href.startsWith('tel:')) track('click_call', { link_location: area });
  else if (href.startsWith('mailto:')) track('click_email', { link_location: area });

  // "Get a quote" buttons and other marked CTAs
  const cta = el.dataset.cta;
  if (cta) track('cta_click', { cta_name: cta, link_location: area, link_text: el.textContent?.trim() });

  // Service rows in lists
  const svc = el.dataset.service;
  if (svc) track('select_content', { content_type: 'service', content_id: svc, link_location: area });

  if (el.classList.contains('theme-toggle')) {
    // Read after the header script flips the theme.
    setTimeout(() => track('theme_change', { theme: document.documentElement.dataset.theme }), 0);
  }
});

/* ---------- FAQ opens ---------- */
document.querySelectorAll<HTMLDetailsElement>('.faq details').forEach((d) =>
  d.addEventListener('toggle', () => {
    if (d.open) track('faq_open', { question: d.querySelector('summary')?.textContent?.trim().slice(0, 100) });
  }),
);
