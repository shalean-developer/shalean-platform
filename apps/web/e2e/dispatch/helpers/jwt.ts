/**
 * Minimal JWT payload decode for E2E env wiring (no signature verification).
 */

export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function jwtSub(jwt: string): string | null {
  const p = decodeJwtPayload(jwt);
  const sub = p?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

export function jwtEmail(jwt: string): string | null {
  const p = decodeJwtPayload(jwt);
  const em = p?.email;
  return typeof em === "string" && em.includes("@") ? em : null;
}
