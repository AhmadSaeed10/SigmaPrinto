// Media library: upload (alt text required), grid, delete, and the picker used by image fields.
import { $, api, confirmDialog, formatBytes, h, mediaUrl, setBusy, toast } from './ui';

export interface MediaItem { name: string; path: string; alt: string; size: number }

const MAX = 4 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function loadMedia(): Promise<MediaItem[] | null> {
  const r = await api<{ items: MediaItem[] }>('/api/admin/media/');
  if (!r.ok) { toast(r.data.error || 'Could not load media', 'error'); return null; }
  return r.data.items;
}

/** Upload form. Calls onDone with the new item. */
export function uploadForm(onDone: (item: MediaItem) => void) {
  const file = h('input', { type: 'file', name: 'file', accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp', required: true, id: `up-${Math.random().toString(36).slice(2, 7)}` }) as HTMLInputElement;
  const alt = h('input', { type: 'text', name: 'alt', required: true, minlength: 3, maxlength: 140, placeholder: 'e.g. Flex banner on a shop front in Lahore', id: `alt-${file.id}` }) as HTMLInputElement;
  const fileErr = h('p', { class: 'f__err', id: `${file.id}-err` });
  const altErr = h('p', { class: 'f__err', id: `${alt.id}-err` });
  const preview = h('img', { class: 'up__preview', alt: '', hidden: true }) as HTMLImageElement;
  const btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Upload') as HTMLButtonElement;
  const drop = h('label', { class: 'up__drop', for: file.id },
    preview, h('span', {}, h('b', {}, 'Choose an image'), ' or drop it here'), h('small', {}, 'JPG, PNG or WebP, up to 4 MB. Saved as WebP, max 2000px wide.'));

  const check = () => {
    fileErr.textContent = '';
    const f = file.files?.[0];
    if (!f) return 'Choose an image';
    if (!TYPES.includes(f.type)) return 'Only JPG, PNG or WebP images are allowed';
    if (f.size > MAX) return `That file is ${formatBytes(f.size)}. The limit is 4 MB.`;
    return '';
  };
  file.addEventListener('change', () => {
    const err = check();
    fileErr.textContent = err;
    const f = file.files?.[0];
    if (f && !err) { preview.src = URL.createObjectURL(f); preview.hidden = false; }
    if (f && !alt.value) alt.focus();
  });
  for (const ev of ['dragover', 'dragenter']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) { const dt = new DataTransfer(); dt.items.add(f); file.files = dt.files; file.dispatchEvent(new Event('change')); }
  });

  const form = h('form', { class: 'up', novalidate: true },
    file, drop, fileErr,
    h('div', { class: 'f' }, h('label', { for: alt.id }, 'Alt text ', h('span', { class: 'req', 'aria-hidden': 'true' }, '*')), alt,
      h('p', { class: 'f__help' }, 'Describe what is in the image for people who cannot see it.'), altErr),
    btn) as HTMLFormElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fe = check();
    const ae = alt.value.trim().length < 3 ? 'Alt text is required (at least 3 characters)' : '';
    fileErr.textContent = fe; altErr.textContent = ae;
    alt.setAttribute('aria-invalid', String(!!ae));
    if (fe || ae) return (fe ? drop : alt).focus();
    const fd = new FormData();
    fd.append('file', file.files![0]);
    fd.append('alt', alt.value.trim());
    setBusy(btn, true, 'Uploading…');
    const r = await api<{ item: MediaItem }>('/api/admin/media/', { form: fd });
    setBusy(btn, false);
    if (!r.ok) {
      if (r.data.errors) { fileErr.textContent = r.data.errors.file ?? ''; altErr.textContent = r.data.errors.alt ?? ''; }
      toast(r.data.error || 'Upload failed. Check the highlighted fields.', 'error');
      return;
    }
    toast('Image uploaded. Live in about 1 to 2 minutes.');
    form.reset(); preview.hidden = true;
    onDone(r.data.item);
  });
  return form;
}

