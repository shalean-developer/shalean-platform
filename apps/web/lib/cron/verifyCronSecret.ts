/**
 * Shared auth for `/api/cron/*` invoked by Vercel Cron (Bearer), Supabase pg_net (x-cron-secret), or manual curl.
 */
export type CronAuthFailure = { ok: false; status: 401 | 503; body: { error: string } };

/** RFC 7235: auth scheme is case-insensitive; trim token after one-or-more spaces. */
function bearerCredential(authorization: string | null): string | null {
  const raw = authorization?.trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const inner = m?.[1]?.trim();
  return inner || null;
}

export function verifyCronSecret(request: Request): { ok: true } | CronAuthFailure {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return { ok: false, status: 503, body: { error: "CRON_SECRET not configured." } };
  }
  const bearerToken = bearerCredential(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret === secret || bearerToken === secret) {
    return { ok: true };
  }
  return { ok: false, status: 401, body: { error: "Unauthorized." } };
}
