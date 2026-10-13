// Entry editor: a form generated from the schema descriptors sent by the server.
import { marked } from 'marked';
import type { Field } from '../describe';
import { pickImage } from './media';
import { $, $$, api, confirmDialog, conflictToast, dirty, flash, h, mediaUrl, setBusy, slugify, toast } from './ui';

type Obj = Record<string, any>;
interface EditorData {
  type: { key: string; label: string; singular: string; kind: 'collection' | 'singleton'; publicPath?: string; bodyLabel?: string; bodyHelp?: string; titleField?: string; help?: string };
  fields: Field[];
  entry: { id: string; sha: string | null; data: Obj; body: string };
  mode: 'create' | 'update';
}

const reqMark = () => h('span', { class: 'req', 'aria-hidden': 'true' }, '*');
const fid = (path: string) => `f-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;

export function editorPage(root: HTMLElement, d: EditorData) {
  const { type, fields } = d;
  let mode = d.mode;
  let sha = d.entry.sha;
  let id = d.entry.id;
  const state: Obj = structuredClone(d.entry.data ?? {});
  let body = d.entry.body ?? '';
  const isCollection = type.kind === 'collection';
  const change = () => { dirty.set(true); status.textContent = 'Unsaved changes'; };

  /* ---------- field renderers ---------- */
  function fieldEl(f: Field, obj: Obj, path: string): HTMLElement {
    const id = fid(path);
    const err = h('p', { class: 'f__err', id: `${id}-err` });
    const help = f.help ? h('p', { class: 'f__help', id: `${id}-help` }, f.help) : null;
    const describedBy = [f.help ? `${id}-help` : '', `${id}-err`].filter(Boolean).join(' ');
    const label = h('label', { for: id }, f.label, f.required ? reqMark() : null);
    const wrap = h('div', { class: `f f--${f.kind}`, dataset: { path } });
    const set = (v: unknown) => { obj[f.name] = v; change(); };
    let control: HTMLElement;

    switch (f.kind) {
      case 'textarea': {
        const ta = h('textarea', { id, rows: 3, maxlength: f.max, required: f.required, 'aria-describedby': describedBy }) as HTMLTextAreaElement;
        ta.value = obj[f.name] ?? '';
        ta.addEventListener('input', () => { set(ta.value); grow(ta); counter(); });
        requestAnimationFrame(() => grow(ta));
        control = ta;
        break;
      }
      case 'number': {
        const inp = h('input', { id, type: 'number', inputmode: 'numeric', min: f.min, max: f.max, step: f.int ? 1 : 'any', required: f.required, 'aria-describedby': describedBy }) as HTMLInputElement;
        inp.value = obj[f.name] ?? '';
        inp.addEventListener('input', () => set(inp.value === '' ? undefined : Number(inp.value)));
        control = inp;
        break;
      }
      case 'date': {
        const inp = h('input', { id, type: 'date', required: f.required, 'aria-describedby': describedBy }) as HTMLInputElement;
        inp.value = obj[f.name] ?? '';
        inp.addEventListener('input', () => set(inp.value || undefined));
        control = inp;
        break;
      }
      case 'boolean': {
        const inp = h('input', { id, type: 'checkbox', role: 'switch', 'aria-describedby': describedBy }) as HTMLInputElement;
        inp.checked = Boolean(obj[f.name] ?? f.default);
        inp.addEventListener('change', () => set(inp.checked));
        wrap.append(h('div', { class: 'switch' }, inp, label), help ?? '', err);
        return wrap;
      }
      case 'select': {
        const sel = h('select', { id, required: f.required, 'aria-describedby': describedBy },
          f.required ? null : h('option', { value: '' }, '—'),
          ...(f.options ?? []).map((o) => h('option', { value: o, selected: obj[f.name] === o }, o))) as HTMLSelectElement;
        sel.addEventListener('change', () => set(sel.value || undefined));
        control = sel;
        break;
      }
      case 'tags': control = tagsEl(f, obj, id, describedBy, set); break;
      case 'image': control = imageEl(f, obj, path, id, set); break;
      case 'list': return listEl(f, obj, path);
      default: {
        const inp = h('input', { id, type: f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text', maxlength: f.max, required: f.required, 'aria-describedby': describedBy }) as HTMLInputElement;
        inp.value = obj[f.name] ?? '';
        inp.addEventListener('input', () => { set(inp.value); counter(); });
        control = inp;
      }
    }
    const count = f.max && (f.kind === 'text' || f.kind === 'textarea') ? h('span', { class: 'f__count', 'aria-hidden': 'true' }) : null;
    function counter() {
      if (!count) return;
      const n = String(obj[f.name] ?? '').length;
      count.textContent = `${n}/${f.max}`;
      count.classList.toggle('is-over', n > (f.max ?? Infinity) || (f.min !== undefined && n > 0 && n < f.min));
    }
    counter();
    wrap.append(h('div', { class: 'f__head' }, label, count), control, help ?? '', err);
    return wrap;
  }

  function tagsEl(f: Field, obj: Obj, id: string, describedBy: string, set: (v: unknown) => void) {
    const list: string[] = Array.isArray(obj[f.name]) ? [...obj[f.name]] : [];
    const chips = h('ul', { class: 'tags__list' });
    const input = h('input', { id, type: 'text', maxlength: f.itemMax, placeholder: 'Type and press Enter', 'aria-describedby': describedBy }) as HTMLInputElement;
    const render = () => {
      chips.replaceChildren(...list.map((t, i) => h('li', { class: 'tag' }, t,
        h('button', { type: 'button', 'aria-label': `Remove ${t}`, onclick: () => { list.splice(i, 1); commit(); input.focus(); } }, '×'))));
    };
    const commit = () => { set([...list]); render(); };
    const add = () => {
      const v = input.value.replace(/,$/, '').trim();
      if (v && !list.includes(v)) { list.push(v); commit(); }
      input.value = '';
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
      if (e.key === 'Backspace' && !input.value && list.length) { list.pop(); commit(); }
    });
    input.addEventListener('blur', add);
    render();
    return h('div', { class: 'tags' }, chips, input);
  }

  function imageEl(f: Field, obj: Obj, path: string, id: string, set: (v: unknown) => void) {
    const box = h('div', { class: 'imgf' });
    // Sibling alt field: "<name>Alt" at the same level, or "alt" inside a gallery row.
    const altName = `${f.name}Alt` in Object.fromEntries((siblings(path) ?? []).map((s) => [s.name, 1])) ? `${f.name}Alt` : 'alt';
    const render = () => {
      const v = obj[f.name];
      box.replaceChildren(
        v ? h('img', { class: 'imgf__thumb', src: mediaUrl(v), alt: '' }) : h('div', { class: 'imgf__empty' }, 'No image'),
        h('div', { class: 'imgf__btns' },
          h('button', { type: 'button', class: 'btn btn--sm', id, onclick: choose }, v ? 'Change' : 'Choose image'),
          v && !f.required ? h('button', { type: 'button', class: 'btn btn--sm btn--ghost', onclick: () => { set(undefined); render(); } }, 'Remove') : null,
          v ? h('span', { class: 'imgf__name' }, String(v).replace(/^.*\//, '')) : null));
    };
    async function choose() {
      const item = await pickImage();
      if (!item) return;
      set(item.path);
      render();
      // Prefill the alt text from the media library when it is empty.
      // Never touch a field that already has text or that the person is typing in.
      const altInput = $<HTMLInputElement>(`[data-path="${path.replace(/[^.]+$/, altName)}"] input`, root);
      if (item.alt && !obj[altName] && altInput && !altInput.value.trim() && document.activeElement !== altInput) {
        altInput.value = item.alt;
        altInput.dispatchEvent(new Event('input'));
      }
    }
    render();
    return box;
  }

  /** Fields that sit next to the one at `path` (same object level). */
  function siblings(path: string): Field[] | null {
    const parts = path.split('.');
    if (parts.length === 1) return fields;
    const list = fields.find((x) => x.name === parts[0]);
    return list?.fields ?? null;
  }

  function listEl(f: Field, obj: Obj, path: string): HTMLElement {
    if (!Array.isArray(obj[f.name])) obj[f.name] = [];
    const rows: Obj[] = obj[f.name];
    const wrap = h('fieldset', { class: 'f f--list', dataset: { path } });
    const singular = f.itemLabel ?? (f.label.replace(/s$/, '').toLowerCase() || 'item');
    const render = (focusIndex?: number) => {
      const list = h('ol', { class: 'rows' },
        ...rows.map((row, i) => h('li', { class: 'row' },
          h('div', { class: 'row__head' },
            h('span', { class: 'row__n' }, `${i + 1}`),
            h('div', { class: 'row__tools' },
              h('button', { type: 'button', class: 'iconbtn', 'aria-label': `Move ${singular} ${i + 1} up`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
              h('button', { type: 'button', class: 'iconbtn', 'aria-label': `Move ${singular} ${i + 1} down`, disabled: i === rows.length - 1, onclick: () => move(i, 1) }, '↓'),
              h('button', { type: 'button', class: 'iconbtn iconbtn--danger', 'aria-label': `Remove ${singular} ${i + 1}`, onclick: () => removeRow(i) }, '×'))),
          ...(f.fields ?? []).map((sf) => fieldEl(sf, row, `${path}.${i}.${sf.name}`)))));
      wrap.replaceChildren(
        h('legend', {}, f.label, f.required ? reqMark() : null),
        f.help ? h('p', { class: 'f__help' }, f.help) : '',
        h('p', { class: 'f__err', id: `${fid(path)}-err` }),
        rows.length ? list : h('p', { class: 'muted' }, 'None yet.'),
        h('button', { type: 'button', class: 'btn btn--sm', disabled: f.max !== undefined && rows.length >= f.max, onclick: addRow }, `+ Add ${singular}`));
      if (focusIndex !== undefined) $$<HTMLElement>('.row', wrap)[focusIndex]?.querySelector<HTMLElement>('input, textarea, button.btn')?.focus();
    };
    const move = (i: number, by: number) => { const [r] = rows.splice(i, 1); rows.splice(i + by, 0, r); change(); render(i + by); };
    const removeRow = async (i: number) => {
      const hasContent = Object.values(rows[i] ?? {}).some((v) => v !== '' && v != null);
      if (hasContent && !(await confirmDialog({ title: `Remove ${singular} ${i + 1}?`, body: 'It is removed when you save.', confirm: 'Remove', danger: true }))) return;
      rows.splice(i, 1); change(); render();
    };
    const addRow = () => { rows.push({}); change(); render(rows.length - 1); };
    render();
    return wrap;
  }

  function grow(ta: HTMLTextAreaElement) { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 480)}px`; }

  /* ---------- markdown body ---------- */
  function markdownEl() {
    const ta = h('textarea', { id: 'f-body', class: 'md__input', rows: 14, spellcheck: true, 'aria-describedby': 'f-body-help f-body-err' }) as HTMLTextAreaElement;
    ta.value = body;
    ta.addEventListener('input', () => { body = ta.value; change(); });
    const preview = h('div', { class: 'md__preview prose', hidden: true, tabindex: 0, 'aria-label': 'Preview' });
    const tabWrite = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true', onclick: () => show(false) }, 'Write');
    const tabPrev = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false', onclick: () => show(true) }, 'Preview');
    function show(p: boolean) {
      tabWrite.setAttribute('aria-selected', String(!p)); tabPrev.setAttribute('aria-selected', String(p));
      ta.hidden = p; preview.hidden = !p; tools.hidden = p;
      if (p) preview.innerHTML = safeHtml(marked.parse(body || '*Nothing written yet.*', { async: false }) as string);
    }
    const wrapSel = (before: string, after = before, placeholder = 'text') => {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const sel = value.slice(s, e) || placeholder;
      ta.setRangeText(before + sel + after, s, e, 'select');
      ta.focus(); ta.dispatchEvent(new Event('input'));
    };
    const linePrefix = (p: string) => {
      const s = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
      ta.setRangeText(p, s, s, 'end'); ta.focus(); ta.dispatchEvent(new Event('input'));
    };
    const tools = h('div', { class: 'md__tools', role: 'toolbar', 'aria-label': 'Formatting' },
      h('button', { type: 'button', title: 'Bold', onclick: () => wrapSel('**') }, h('b', {}, 'B')),
      h('button', { type: 'button', title: 'Italic', onclick: () => wrapSel('_') }, h('i', {}, 'I')),
      h('button', { type: 'button', title: 'Heading', onclick: () => linePrefix('## ') }, 'H2'),
      h('button', { type: 'button', title: 'Bulleted list', onclick: () => linePrefix('- ') }, '• List'),
      h('button', { type: 'button', title: 'Link', onclick: () => wrapSel('[', '](https://)', 'link text') }, 'Link'));
    return h('div', { class: 'f md', dataset: { path: 'body' } },
      h('div', { class: 'f__head' }, h('label', { for: 'f-body' }, type.bodyLabel ?? 'Body'),
        h('div', { class: 'md__tabs', role: 'tablist' }, tabWrite, tabPrev)),
      tools, ta, preview,
      type.bodyHelp ? h('p', { class: 'f__help', id: 'f-body-help' }, type.bodyHelp) : '',
      h('p', { class: 'f__err', id: 'f-body-err' }));
  }

  /* ---------- slug ---------- */
  let slugTouched = false;
  const slugInput = h('input', { id: 'f-slug', type: 'text', maxlength: 64, pattern: '[a-z0-9]+(-[a-z0-9]+)*', required: true, 'aria-describedby': 'f-slug-help f-slug-err' }) as HTMLInputElement;
  const slugPreview = h('code', {});
  const syncSlug = () => { slugPreview.textContent = `${type.publicPath ?? '/'}${slugInput.value || '…'}/`; };
  function slugEl() {
    slugInput.value = id || slugify(String(state[type.titleField ?? 'title'] ?? ''));
    slugInput.readOnly = mode === 'update';
    slugInput.addEventListener('input', () => { slugTouched = true; slugInput.value = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'); syncSlug(); change(); });
    syncSlug();
    return h('div', { class: 'f', dataset: { path: 'slug' } },
      h('label', { for: 'f-slug' }, 'URL slug', mode === 'create' ? reqMark() : null),
      slugInput,
      h('p', { class: 'f__help', id: 'f-slug-help' }, 'Page address: ', slugPreview,
        mode === 'update' ? '. Fixed after creation; to change it, duplicate and delete the old one.' : ''),
      h('p', { class: 'f__err', id: 'f-slug-err' }));
  }

  /* ---------- layout ---------- */
  const status = h('span', { class: 'savebar__status', 'aria-live': 'polite' }, mode === 'create' ? 'Not saved yet' : 'All changes saved');
  const saveBtn = h('button', { type: 'submit', class: 'btn btn--primary', form: 'entry-form' }, mode === 'create' ? `Create ${type.singular}` : 'Save') as HTMLButtonElement;
  const viewLink = () => isCollection && mode === 'update' && type.publicPath ? h('a', { class: 'btn btn--ghost', href: `${type.publicPath}${id}/`, target: '_blank', rel: 'noopener' }, 'View ↗') : null;
  const moreBtns = () => isCollection && mode === 'update' ? [
    h('a', { class: 'btn btn--ghost', href: `/admin/${type.key}/new/?from=${id}` }, 'Duplicate'),
    h('button', { type: 'button', class: 'btn btn--ghost-danger', onclick: remove }, 'Delete'),
  ] : [];
  const bar = h('div', { class: 'savebar' });
  const renderBar = () => bar.replaceChildren(status, h('div', { class: 'savebar__btns' }, viewLink(), ...moreBtns(), saveBtn));
  renderBar();

  const main = h('div', { class: 'card form__main' });
  const side = h('div', { class: 'form__side' });
  const form = h('form', { id: 'entry-form', class: 'form', novalidate: true }, main, side) as HTMLFormElement;

  if (type.help) main.append(h('p', { class: 'muted' }, type.help));
  // Long text, lists and the body go in the main column; short settings in the side card.
  const sideKinds = new Set(['number', 'date', 'boolean', 'select', 'image']);
  const sideCard = h('div', { class: 'card' });
  if (isCollection) sideCard.append(slugEl());
  for (const f of fields) {
    const el = fieldEl(f, state, f.name);
    (isCollection && sideKinds.has(f.kind) && f.name !== 'image' ? sideCard : main).append(el);
    if (f.name === type.titleField && mode === 'create') {
      el.querySelector('input')?.addEventListener('input', () => { if (!slugTouched) { slugInput.value = slugify(String(state[f.name] ?? '')); syncSlug(); } });
    }
  }
  if (isCollection) main.append(markdownEl());
  if (sideCard.childElementCount) side.append(sideCard);
  if (!side.childElementCount) form.classList.add('form--single');

  root.append(bar, form);

  /* ---------- save / delete ---------- */
  function showErrors(errors: Record<string, string>) {
    $$('.has-error', root).forEach((e) => e.classList.remove('has-error'));
    $$('.f__err', root).forEach((e) => (e.textContent = ''));
    $$('[aria-invalid="true"]', root).forEach((e) => e.removeAttribute('aria-invalid'));
    let first: HTMLElement | null = null;
    for (const [path, msg] of Object.entries(errors)) {
      let wrap = $<HTMLElement>(`[data-path="${CSS.escape(path)}"]`, root);
      // Fall back to the nearest parent path (e.g. a list) if the exact field is not rendered.
      for (let p = path; !wrap && p.includes('.'); ) { p = p.replace(/\.[^.]+$/, ''); wrap = $<HTMLElement>(`[data-path="${CSS.escape(p)}"]`, root); }
      if (!wrap) { toast(msg, 'error'); continue; }
      wrap.classList.add('has-error');
      const err = $<HTMLElement>(':scope > .f__err', wrap) ?? $<HTMLElement>('.f__err', wrap);
      if (err) err.textContent = msg;
      const ctl = $<HTMLElement>('input, textarea, select, button', wrap);
      ctl?.setAttribute('aria-invalid', 'true');
      first ??= ctl ?? wrap;
    }
    first?.focus();
    first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function save(e?: Event) {
    e?.preventDefault();
    if (saveBtn.disabled) return;
    const slug = slugInput.value.trim();
    if (isCollection && mode === 'create' && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return showErrors({ slug: 'Use lowercase letters, numbers and dashes only' });
    setBusy(saveBtn, true);
    status.textContent = 'Saving…';
    const r = await api('/api/admin/entry/', { json: { type: type.key, id: isCollection ? (mode === 'create' ? slug : id) : undefined, sha, data: state, body, mode } });
    setBusy(saveBtn, false);
    if (r.status === 409 || r.data.conflict) { status.textContent = 'Not saved'; return conflictToast(r.data.error); }
    if (!r.ok) {
      status.textContent = 'Not saved';
      if (r.data.errors) { showErrors(r.data.errors); toast(`Fix ${Object.keys(r.data.errors).length === 1 ? 'the highlighted field' : 'the highlighted fields'} and save again.`, 'error'); }
      else toast(r.data.error || 'Could not save. Try again.', 'error');
      return;
    }
    showErrors({});
    sha = r.data.sha;
    dirty.set(false);
    status.textContent = 'Saved';
    toast('Saved. Live in about 1 to 2 minutes.');
    if (mode === 'create') {
      mode = 'update'; id = r.data.id;
      slugInput.readOnly = true;
      saveBtn.textContent = 'Save';
      history.replaceState(null, '', `/admin/${type.key}/${id}/`);
      document.title = `${state[type.titleField ?? 'title'] ?? id} | SigmaPrinto admin`;
      $('.top h1')!.textContent = String(state[type.titleField ?? 'title'] ?? id);
      renderBar();
    }
  }

  async function remove() {
    const name = String(state[type.titleField ?? 'title'] ?? id);
    const ok = await confirmDialog({ title: `Delete "${name}"?`, body: `This ${type.singular} is removed from the site after the next deploy. It stays in the Git history if you need it back.`, confirm: `Delete ${type.singular}`, danger: true });
    if (!ok) return;
    const r = await api('/api/admin/entry/', { method: 'DELETE', json: { type: type.key, id, sha } });
    if (r.status === 409) return conflictToast(r.data.error);
    if (!r.ok) return toast(r.data.error || 'Could not delete. Try again.', 'error');
    dirty.set(false);
    flash(`Deleted "${name}". Live in about 1 to 2 minutes.`);
    location.href = `/admin/${type.key}/`;
  }

  form.addEventListener('submit', save);
  addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
}

/** Strip scripts, event handlers and javascript: URLs from the markdown preview. */
function safeHtml(html: string) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta, form').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('on') || (/^(href|src|xlink:href)$/.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  return doc.body.firstElementChild?.innerHTML ?? '';
}
