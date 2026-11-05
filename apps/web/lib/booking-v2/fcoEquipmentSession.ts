import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { fcoEquipmentReceiptSecret } from "@/lib/booking-v2/fcoEquipmentServerGuard";

export const FCO_EQUIPMENT_SESSION_COOKIE = "fco01_equipment_session";
export const FCO_EQUIPMENT_SESSION_MAX_AGE_SECONDS = 600;

function signNonce(nonce: string): string {
  return createHmac("sha256", fcoEquipmentReceiptSecret())
    .update("shalean:fco01:cookie:v1:" + nonce).digest("hex");
}

function validSession(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[0]) ||
      !/^[a-f0-9]{64}$/.test(parts[1])) return false;
  try {
    const expected = Buffer.from(signNonce(parts[0]), "hex");
    const provided = Buffer.from(parts[1], "hex");
    return timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}

function findCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="));
  if (!match) return null;
  const candidate = match.slice(name.length + 1);
  return validSession(candidate) ? candidate : null;
}

export function readFcoEquipmentSession(request: Request): string | null {
  return findCookie(request, FCO_EQUIPMENT_SESSION_COOKIE);
}

/** Server-minted signed bearer capability. Not a customer identity. */
export function issueFcoEquipmentSession(request: Request): string {
  const existing = readFcoEquipmentSession(request);
  if (existing) return existing;
  const nonce = randomBytes(32).toString("hex");
  return nonce + "." + signNonce(nonce);
}

export function hashFcoEquipmentSession(session: string): string {
  if (!validSession(session)) throw new Error("EQUIPMENT_SESSION_INVALID");
  return createHash("sha256").update("shalean:fco01:session:v1:" + session).digest("hex");
}

export function setFcoEquipmentSessionCookie(response: Response, session: string): void {
  if (!validSession(session)) throw new Error("EQUIPMENT_SESSION_INVALID");
  response.headers.append("Set-Cookie", [
    FCO_EQUIPMENT_SESSION_COOKIE + "=" + session,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/booking-v2",
    "Max-Age=" + FCO_EQUIPMENT_SESSION_MAX_AGE_SECONDS,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; "));
}
