// Server-only. Reads admin secrets at request time via astro:env (never inlined into a bundle).
import {
  ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET,
  GITHUB_TOKEN, GITHUB_REPO, GITHUB_BRANCH, GITHUB_API_URL,
} from 'astro:env/server';

export function authConfig() {
  const missing = [
    !ADMIN_EMAIL && 'ADMIN_EMAIL',
    !ADMIN_PASSWORD && 'ADMIN_PASSWORD',
    !SESSION_SECRET && 'SESSION_SECRET',
  ].filter(Boolean) as string[];
  if (SESSION_SECRET && SESSION_SECRET.length < 32) missing.push('SESSION_SECRET (needs 32+ characters)');
  return { email: ADMIN_EMAIL ?? '', password: ADMIN_PASSWORD ?? '', secret: SESSION_SECRET ?? '', missing };
}

export function githubConfig() {
  const missing = [!GITHUB_TOKEN && 'GITHUB_TOKEN', !GITHUB_REPO && 'GITHUB_REPO'].filter(Boolean) as string[];
  if (GITHUB_REPO && !/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPO)) missing.push('GITHUB_REPO (use owner/repo)');
  return {
    token: GITHUB_TOKEN ?? '',
    repo: GITHUB_REPO ?? '',
    branch: GITHUB_BRANCH || 'main',
    api: (GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''),
    missing,
  };
}
