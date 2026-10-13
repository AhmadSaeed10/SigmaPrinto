// Server-only. Basic login throttle: 5 failed attempts per IP, then a 15 minute wait.
// Kept in memory, so it is per server instance. On Vercel that is a speed bump, not a wall:
// a cold start resets it. It still stops casual guessing without needing a database.
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { fails: number; lockedUntil: number }>();

export function lockedFor(ip: string): number {
  const a = attempts.get(ip);
  if (!a || a.lockedUntil <= Date.now()) return 0;
  return Math.ceil((a.lockedUntil - Date.now()) / 60000);
}

export function recordFailure(ip: string) {
  const a = attempts.get(ip) ?? { fails: 0, lockedUntil: 0 };
  if (a.lockedUntil && a.lockedUntil <= Date.now()) { a.fails = 0; a.lockedUntil = 0; }
  a.fails += 1;
  if (a.fails >= MAX_FAILS) a.lockedUntil = Date.now() + LOCK_MS;
  attempts.set(ip, a);
  // Keep the map small.
  if (attempts.size > 5000) for (const [k, v] of attempts) if (v.lockedUntil < Date.now()) attempts.delete(k);
}

export function recordSuccess(ip: string) {
  attempts.delete(ip);
}
