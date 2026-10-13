// Turns a zod (v4) object schema into plain field descriptors the admin form builder renders.
// Server-only use, but has no secrets. Unknown shapes fall back to a text input.
import type { z } from 'astro/zod';

export type FieldKind = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'tags' | 'image' | 'list' | 'email' | 'url';
export interface Field {
  name: string;
  label: string;
  help?: string;
  kind: FieldKind;
  required: boolean;
  min?: number;
  max?: number;
  int?: boolean;
  options?: string[];
  default?: unknown;
  fields?: Field[]; // for kind 'list' (repeatable groups)
  itemMax?: number; // max length of each tag
  itemLabel?: string; // name of one row in a list, e.g. 'image'
}

type Any = z.ZodType & { _zod: { def: any }; meta: () => any };
const def = (s: Any) => s._zod.def;

function meta(s: Any): Record<string, any> {
  try { return (s.meta?.() as Record<string, any>) ?? {}; } catch { return {}; }
}

function unwrap(s: Any) {
  let cur = s;
  let required = true;
  let dflt: unknown;
  let m = { ...meta(s) };
  for (;;) {
    const d = def(cur);
    if (d.type === 'optional' || d.type === 'nullable') { required = false; cur = d.innerType; }
    else if (d.type === 'default') { required = false; dflt = typeof d.defaultValue === 'function' ? d.defaultValue() : d.defaultValue; cur = d.innerType; }
    else if (d.type === 'pipe') { cur = d.in; }
    else break;
    m = { ...meta(cur), ...m };
  }
  return { inner: cur, required, dflt, m };
}

function lengths(s: Any) {
  const out: { min?: number; max?: number; int?: boolean } = {};
  for (const c of def(s).checks ?? []) {
    const cd = c._zod?.def ?? {};
    if (cd.check === 'min_length') out.min = cd.minimum;
    if (cd.check === 'max_length') out.max = cd.maximum;
    if (cd.check === 'greater_than') out.min = cd.value;
    if (cd.check === 'less_than') out.max = cd.value;
    if (cd.check === 'number_format' && /int/.test(cd.format)) out.int = true;
  }
  return out;
}

const humanize = (n: string) => n.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

export function describe(schema: z.ZodType): Field[] {
  const { inner } = unwrap(schema as Any);
  const shape = def(inner).shape;
  if (!shape) return [];
  return Object.entries(shape).map(([name, s]) => field(name, s as Any));
}

function field(name: string, s: Any): Field {
  const { inner, required, dflt, m } = unwrap(s);
  const d = def(inner);
  const base = { name, label: m.label ?? humanize(name), help: m.help, required, default: dflt };
  switch (d.type) {
    case 'string': {
      const kind: FieldKind = m.ui === 'image' ? 'image' : m.ui === 'textarea' ? 'textarea'
        : d.format === 'email' ? 'email' : d.format === 'url' ? 'url' : 'text';
      const len = lengths(inner);
      // A string with no minimum accepts '', so it is not really required.
      return { ...base, kind, ...len, required: required && (len.min ?? (d.format ? 1 : 0)) > 0 };
    }
    case 'number': return { ...base, kind: 'number', ...lengths(inner) };
    case 'boolean': return { ...base, kind: 'boolean' };
    case 'date': return { ...base, kind: 'date' };
    case 'enum': return { ...base, kind: 'select', options: Object.values(d.entries ?? {}) as string[] };
    case 'array': {
      const el = unwrap(d.element);
      const len = lengths(inner);
      if (def(el.inner).type === 'object') return { ...base, kind: 'list', fields: describe(el.inner), itemLabel: m.itemLabel, ...len };
      return { ...base, kind: 'tags', ...len, itemMax: lengths(el.inner).max };
    }
    default: return { ...base, kind: 'text' };
  }
}
