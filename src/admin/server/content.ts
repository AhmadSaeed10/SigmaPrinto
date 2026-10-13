// Server-only. Reads, validates and serialises admin content. All IO goes through GitHub.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { describe, type Field } from '../describe';
import { MEDIA_INDEX, type CollectionType, type ContentType, type SingletonType } from '../registry';
import { getFile, listDir } from './github';
import { isSlug } from './paths';

export interface Entry { id: string; sha: string | null; data: Record<string, unknown>; body: string }
export interface ListItem { id: string; title: string; subtitle: string; draft: boolean; sort: number | string; sha: string }

export const entryPath = (t: CollectionType, id: string) => `${t.dir}/${id}.md`;

const FM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
export function parseMarkdown(text: string) {
  const m = text.match(FM);
  if (!m) return { data: {}, body: text };
  return { data: (parseYaml(m[1]) ?? {}) as Record<string, unknown>, body: m[2].replace(/^\r?\n/, '') };
}

const isoDate = (v: unknown) => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
};

/** Shape stored data for the form: dates as YYYY-MM-DD strings. */
function toForm(fields: Field[], data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  for (const f of fields) if (f.kind === 'date' && out[f.name] != null) out[f.name] = isoDate(out[f.name]);
  return out;
}

export async function listEntries(t: CollectionType): Promise<ListItem[]> {
  const files = (await listDir(t.dir)).filter((f) => f.type === 'file' && f.name.endsWith('.md'));
  const items = await Promise.all(files.map(async (f) => {
    const file = await getFile(f.path);
    const { data } = parseMarkdown(file?.text ?? '');
    const sortRaw = t.sortField ? data[t.sortField] : '';
    return {
      id: f.name.replace(/\.md$/, ''),
      title: String(data[t.titleField] ?? f.name),
      subtitle: t.subtitleField ? String(data[t.subtitleField] ?? '') : '',
      draft: data.draft === true,
      sort: (isoDate(sortRaw) as number | string) ?? '',
      sha: file?.sha ?? f.sha,
    };
  }));
  return items.sort((a, b) =>
    typeof a.sort === 'number' && typeof b.sort === 'number' ? a.sort - b.sort : String(b.sort).localeCompare(String(a.sort)));
}

export async function getEntry(t: CollectionType, id: string): Promise<Entry | null> {
  if (!isSlug(id)) return null;
  const file = await getFile(entryPath(t, id));
  if (!file) return null;
  const { data, body } = parseMarkdown(file.text);
  return { id, sha: file.sha, data: toForm(describe(t.schema), data), body };
}

export async function getSingleton(t: SingletonType): Promise<Entry> {
  const file = await getFile(t.path);
  return { id: t.key, sha: file?.sha ?? null, data: file ? JSON.parse(file.text) : {}, body: '' };
}

/**
 * Normalise form input: trim strings, clean tag lists, recurse into repeatable groups.
 * Empty optional values are dropped (markdown entries) or kept as '' (settings, where the site
 * expects every key to exist).
 */
function normalise(fields: Field[], data: Record<string, unknown>, keepEmpty: boolean) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    let v = data?.[f.name];
    if (typeof v === 'string' && f.kind !== 'date') v = v.trim();
    if (f.kind === 'tags' && Array.isArray(v)) v = v.map((s) => String(s).trim()).filter(Boolean);
    if (f.kind === 'list' && Array.isArray(v)) v = v.map((row) => normalise(f.fields ?? [], row as Record<string, unknown>, keepEmpty));
    const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    if (empty && !f.required) {
      if (keepEmpty && typeof v === 'string') out[f.name] = '';
      continue;
    }
    out[f.name] = v;
  }
  return out;
}

export interface Validation { ok: boolean; data: Record<string, unknown>; errors: Record<string, string> }

export function validate(t: ContentType, input: Record<string, unknown>): Validation {
  const data = normalise(describe(t.schema), input, t.kind === 'singleton');
  const res = t.schema.safeParse(data);
  if (res.success) return { ok: true, data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join('.') || '_form';
    errors[key] ??= friendly(issue as never);
  }
  return { ok: false, data, errors };
}

function friendly(issue: { code: string; message: string; minimum?: unknown; maximum?: unknown; origin?: string; input?: unknown }) {
  if (issue.code === 'too_small' && issue.origin === 'string') return issue.minimum === 1 ? 'Required' : `At least ${issue.minimum} characters`;
  if (issue.code === 'too_big' && issue.origin === 'string') return `Up to ${issue.maximum} characters`;
  if (issue.code === 'too_small' && issue.origin === 'array') return issue.minimum === 1 ? 'Add at least one' : `Add at least ${issue.minimum}`;
  if (issue.code === 'too_big' && issue.origin === 'array') return `No more than ${issue.maximum}`;
  if (issue.code === 'invalid_type' && issue.input === undefined) return 'Required';
  return issue.message;
}

/** Collect every image path referenced by the validated data, for existence checks. */
export function imageRefs(t: ContentType, data: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const walk = (fields: Field[], obj: Record<string, unknown>) => {
    for (const f of fields) {
      const v = obj?.[f.name];
      if (f.kind === 'image' && typeof v === 'string' && v) refs.push(v);
      if (f.kind === 'list' && Array.isArray(v)) v.forEach((row) => walk(f.fields ?? [], row as Record<string, unknown>));
    }
  };
  walk(describe(t.schema), data);
  return refs;
}

export function serialize(t: ContentType, data: Record<string, unknown>, body = ''): string {
  if (t.kind === 'singleton') return JSON.stringify(data, null, 2) + '\n';
  const fm = stringifyYaml(data, { lineWidth: 0 }).trimEnd();
  return `---\n${fm}\n---\n${body.trim() ? `\n${body.trim()}\n` : ''}`;
}

export async function readMediaIndex(): Promise<{ sha: string | null; alts: Record<string, string> }> {
  const f = await getFile(MEDIA_INDEX);
  return { sha: f?.sha ?? null, alts: f ? JSON.parse(f.text) : {} };
}
