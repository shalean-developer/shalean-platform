import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const FCO_EQUIPMENT_SESSION_COOKIE = "fco01_equipment_session";
export const FCO_EQUIPMENT_SESSION_MAX_AGE_SECONDS = 600;

function findCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  const match = header.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="));
  if (!match) return null;
  const raw = match.slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(raw) ? raw : null;
}

export function readFcoEquipmentSession(request: Request): string | null {
  return findCookie(request, FCO_EQUIPMENT_SESSION_COOKIE);
}

/** Session is a server-minted bearer capability, NOT a customer identity. */
export function issueFcoEquipmentSession(request: Request): string {
  return readFcoEquipmentSession(request) ?? randomBytes(32).toString("hex");
}

export function hashFcoEquipmentSession(session: string): string {
  if (!/^[a-f0-9]{64}$/.test(session)) throw new Error("EQUIPMENT_SESSION_INVALID");
  return createHash("sha256").update("shalean:fco01:session:v1:" + session).digest("hex");
}

export function setFcoEquipmentSessionCookie(response: Response, session: string): void {
  if (!/^[a-f0-9]{64}$/.test(session)) throw new Error("EQUIPMENT_SESSION_INVALID");
  response.headers.append("Set-Cookie", [
    FCO_EQUIPMENT_SESSION_COOKIE + "=" + session,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/booking-v2",
    "Max-Age=" + FCO_EQUIPMENT_SESSION_MAX_AGE_SECONDS,
    ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; "));
}
