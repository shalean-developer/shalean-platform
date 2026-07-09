import { timingSafeEqualString } from "./utils.ts";

export type AuthResult = { ok: true } | { ok: false; status: 401 | 503; body: { error: string } };

function bearerCredential(authorization: string | null): string | null {
  const raw = authorization?.trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

/** Verify CRON_SECRET via Bearer or x-cron-secret (matches verifyCronSecret on Vercel). */
export function verifyCronSecret(request: Request, secret: string): AuthResult {
  if (!secret) {
    return { ok: false, status: 503, body: { error: "CRON_SECRET not configured." } };
  }
  const bearerToken = bearerCredential(request.headers.get("authorization"));
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  if (headerSecret && timingSafeEqualString(headerSecret, secret)) {
    return { ok: true };
  }
  if (bearerToken && timingSafeEqualString(bearerToken, secret)) {
    return { ok: true };
  }
  return { ok: false, status: 401, body: { error: "Unauthorized." } };
}
