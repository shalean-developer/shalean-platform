import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const OFFICE_VERIFICATION_COOKIE = "shalean_office_verified";
export const OFFICE_CODE_TTL_MS = 10 * 60 * 1000;
export const OFFICE_VERIFICATION_TTL_MS = 8 * 60 * 60 * 1000;
export const OFFICE_CODE_RESEND_COOLDOWN_MS = 60 * 1000;
export const OFFICE_CODE_MAX_ATTEMPTS = 5;

function signingSecret(): string {
  const secret =
    process.env.OFFICE_VERIFICATION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error("Office verification signing secret is not configured.");
  return secret;
}

function hmac(value: string): string {
  return createHmac("sha256", signingSecret()).update(value).digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function generateOfficeEmailCode(): string {
  return String(randomInt(100000, 1000000));
}

export function hashOfficeEmailCode(userId: string, challengeId: string, code: string): string {
  return hmac(`office-code:v1:${userId}:${challengeId}:${code}`);
}

export function verifyOfficeEmailCodeHash(
  userId: string,
  challengeId: string,
  code: string,
  expectedHash: string,
): boolean {
  return safeEqualHex(hashOfficeEmailCode(userId, challengeId, code), expectedHash);
}

type VerificationPayload = {
  v: 2;
  uid: string;
  sid: string;
  exp: number;
};

function encodePayload(payload: VerificationPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function officeSessionBinding(lastSignInAt: string | null | undefined): string | null {
  const value = lastSignInAt?.trim();
  return value ? hmac(`office-auth-session:v1:${value}`) : null;
}

export function createOfficeVerificationToken(
  userId: string,
  sessionBinding: string,
  now = Date.now(),
): string {
  if (!userId || !sessionBinding) throw new Error("Office verification session binding is required.");
  const payload = encodePayload({
    v: 2,
    uid: userId,
    sid: sessionBinding,
    exp: now + OFFICE_VERIFICATION_TTL_MS,
  });
  return `${payload}.${hmac(`office-session:v2:${payload}`)}`;
}

export function verifyOfficeVerificationToken(
  token: string | null | undefined,
  expectedUserId: string,
  expectedSessionBinding: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!token || !expectedUserId || !expectedSessionBinding) return false;
  const [payloadPart, signature, extra] = token.split(".");
  if (!payloadPart || !signature || extra) return false;
  const expectedSignature = hmac(`office-session:v2:${payloadPart}`);
  if (!safeEqualHex(signature, expectedSignature)) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as Partial<VerificationPayload>;
    return (
      payload.v === 2 &&
      payload.uid === expectedUserId &&
      payload.sid === expectedSessionBinding &&
      typeof payload.exp === "number" &&
      payload.exp > now
    );
  } catch {
    return false;
  }
}

export function officeVerificationCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(OFFICE_VERIFICATION_TTL_MS / 1000),
  };
}
