import type { APIRoute } from 'astro';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { contentTypes, MEDIA_DIR, MEDIA_INDEX } from '../../../admin/registry';
import { handle, json, readJson } from '../../../admin/server/api';
import { readMediaIndex } from '../../../admin/server/content';
import { commitFiles, getFile, listDir } from '../../../admin/server/github';
import { MEDIA_NAME, slugify } from '../../../admin/server/paths';

export const prerender = false;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions reject request bodies over 4.5 MB
const MAX_WIDTH = 2000;

/** Detect the real file type from its first bytes, not the name or MIME type. */
function sniff(b: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const GET: APIRoute = () => handle(async () => {
  const [files, index] = await Promise.all([listDir(MEDIA_DIR), readMediaIndex()]);
  const items = files
    .filter((f) => f.type === 'file' && MEDIA_NAME.test(f.name))
    .map((f) => ({ name: f.name, path: `../../assets/${f.name}`, size: f.size, alt: index.alts[f.name] ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return json({ items });
});

export const POST: APIRoute = ({ request, locals }) => handle(async () => {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BYTES + 64 * 1024) return json({ error: 'That file is too large. The limit is 4 MB.' }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: 'Upload failed. Try again.' }, 400); }
  const file = form.get('file');
  const alt = String(form.get('alt') ?? '').trim();
  if (!(file instanceof File)) return json({ errors: { file: 'Choose an image' } }, 400);
  if (alt.length < 3 || alt.length > 140) return json({ errors: { alt: 'Alt text is required (3 to 140 characters)' } }, 400);
  if (file.size > MAX_BYTES) return json({ errors: { file: 'That file is too large. The limit is 4 MB.' } }, 400);

  const input = Buffer.from(await file.arrayBuffer());
  if (!sniff(input)) return json({ errors: { file: 'Only JPG, PNG or WebP images are allowed' } }, 400);

  let out: { data: Buffer; info: sharp.OutputInfo };
  try {
    out = await sharp(input, { limitInputPixels: 50_000_000 })
      .rotate() // respect camera orientation
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return json({ errors: { file: 'That image could not be read. Try another file.' } }, 400);
  }

  const base = slugify(alt, 48) || slugify(file.name.replace(/\.[^.]+$/, ''), 48) || 'image';
  const name = `${base}-${randomBytes(3).toString('hex')}.webp`;
  if (!MEDIA_NAME.test(name)) return json({ error: 'Could not name the file' }, 400);

  const index = await readMediaIndex();
  const alts = { ...index.alts, [name]: alt };
  await commitFiles(
    [
      { path: `${MEDIA_DIR}/${name}`, content: out.data },
      { path: MEDIA_INDEX, content: JSON.stringify(alts, null, 2) + '\n' },
    ],
    `admin: upload image ${name} (${locals.admin?.sub ?? 'admin'})`,
    [{ path: MEDIA_INDEX, sha: index.sha }],
  );
  return json({ ok: true, item: { name, path: `../../assets/${name}`, alt, size: out.data.length, width: out.info.width, height: out.info.height } });
});

export const DELETE: APIRoute = ({ request, locals }) => handle(async () => {
  const req = await readJson(request);
  const name = String(req?.name ?? '');
  if (!MEDIA_NAME.test(name)) return json({ error: 'Bad file name' }, 400);
  if (!(await listDir(MEDIA_DIR)).some((f) => f.name === name)) {
    return json({ error: 'That image is already gone. Reload Media.', conflict: true }, 409);
  }

  // Refuse to delete an image that content still uses, or the next build would fail.
  const usedBy: string[] = [];
  for (const t of contentTypes) {
    if (t.kind !== 'collection') continue;
    for (const f of await listDir(t.dir)) {
      if (!f.name.endsWith('.md')) continue;
      const file = await getFile(f.path);
      if (file?.text.includes(`assets/${name}`)) usedBy.push(`${t.singular} "${f.name.replace(/\.md$/, '')}"`);
    }
  }
  if (usedBy.length) return json({ error: `This image is used by ${usedBy.join(', ')}. Remove it there first.` }, 409);

  const index = await readMediaIndex();
  const { [name]: _removed, ...alts } = index.alts;
  await commitFiles(
    [
      { path: `${MEDIA_DIR}/${name}`, content: null },
      { path: MEDIA_INDEX, content: JSON.stringify(alts, null, 2) + '\n' },
    ],
    `admin: delete image ${name} (${locals.admin?.sub ?? 'admin'})`,
    [{ path: MEDIA_INDEX, sha: index.sha }],
  );
  return json({ ok: true });
});
