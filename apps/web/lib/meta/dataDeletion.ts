import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

export type MetaSignedRequestPayload = {
  algorithm?: string;
  issued_at?: number;
  user_id?: string;
};

export type MetaDataDeletionAck = {
  url: string;
  confirmation_code: string;
};

function getMetaAppSecret(): string | null {
  const secret =
    process.env.FACEBOOK_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || "";
  return secret || null;
}

/** Meta signed_request uses URL-safe base64 without padding. */
export function decodeMetaBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, "base64");
}

/**
 * Verify Meta `signed_request` (HMAC-SHA256 over the encoded payload).
 * Returns the parsed payload or null when invalid / misconfigured.
 */
export function parseMetaSignedRequest(
  signedRequest: string,
  appSecret = getMetaAppSecret(),
): MetaSignedRequestPayload | null {
  if (!appSecret || !signedRequest.trim()) return null;
  const parts = signedRequest.trim().split(".");
  if (parts.length !== 2) return null;
  const [encodedSig, encodedPayload] = parts;
  if (!encodedSig || !encodedPayload) return null;

  let sig: Buffer;
  let expected: Buffer;
  try {
    sig = decodeMetaBase64Url(encodedSig);
    expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  } catch {
    return null;
  }
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) return null;

  try {
    const json = decodeMetaBase64Url(encodedPayload).toString("utf8");
    const parsed = JSON.parse(json) as MetaSignedRequestPayload;
    if (!parsed || typeof parsed !== "object") return null;
    // Meta documents HMAC-SHA256; reject unexpected algorithms fail-closed.
    if (
      parsed.algorithm != null &&
      String(parsed.algorithm).toUpperCase().replace(/_/g, "-") !== "HMAC-SHA256"
    ) {
      return null;
    }
    if (typeof parsed.user_id !== "string" || !parsed.user_id.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Opaque confirmation code: nonce.issuedAt.mac — verifiable without a database row. */
export function issueDataDeletionConfirmationCode(
  appSecret = getMetaAppSecret(),
): string | null {
  if (!appSecret) return null;
  const nonce = randomBytes(8).toString("hex");
  const issuedAt = Math.floor(Date.now() / 1000).toString(36);
  const payload = `${nonce}.${issuedAt}`;
  const mac = createHmac("sha256", appSecret).update(`ddr:${payload}`).digest("base64url").slice(0, 20);
  return `${payload}.${mac}`;
}

export function verifyDataDeletionConfirmationCode(
  code: string,
  appSecret = getMetaAppSecret(),
): { ok: true; issuedAtUnix: number } | { ok: false } {
  if (!appSecret) return { ok: false };
  const trimmed = code.trim();
  const parts = trimmed.split(".");
  if (parts.length !== 3) return { ok: false };
  const [nonce, issuedAt, mac] = parts;
  if (!nonce || !issuedAt || !mac) return { ok: false };
  const payload = `${nonce}.${issuedAt}`;
  const expected = createHmac("sha256", appSecret).update(`ddr:${payload}`).digest("base64url").slice(0, 20);
  try {
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false };
  } catch {
    return { ok: false };
  }
  const issuedAtUnix = Number.parseInt(issuedAt, 36);
  if (!Number.isFinite(issuedAtUnix) || issuedAtUnix <= 0) return { ok: false };
  return { ok: true, issuedAtUnix };
}

/** Non-reversible audit token — never log raw Meta user ids. */
export function hashMetaUserIdForAudit(userId: string): string {
  return createHash("sha256").update(`meta-ddr:${userId}`).digest("hex").slice(0, 16);
}

export function buildDataDeletionStatusUrl(confirmationCode: string): string {
  const base = absoluteCanonicalUrl("/data-deletion/status");
  const url = new URL(base);
  url.searchParams.set("code", confirmationCode);
  return url.toString();
}

export function buildMetaDataDeletionAck(confirmationCode: string): MetaDataDeletionAck {
  return {
    url: buildDataDeletionStatusUrl(confirmationCode),
    confirmation_code: confirmationCode,
  };
}
