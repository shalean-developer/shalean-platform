/**
 * Single process-local clock for server-side comparisons (expiry, token `exp`, rate windows).
 * Use this instead of ad hoc `Date.now()` where multiple checks in one flow must align.
 */
export function serverUnixMs(): number {
  return Date.now();
}
