// Admin entry point: picks the view for the current page.
import { editorPage } from './editor';
import { mediaPage } from './media';
import { $, api, confirmDialog, conflictToast, h, pageData, showFlash, toast } from './ui';

const page = document.body.dataset.page;
const view = $('#view');
const data = pageData();

/* ---------- Mobile nav ---------- */
const navBtn = $<HTMLButtonElement>('.navtoggle');
navBtn?.addEventListener('click', () => {
  const open = document.body.classList.toggle('nav-open');
  navBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('nav-open')) { document.body.classList.remove('nav-open'); navBtn?.setAttribute('aria-expanded', 'false'); navBtn?.focus(); }
});

showFlash();

/* ---------- Login ---------- */
if (page === 'login') {
  const form = $<HTMLFormElement>('#login-form')!;
  const err = $('#login-error')!;
  const btn = $<HTMLButtonElement>('button[type=submit]', form)!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
    btn.disabled = true; btn.textContent = 'Checking…'; err.textContent = '';
    const r = await api<{ next: string }>('/api/admin/login/', { json: { email, password, next: data.next } });
    if (r.ok) { location.href = r.data.next || '/admin/'; return; }
    btn.disabled = false; btn.textContent = 'Log in';
    err.textContent = r.data.error || 'Invalid email or password';
    (form.elements.namedItem('password') as HTMLInputElement).select();
  });
}

/* ---------- Dashboard ---------- */
if (page === 'dashboard' && view) {
  view.append(
    h('ul', { class: 'cards' }, ...data.cards.map((c: any) => h('li', {},
      h('a', { class: 'stat', href: c.href },
        h('span', { class: 'stat__label' }, c.label),
        h('span', { class: 'stat__num' }, c.count === null ? 'Edit' : String(c.count)))))),
    h('section', { class: 'card' },
      h('h2', {}, 'How saving works'),
      h('ol', { class: 'steps-list' },
        h('li', {}, 'Every save is a commit to ', h('code', {}, `${data.repo}`), ' on ', h('code', {}, data.branch), '.'),
        h('li', {}, 'Vercel rebuilds the site automatically. Changes are live in about 1 to 2 minutes.'),
        h('li', {}, 'If two people edit the same item, the second save is stopped and asked to reload, so nothing is overwritten.'))),
  );
}

/* ---------- List ---------- */
if (page === 'list' && view) {
  const { type, items } = data as { type: any; items: any[] };
  const search = h('input', { type: 'search', class: 'search', placeholder: `Search ${type.label.toLowerCase()}`, 'aria-label': `Search ${type.label}` }) as HTMLInputElement;
  const list = h('ul', { class: 'list' });
  const count = h('p', { class: 'muted', 'aria-live': 'polite' });
  let rows = [...items];

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter((i) => !q || `${i.title} ${i.subtitle} ${i.id}`.toLowerCase().includes(q));
    count.textContent = `${shown.length} of ${rows.length}`;
    list.replaceChildren(...(shown.length ? shown.map((i) => h('li', { class: 'list__row' },
      h('a', { class: 'list__main', href: `/admin/${type.key}/${i.id}/` },
        h('span', { class: 'list__title' }, i.title, i.draft ? h('span', { class: 'badge' }, 'Draft') : null),
        h('span', { class: 'list__sub' }, i.subtitle || i.id)),
      h('span', { class: 'list__meta' }, typeof i.sort === 'number' ? `Order ${i.sort}` : String(i.sort ?? '')),
      h('div', { class: 'list__actions' },
        type.publicPath && !i.draft ? h('a', { class: 'btn btn--sm btn--ghost', href: `${type.publicPath}${i.id}/`, target: '_blank', rel: 'noopener', 'aria-label': `View ${i.title} on the site` }, 'View') : null,
        h('a', { class: 'btn btn--sm btn--ghost', href: `/admin/${type.key}/new/?from=${i.id}`, 'aria-label': `Duplicate ${i.title}` }, 'Duplicate'),
        h('button', { type: 'button', class: 'btn btn--sm btn--ghost-danger', 'aria-label': `Delete ${i.title}`, onclick: () => remove(i) }, 'Delete'))))
      : [h('li', { class: 'empty' }, rows.length ? 'No matches.' : `No ${type.label.toLowerCase()} yet.`)]));
  };
  const remove = async (i: any) => {
    const ok = await confirmDialog({ title: `Delete "${i.title}"?`, body: `This ${type.singular} is removed from the site after the next deploy. It stays in the Git history if you need it back.`, confirm: `Delete ${type.singular}`, danger: true });
    if (!ok) return;
    const r = await api('/api/admin/entry/', { method: 'DELETE', json: { type: type.key, id: i.id, sha: i.sha } });
    if (r.status === 409) return conflictToast(r.data.error);
    if (!r.ok) return toast(r.data.error || 'Could not delete', 'error');
    rows = rows.filter((x) => x.id !== i.id);
    render();
    toast(`Deleted "${i.title}". Live in about 1 to 2 minutes.`);
  };
  search.addEventListener('input', render);
  view.append(h('section', { class: 'card' },
    h('div', { class: 'bar' }, search, h('a', { class: 'btn btn--primary', href: `/admin/${type.key}/new/` }, `+ New ${type.singular}`)),
    count, list));
  render();
}

/* ---------- Editor / Media ---------- */
if (page === 'editor' && view) editorPage(view, data);
if (page === 'media' && view) mediaPage(view);
