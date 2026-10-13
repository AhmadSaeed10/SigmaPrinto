import type { APIRoute } from 'astro';
import { getType, MEDIA_DIR, type CollectionType } from '../../../admin/registry';
import { handle, json, readJson } from '../../../admin/server/api';
import { entryPath, imageRefs, serialize, validate } from '../../../admin/server/content';
import { deleteFile, getFile, listDir, putFile } from '../../../admin/server/github';
import { isSlug } from '../../../admin/server/paths';

export const prerender = false;

const MAX_BODY = 200_000; // characters of markdown

// Create or update an entry (collection) or a settings file (singleton).
export const POST: APIRoute = ({ request, locals }) => handle(async () => {
  const req = await readJson(request);
  const type = getType(String(req?.type ?? ''));
  if (!type) return json({ error: 'Unknown content type' }, 400);
  if (typeof req?.data !== 'object' || req.data === null) return json({ error: 'Missing data' }, 400);
  const body = typeof req.body === 'string' ? req.body : '';
  if (body.length > MAX_BODY) return json({ errors: { body: 'This text is too long' } }, 400);
  const sha: string | null = typeof req.sha === 'string' && /^[0-9a-f]{40}$/.test(req.sha) ? req.sha : null;
  const who = locals.admin?.sub ?? 'admin';

  const v = validate(type, req.data);
  const errors = { ...v.errors };

  let path: string;
  let id = '';
  if (type.kind === 'collection') {
    id = String(req.id ?? '');
    if (!isSlug(id)) errors.slug = 'Use lowercase letters, numbers and dashes only';
    path = entryPath(type, isSlug(id) ? id : 'x');
  } else {
    path = type.path;
  }

  // Every referenced image must exist, or the next build would fail.
  const refs = v.ok ? imageRefs(type, v.data) : [];
  if (refs.length) {
    const have = new Set((await listDir(MEDIA_DIR)).map((f) => `../../assets/${f.name}`));
    refs.forEach((r) => {
      if (!have.has(r)) errors[findPath(v.data, r) ?? 'image'] = 'This image is no longer in Media. Choose another.';
    });
  }
  if (Object.keys(errors).length) return json({ errors }, 400);

  if (type.kind === 'collection' && req.mode === 'create') {
    if (await getFile(path)) return json({ errors: { slug: `A ${type.singular} with this URL already exists` } }, 400);
    const saved = await putFile(path, serialize(type, v.data, body), null, `admin: add ${type.singular} "${id}" (${who})`);
    return json({ ok: true, id, sha: saved.sha });
  }
  if (type.kind === 'collection' && !sha) return json({ error: 'Missing version. Reload and try again.', conflict: true }, 409);

  const verb = type.kind === 'collection' ? `update ${type.singular} "${id}"` : `update ${type.label.toLowerCase()}`;
  const saved = await putFile(path, serialize(type, v.data, body), sha, `admin: ${verb} (${who})`);
  return json({ ok: true, id, sha: saved.sha });
});

export const DELETE: APIRoute = ({ request, locals }) => handle(async () => {
  const req = await readJson(request);
  const type = getType(String(req?.type ?? ''));
  if (!type || type.kind !== 'collection') return json({ error: 'Only collection entries can be deleted' }, 400);
  const id = String(req?.id ?? '');
  const sha = String(req?.sha ?? '');
  if (!isSlug(id) || !/^[0-9a-f]{40}$/.test(sha)) return json({ error: 'Bad request' }, 400);
  await deleteFile(entryPath(type as CollectionType, id), sha, `admin: delete ${type.singular} "${id}" (${locals.admin?.sub ?? 'admin'})`);
  return json({ ok: true });
});

/** Find the dotted form path (e.g. gallery.2.image) holding an image reference, for the error. */
function findPath(obj: unknown, value: string, prefix = ''): string | null {
  if (obj === value) return prefix || null;
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = findPath(v, value, prefix ? `${prefix}.${k}` : k);
      if (p) return p;
    }
  }
  return null;
}
