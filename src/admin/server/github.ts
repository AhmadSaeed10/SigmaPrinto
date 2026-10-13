// Server-only. Minimal GitHub REST client for reading and committing repo files.
import { githubConfig } from './config';
import { assertWritable } from './paths';

export class ConflictError extends Error {
  constructor() { super('This was changed somewhere else since you opened it. Reload to get the latest version, then make your change again.'); }
}
export class GitHubError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export interface RepoFile { path: string; sha: string; text: string }
export interface DirEntry { name: string; path: string; sha: string; size: number; type: string }

function cfg() {
  const c = githubConfig();
  if (c.missing.length) throw new GitHubError(`Admin is not connected to GitHub. Missing: ${c.missing.join(', ')}.`, 500);
  return c;
}

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

async function gh(path: string, init: RequestInit & { accept?: string } = {}) {
  const c = cfg();
  const res = await fetch(`${c.api}/repos/${c.repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${c.token}`,
      Accept: init.accept ?? 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sigmaprinto-admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  return res;
}

async function fail(res: Response, what: string): Promise<never> {
  let msg = '';
  try { msg = (await res.json()).message ?? ''; } catch {}
  if (res.status === 401) throw new GitHubError('GitHub rejected the token. Check GITHUB_TOKEN in Vercel.', 500);
  if (res.status === 403 && /rate limit/i.test(msg)) throw new GitHubError('GitHub rate limit reached. Try again in a few minutes.', 429);
  if (res.status === 403 || res.status === 404) throw new GitHubError(`GitHub refused to ${what}. Check the token has Contents read and write on ${githubConfig().repo}.`, 500);
  throw new GitHubError(`GitHub could not ${what} (${res.status}${msg ? `: ${msg}` : ''}).`);
}

export async function getFile(path: string): Promise<RepoFile | null> {
  const res = await gh(`/contents/${enc(path)}?ref=${encodeURIComponent(cfg().branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) return fail(res, `read ${path}`);
  const j = await res.json();
  if (Array.isArray(j) || j.type !== 'file') throw new GitHubError(`${path} is not a file`);
  // The contents API omits content for files over 1 MB; fall back to the raw endpoint.
  const text = j.content ? Buffer.from(j.content, 'base64').toString('utf8') : Buffer.from(await getRaw(path)).toString('utf8');
  return { path, sha: j.sha, text };
}

export async function getRaw(path: string): Promise<ArrayBuffer> {
  const res = await gh(`/contents/${enc(path)}?ref=${encodeURIComponent(cfg().branch)}`, { accept: 'application/vnd.github.raw+json' });
  if (!res.ok) return fail(res, `read ${path}`);
  return res.arrayBuffer();
}

export async function listDir(path: string): Promise<DirEntry[]> {
  const res = await gh(`/contents/${enc(path)}?ref=${encodeURIComponent(cfg().branch)}`);
  if (res.status === 404) return [];
  if (!res.ok) return fail(res, `list ${path}`);
  const j = await res.json();
  return Array.isArray(j) ? j.map((f) => ({ name: f.name, path: f.path, sha: f.sha, size: f.size, type: f.type })) : [];
}

/** Create (sha = null) or update (sha = the version the editor loaded) one file. */
export async function putFile(path: string, content: string | Buffer, sha: string | null, message: string) {
  assertWritable(path);
  const res = await gh(`/contents/${enc(path)}`, {
    method: 'PUT',
    body: JSON.stringify({
      message, branch: cfg().branch,
      content: Buffer.isBuffer(content) ? content.toString('base64') : Buffer.from(content, 'utf8').toString('base64'),
      ...(sha ? { sha } : {}),
    }),
  });
  // 409: sha is stale. 422: creating a file that already exists (no sha supplied).
  if (res.status === 409 || res.status === 422) throw new ConflictError();
  if (!res.ok) return fail(res, `save ${path}`);
  const j = await res.json();
  return { sha: j.content.sha as string, commit: j.commit.sha as string };
}

export async function deleteFile(path: string, sha: string, message: string) {
  assertWritable(path);
  const res = await gh(`/contents/${enc(path)}`, { method: 'DELETE', body: JSON.stringify({ message, sha, branch: cfg().branch }) });
  if (res.status === 409 || res.status === 422) throw new ConflictError();
  if (res.status === 404) throw new ConflictError();
  if (!res.ok) return fail(res, `delete ${path}`);
}

/**
 * Several file changes in a single commit (one redeploy), via the Git Data API.
 * `expect` lists files whose current blob sha must still match, or null for "must not exist".
 */
export async function commitFiles(
  changes: { path: string; content: Buffer | string | null }[],
  message: string,
  expect: { path: string; sha: string | null }[] = [],
) {
  changes.forEach((c) => assertWritable(c.path));
  const { branch } = cfg();
  for (const e of expect) {
    const cur = await getFile(e.path);
    if ((cur?.sha ?? null) !== e.sha) throw new ConflictError();
  }
  const refRes = await gh(`/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!refRes.ok) return fail(refRes, `read branch ${branch}`);
  const head = (await refRes.json()).object.sha as string;
  const commitRes = await gh(`/git/commits/${head}`);
  if (!commitRes.ok) return fail(commitRes, 'read the latest commit');
  const baseTree = (await commitRes.json()).tree.sha as string;

  const tree = [];
  for (const c of changes) {
    if (c.content === null) { tree.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const buf = Buffer.isBuffer(c.content) ? c.content : Buffer.from(c.content, 'utf8');
    const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: buf.toString('base64'), encoding: 'base64' }) });
    if (!blob.ok) return fail(blob, `upload ${c.path}`);
    tree.push({ path: c.path, mode: '100644', type: 'blob', sha: (await blob.json()).sha });
  }
  const treeRes = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseTree, tree }) });
  if (!treeRes.ok) return fail(treeRes, 'prepare the commit');
  const newCommit = await gh('/git/commits', {
    method: 'POST',
    body: JSON.stringify({ message, tree: (await treeRes.json()).sha, parents: [head] }),
  });
  if (!newCommit.ok) return fail(newCommit, 'create the commit');
  const sha = (await newCommit.json()).sha;
  const upd = await gh(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha, force: false }) });
  // Not a fast-forward: someone committed in between.
  if (upd.status === 422 || upd.status === 409) throw new ConflictError();
  if (!upd.ok) return fail(upd, `update ${branch}`);
  return { commit: sha as string };
}
