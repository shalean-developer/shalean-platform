import "server-only";

import crypto from "node:crypto";
import { getPublicAppUrlBase } from "@/lib/email/appUrl";
import { serverUnixMs } from "@/lib/time/serverClock";

const TYP = "customer_rebook" as const;
const PAYLOAD_VERSION = 1;
/** 90 days — long enough for email links, short enough to limit stale deep-links. */
const DEFAULT_TTL_SEC = 90 * 24 * 60 * 60;

export type CustomerRebookTokenPayload = {
  v: typeof PAYLOAD_VERSION;
  typ: typeof TYP;
  /** Auth user id, or `booking:{id}` for guest rows without a linked account. */
  sub: string;
  /** Optional booking id this link is bound to (lifecycle / rebook flows). */
  bid?: string;
  exp: number;
};

export function isCustomerRebookLinkSigningConfigured(): boolean {
  return Boolean(process.env.CUSTOMER_REBOOK_LINK_SECRET?.trim());
}

export function signCustomerRebookToken(params: {
  userId: string;
  bookingId?: string;
  ttlSec?: number;
}): string {
  const secret = process.env.CUSTOMER_REBOOK_LINK_SECRET?.trim();
  if (!secret) throw new Error("CUSTOMER_REBOOK_LINK_SECRET is not set");

  const sub = String(params.userId ?? "").trim();
  if (!sub) throw new Error("userId is required");

  const bid = params.bookingId?.trim() || undefined;
  const nowSec = Math.floor(serverUnixMs() / 1000);
  const payload: CustomerRebookTokenPayload = {
    v: PAYLOAD_VERSION,
    typ: TYP,
    sub,
    ...(bid ? { bid } : {}),
    exp: nowSec + (params.ttlSec ?? DEFAULT_TTL_SEC),
  };
  const payloadPart = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
  return `${payloadPart}.${sig}`;
}

export function verifyCustomerRebookToken(token: string): CustomerRebookTokenPayload | null {
  const secret = process.env.CUSTOMER_REBOOK_LINK_SECRET?.trim();
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
  const bid = typeof o.bid === "string" ? o.bid.trim() : undefined;
  const exp = typeof o.exp === "number" && Number.isFinite(o.exp) ? o.exp : NaN;
  if (!sub || !Number.isFinite(exp)) return null;
  if (Math.floor(serverUnixMs() / 1000) > exp) return null;

  return { v: PAYLOAD_VERSION, typ: TYP, sub, ...(bid ? { bid } : {}), exp };
}

/** Public `/rebook` URL with optional signed token for personalised landing. */
export function customerRebookLandingUrl(params: { userId: string; bookingId?: string }): string {
  const base = getPublicAppUrlBase();
  if (isCustomerRebookLinkSigningConfigured()) {
    try {
      const t = signCustomerRebookToken(params);
      return `${base}/rebook?t=${encodeURIComponent(t)}`;
    } catch {
      // fall through to unsigned URL
    }
  }
  return `${base}/rebook`;
}

/** Guest bookings without a linked auth user — token scoped to the booking row. */
export function customerRebookTokenSubjectForBooking(bookingId: string): string {
  return `booking:${bookingId.trim()}`;
}
