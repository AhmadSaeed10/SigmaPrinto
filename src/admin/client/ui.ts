// Admin UI helpers (browser). No secrets here: everything privileged happens in /api/admin.

export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s);
export const $$ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => Array.from(r.querySelectorAll<T>(s));

/** Tiny element builder: h('div', { class: 'x', onclick }, child, 'text') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const pageData = <T = any>(): T => JSON.parse($('#page-data')?.textContent || '{}');

/* ---------- Toasts ---------- */
export function toast(message: string, kind: 'ok' | 'error' | 'info' = 'ok', opts: { sticky?: boolean; action?: { label: string; run: () => void } } = {}) {
  const box = $('.toasts')!;
  const close = h('button', { class: 'toast__x', type: 'button', 'aria-label': 'Dismiss', onclick: () => t.remove() }, '×');
  const t = h('div', { class: `toast toast--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('span', {}, message),
    opts.action ? h('button', { class: 'toast__act', type: 'button', onclick: opts.action.run }, opts.action.label) : null,
    close);
  box.append(t);
  if (!opts.sticky) setTimeout(() => t.remove(), kind === 'error' ? 8000 : 4500);
  return t;
}

/** Show a toast after the next page load (used after redirects). */
export function flash(message: string) { try { sessionStorage.setItem('admin-flash', message); } catch {} }
export function showFlash() {
  try {
    const m = sessionStorage.getItem('admin-flash');
    if (m) { sessionStorage.removeItem('admin-flash'); toast(m); }
  } catch {}
}

/* ---------- API ---------- */
export interface ApiResult<T = any> { ok: boolean; status: number; data: T & { error?: string; errors?: Record<string, string>; conflict?: boolean } }
export async function api<T = any>(path: string, opts: { method?: string; json?: unknown; form?: FormData } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: opts.method ?? (opts.json || opts.form ? 'POST' : 'GET'),
      headers: opts.json ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.form ?? (opts.json ? JSON.stringify(opts.json) : undefined),
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      toast('Your session has ended. Log in again.', 'error', { sticky: true, action: { label: 'Log in', run: () => (location.href = `/admin/login/?next=${encodeURIComponent(location.pathname)}`) } });
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Network error. Check your connection and try again.' } as any };
  }
}

/** Show the standard conflict message with a reload action. */
export function conflictToast(message?: string) {
  toast(message || 'This was changed somewhere else since you opened it. Reload to get the latest version, then make your change again.', 'error', {
    sticky: true,
    action: { label: 'Reload', run: () => { dirty.set(false); location.reload(); } },
  });
}

/* ---------- Confirm dialog ---------- */
export function confirmDialog(opts: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', { class: 'dlg' },
      h('form', { method: 'dialog' },
        h('h2', {}, opts.title),
        h('p', {}, opts.body),
        h('div', { class: 'dlg__actions' },
          h('button', { class: 'btn', value: 'cancel', type: 'submit' }, 'Cancel'),
          h('button', { class: `btn ${opts.danger ? 'btn--danger' : 'btn--primary'}`, value: 'ok', type: 'submit' }, opts.confirm))));
    document.body.append(dlg);
    dlg.addEventListener('close', () => { resolve(dlg.returnValue === 'ok'); dlg.remove(); });
    (dlg as HTMLDialogElement).showModal();
    ($('button[value="cancel"]', dlg) as HTMLButtonElement).focus();
  });
}

/* ---------- Unsaved changes guard ---------- */
export const dirty = {
  value: false,
  set(v: boolean) {
    this.value = v;
    document.body.classList.toggle('is-dirty', v);
  },
};
addEventListener('beforeunload', (e) => {
  if (dirty.value) { e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest('a');
  if (!a || !dirty.value || a.target === '_blank' || e.defaultPrevented) return;
  if (!confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  else dirty.set(false);
});

export function setBusy(btn: HTMLButtonElement, busy: boolean, label?: string) {
  if (busy) { btn.dataset.label = btn.textContent || ''; btn.textContent = label || 'Saving…'; }
  else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  btn.disabled = busy;
  btn.setAttribute('aria-busy', String(busy));
}

export const slugify = (s: string) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '');

export const mediaUrl = (path: string) => `/api/admin/media-file/?name=${encodeURIComponent(path.replace(/^.*\//, ''))}`;
export const formatBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
