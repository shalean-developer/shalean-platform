import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 2 * 60 * 1000;

type TokenClaims = {
  bookingId: string;
  reference: string;
  userId: string;
  issuedAt: number;
};

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createFreshPaymentPreparationToken(
  claims: Omit<TokenClaims, "issuedAt"> & { issuedAt?: number },
  secret = (process.env.PAYSTACK_SECRET_KEY ?? "").trim(),
): string | null {
  if (!secret) return null;
  const payload = Buffer.from(
    JSON.stringify({ ...claims, issuedAt: claims.issuedAt ?? Date.now() } satisfies TokenClaims),
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyFreshPaymentPreparationToken(
  token: string,
  expected: Omit<TokenClaims, "issuedAt"> & { now?: number },
  secret = (process.env.PAYSTACK_SECRET_KEY ?? "").trim(),
): boolean {
  if (!secret) return false;
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return false;

  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const calculated = Buffer.from(expectedSignature);
  if (supplied.length !== calculated.length || !timingSafeEqual(supplied, calculated)) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<TokenClaims>;
    const now = expected.now ?? Date.now();
    return (
      claims.bookingId === expected.bookingId &&
      claims.reference === expected.reference &&
      claims.userId === expected.userId &&
      typeof claims.issuedAt === "number" &&
      claims.issuedAt <= now &&
      now - claims.issuedAt <= TOKEN_TTL_MS
    );
  } catch {
    return false;
  }
}
