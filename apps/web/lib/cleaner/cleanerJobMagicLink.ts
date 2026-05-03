import "server-only";

import crypto from "node:crypto";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { serverUnixMs } from "@/lib/time/serverClock";

const TYP = "job_access" as const;
const PAYLOAD_VERSION = 1;
const DEFAULT_TTL_SEC = 10 * 60;

export type CleanerJobMagicPayload = {
  v: typeof PAYLOAD_VERSION;
  typ: typeof TYP;
  /** Cleaner row id (`cleaners.id`). */
  sub: string;
  /** Booking id this link is bound to. */
  bid: string;
  exp: number;
  jti: string;
};

export function isCleanerJobMagicLinkSigningConfigured(): boolean {
  return Boolean(process.env.CLEANER_MAGIC_LINK_SECRET?.trim());
}

/** Public job URL with optional `?t=` HMAC token when {@link isCleanerJobMagicLinkSigningConfigured}. */
export function cleanerJobDeepLinkForSms(bookingId: string, cleanerId: string): string {
  const bid = String(bookingId ?? "").trim();
  const base = `${getPublicAppUrlBase()}/cleaner/jobs/${encodeURIComponent(bid)}`;
  if (!isCleanerJobMagicLinkSigningConfigured()) return base;
  try {
    const t = signCleanerJobAccessToken({ cleanerId, bookingId: bid });
    return `${base}?t=${encodeURIComponent(t)}`;
  } catch {
    return base;
  }
}

export function signCleanerJobAccessToken(params: { cleanerId: string; bookingId: string }): string {
  const secret = process.env.CLEANER_MAGIC_LINK_SECRET?.trim();
  if (!secret) throw new Error("CLEANER_MAGIC_LINK_SECRET is not set");

  const sub = String(params.cleanerId ?? "").trim();
  const bid = String(params.bookingId ?? "").trim();
  if (!sub || !bid) throw new Error("cleanerId and bookingId are required");

  const nowSec = Math.floor(serverUnixMs() / 1000);
  const payload: CleanerJobMagicPayload = {
    v: PAYLOAD_VERSION,
    typ: TYP,
    sub,
    bid,
    exp: nowSec + DEFAULT_TTL_SEC,
    jti: crypto.randomUUID(),
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${sig}`;
}

export function verifyCleanerJobAccessToken(token: string): CleanerJobMagicPayload | null {
  const secret = process.env.CLEANER_MAGIC_LINK_SECRET?.trim();
  if (!secret) return null;
  const raw = String(token ?? "").trim();
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payloadPart = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!payloadPart || !sig) return null;

  const expected = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (o.v !== PAYLOAD_VERSION || o.typ !== TYP) return null;
  const sub = typeof o.sub === "string" ? o.sub.trim() : "";
  const bid = typeof o.bid === "string" ? o.bid.trim() : "";
  const jti = typeof o.jti === "string" ? o.jti.trim() : "";
  const exp = typeof o.exp === "number" && Number.isFinite(o.exp) ? o.exp : NaN;
  if (!sub || !bid || !jti || !Number.isFinite(exp)) return null;
  if (Math.floor(serverUnixMs() / 1000) > exp) return null;

  return { v: PAYLOAD_VERSION, typ: TYP, sub, bid, exp, jti };
}
