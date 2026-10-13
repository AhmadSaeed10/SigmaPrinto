// Server-only. The admin may only write to these exact places. Every write goes through assertWritable.
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MEDIA_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/;

const WRITABLE: RegExp[] = [
  /^src\/content\/services\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  /^src\/content\/guides\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/,
  /^src\/data\/site\.json$/,
  /^src\/data\/faqs\.json$/,
  /^src\/data\/media\.json$/,
  /^src\/assets\/[a-z0-9]+(?:-[a-z0-9]+)*\.webp$/,
];

export function assertWritable(path: string) {
  if (path.includes('..') || path.includes('\\') || !WRITABLE.some((re) => re.test(path))) {
    throw new Error(`Refused to write outside the allowed content paths: ${path}`);
  }
}

/** Turn any text into a safe slug: lowercase ascii, digits and single dashes. */
export function slugify(input: string, max = 64) {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

export function isSlug(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 80 && SLUG.test(s);
}