function tile(item: MediaItem, opts: { onPick?: (i: MediaItem) => void; onDelete?: (i: MediaItem) => void }) {
  const img = h('img', { src: mediaUrl(item.path), alt: item.alt, loading: 'lazy', decoding: 'async' });
  return h('li', { class: 'tile', dataset: { name: item.name } },
    opts.onPick
      ? h('button', { type: 'button', class: 'tile__pick', onclick: () => opts.onPick!(item), 'aria-label': `Use ${item.alt || item.name}` }, img)
      : h('div', { class: 'tile__img' }, img),
    h('div', { class: 'tile__meta' },
      h('p', { class: 'tile__alt', title: item.alt }, item.alt || h('em', {}, 'No alt text')),
      h('p', { class: 'tile__name' }, `${item.name} · ${formatBytes(item.size)}`)),
    opts.onDelete ? h('button', { type: 'button', class: 'btn btn--sm btn--ghost-danger', onclick: () => opts.onDelete!(item) }, 'Delete') : null);
}

/** Full media page. */
export async function mediaPage(root: HTMLElement) {
  const grid = h('ul', { class: 'tiles' });
  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search by alt text or file name', 'aria-label': 'Search media' }) as HTMLInputElement;
  const count = h('p', { class: 'muted' });
  let items: MediaItem[] = [];

  const render = () => {
    const q = search.value.trim().toLowerCase();
    const shown = items.filter((i) => !q || `${i.alt} ${i.name}`.toLowerCase().includes(q));
    grid.replaceChildren(...shown.map((i) => tile(i, { onDelete: remove })));
    count.textContent = `${shown.length} of ${items.length} image${items.length === 1 ? '' : 's'}`;
    if (!items.length) grid.replaceChildren(h('li', { class: 'empty' }, 'No images yet. Upload the first one above.'));
  };
  const remove = async (item: MediaItem) => {
    const ok = await confirmDialog({ title: 'Delete this image?', body: `${item.alt || item.name} will be removed from the site after the next deploy. Images still used by a service or guide cannot be deleted.`, confirm: 'Delete image', danger: true });
    if (!ok) return;
    const r = await api('/api/admin/media/', { method: 'DELETE', json: { name: item.name } });
    if (!r.ok) return toast(r.data.error || 'Could not delete the image', 'error');
    items = items.filter((i) => i.name !== item.name);
    render();
    toast('Image deleted. Live in about 1 to 2 minutes.');
  };
  search.addEventListener('input', render);

  root.append(
    h('section', { class: 'card' }, h('h2', {}, 'Upload an image'), uploadForm((item) => { items = [item, ...items]; render(); })),
    h('section', { class: 'card' }, h('div', { class: 'bar' }, h('h2', {}, 'Library'), search), count, grid),
  );
  grid.replaceChildren(h('li', { class: 'empty' }, 'Loading…'));
  items = (await loadMedia()) ?? [];
  render();
}

/** Modal picker for image fields. Resolves with the chosen item, or null. */
export function pickImage(): Promise<MediaItem | null> {
  return new Promise(async (resolve) => {
    let chosen: MediaItem | null = null;
    const grid = h('ul', { class: 'tiles tiles--pick' }, h('li', { class: 'empty' }, 'Loading…'));
    const search = h('input', { type: 'search', class: 'search', placeholder: 'Search', 'aria-label': 'Search media' }) as HTMLInputElement;
    let items: MediaItem[] = [];
    const pick = (i: MediaItem) => { chosen = i; dlg.close(); };
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const shown = items.filter((i) => !q || `${i.alt} ${i.name}`.toLowerCase().includes(q));
      grid.replaceChildren(...(shown.length ? shown.map((i) => tile(i, { onPick: pick })) : [h('li', { class: 'empty' }, items.length ? 'No matches' : 'No images yet. Upload one below.')]));
    };
    search.addEventListener('input', render);
    const dlg = h('dialog', { class: 'dlg dlg--wide', 'aria-label': 'Choose an image' },
      h('div', { class: 'bar' }, h('h2', {}, 'Choose an image'), h('button', { type: 'button', class: 'iconbtn', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
      search, grid,
      h('details', { class: 'dlg__upload' }, h('summary', {}, 'Upload a new image'), uploadForm((item) => pick(item)))) as HTMLDialogElement;
    document.body.append(dlg);
    dlg.addEventListener('close', () => { resolve(chosen); dlg.remove(); });
    dlg.showModal();
    items = (await loadMedia()) ?? [];
    render();
    $('input', dlg)?.focus();
  });
}
