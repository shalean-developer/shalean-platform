import { createHmac, timingSafeEqual } from "node:crypto";

const TTL_SECONDS = 60 * 60 * 24 * 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type UnsubscribeTokenPayload = { uid: string; exp: number; v: 1 };
function validSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32;
}
function signature(encoded: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encoded).digest();
}
export function createMarketingUnsubscribeToken(
  customerId: string, secret: string | undefined, nowSeconds = Math.floor(Date.now() / 1000),
): string | null {
  if (!UUID.test(customerId) || !validSecret(secret)) return null;
  const encoded = Buffer.from(JSON.stringify({
    uid: customerId.toLowerCase(), exp: nowSeconds + TTL_SECONDS, v: 1,
  } satisfies UnsubscribeTokenPayload)).toString("base64url");
  return encoded + "." + signature(encoded, secret).toString("base64url");
}
export function verifyMarketingUnsubscribeToken(
  token: string, secret: string | undefined, nowSeconds = Math.floor(Date.now() / 1000),
): { customerId: string } | null {
  if (!validSecret(secret) || !token || token.length > 2048) return null;
  const segments = token.split(".");
  if (segments.length !== 2) return null;
  const [encoded, mac] = segments;
  if (!encoded || !mac || !/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]+$/.test(mac)) return null;
  const actual = Buffer.from(mac, "base64url");
  const expected = signature(encoded, secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<UnsubscribeTokenPayload>;
    if (value.v !== 1 || typeof value.uid !== "string" || !UUID.test(value.uid)
      || typeof value.exp !== "number" || !Number.isInteger(value.exp)
      || value.exp < nowSeconds || value.exp > nowSeconds + TTL_SECONDS) return null;
    return { customerId: value.uid };
  } catch { return null; }
}
export function createMarketingUnsubscribeUrl(
  origin: string, customerId: string, secret: string | undefined,
): string | null {
  const token = createMarketingUnsubscribeToken(customerId, secret);
  if (!token) return null;
  try {
    const url = new URL("/api/marketing/unsubscribe", origin);
    if (url.protocol !== "https:") return null;
    url.searchParams.set("token", token);
    return url.toString();
  } catch { return null; }
}
