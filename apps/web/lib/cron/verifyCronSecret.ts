/**
 * Shared auth for `/api/cron/*` invoked by Vercel Cron (Bearer), Supabase pg_net (x-cron-secret), or manual curl.
 */
export type CronAuthFailure = { ok: false; status: 401 | 503; body: { error: string } };

export function verifyCronSecret(request: Request): { ok: true } | CronAuthFailure {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, body: { error: "CRON_SECRET not configured." } };
  }
  const bearer = request.headers.get("authorization")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret === secret || bearer === `Bearer ${secret}`) {
    return { ok: true };
  }
  return { ok: false, status: 401, body: { error: "Unauthorized." } };
}
