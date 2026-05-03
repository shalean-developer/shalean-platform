import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isValidOfferTokenFormat } from "@/lib/dispatch/offerTokenFormat";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { allowOfferSmsTrackedLinkRequest, offerSmsTrackedLinkRateLimitKey } from "@/lib/rateLimit/offerSmsTrackedLinkIpLimit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { serverUnixMs } from "@/lib/time/serverClock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TRACK_CLICK_BUCKET_MS = 5 * 60 * 1000;
/** Tracked links older than this get `stale=1` on redirect so the UI can soften copy. */
const STALE_OFFER_LINK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * SMS click-through: idempotent metric + log, then redirect to the public offer page.
 * Preserves incoming query string (campaign tags). Same-origin redirect keeps the request host.
 */
export async function GET(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params;
  const token = String(raw ?? "").trim();
  if (!token || !isValidOfferTokenFormat(token)) {
    return NextResponse.redirect(new URL("/", request.url), 302);
  }

  const ua = (request.headers.get("user-agent") ?? "").slice(0, 160);
  const ipHash = crypto.createHash("sha256").update(offerSmsTrackedLinkRateLimitKey(request)).digest("hex").slice(0, 16);
  void logSystemEvent({
    level: "info",
    source: "dispatch_offer_click_raw",
    message: "Offer SMS tracked link request (raw, not CTR)",
    context: {
      token_prefix: token.slice(0, 8),
      ua,
      ip_hash: ipHash,
      ts: new Date().toISOString(),
    },
  });

  if (!allowOfferSmsTrackedLinkRequest(request)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const reqUrl = new URL(request.url);
  const admin = getSupabaseAdmin();

  let staleHint = false;
  if (admin) {
    const bucket = Math.floor(serverUnixMs() / TRACK_CLICK_BUCKET_MS);
    const claimed = await tryClaimNotificationIdempotency(admin, {
      reference: `sms_offer_click:v1:${token}:${bucket}`,
      eventType: "dispatch_offer_tracked_link_open",
      channel: "in_app",
    });
    if (claimed) {
      void logSystemEvent({
        level: "info",
        source: "dispatch_offer_sms_link_click",
        message: "Offer SMS tracked link opened",
        context: { token_prefix: token.slice(0, 8) },
      });
      metrics.increment("dispatch.offer.sms_tracked_link_click", { token_prefix: token.slice(0, 8) });
    }

    const { data: offerMeta } = await admin
      .from("dispatch_offers")
      .select("created_at")
      .eq("offer_token", token)
      .maybeSingle();
    const createdRaw = (offerMeta as { created_at?: string } | null)?.created_at;
    const createdMs = typeof createdRaw === "string" ? Date.parse(createdRaw) : NaN;
    if (Number.isFinite(createdMs) && serverUnixMs() - createdMs > STALE_OFFER_LINK_MAX_AGE_MS) {
      staleHint = true;
    }
  }

  const dest = new URL(`/offer/${token}`, request.url);
  dest.search = reqUrl.search;
  dest.hash = "";
  if (staleHint) {
    const p = new URLSearchParams(dest.searchParams);
    p.set("stale", "1");
    dest.search = p.toString() ? `?${p.toString()}` : "";
  }
  return NextResponse.redirect(dest, 302);
}
