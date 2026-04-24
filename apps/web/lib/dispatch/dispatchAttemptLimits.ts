/** Max recovery waves for user-selected offer (decline / TTL expiry → re-dispatch). Env: `MAX_DISPATCH_ATTEMPTS` (1–20). */
export function maxDispatchAttempts(): number {
  const n = Number(process.env.MAX_DISPATCH_ATTEMPTS);
  if (Number.isFinite(n) && n >= 1 && n <= 20) return Math.round(n);
  return 5;
}
