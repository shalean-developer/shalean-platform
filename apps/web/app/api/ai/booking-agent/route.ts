import { NextResponse } from "next/server";
import { buildBookingAgentQuote } from "@/lib/ai/bookingAgentQuote";
import { logAiDecision } from "@/lib/ai/logAiDecision";
import { intentToStep1State, parseBookingIntent } from "@/lib/ai/parseBookingIntent";
import { fetchSlotAdjustmentMap } from "@/lib/pricing/loadDynamicPricing";
import { resolveVipTierForUserId } from "@/lib/booking/resolveVipTierServer";
import { verifySupabaseAccessToken } from "@/lib/booking/verifySupabaseSession";
import { getSupabaseAdmin, supabaseAdminNotConfiguredBody } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarizeQuote(dateYmd: string, priceZar: number): string {
  return `Here’s your quote for ${dateYmd}: from R${priceZar.toLocaleString("en-ZA")} for the suggested time. Continue in the booking flow to choose a slot and pay securely.`;
}

async function resolveUserIdFromRequest(accessToken: string | undefined): Promise<string | null> {
  const t = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!t) return null;
  const verified = await verifySupabaseAccessToken(t);
  return verified?.id ?? null;
}

/**
 * AI booking agent: natural-language quote/recommendation only.
 *
 * Payment initiation is intentionally not supported here. Customer checkout must continue through
 * the canonical `/book` → `/api/booking-v2/confirm` → payment-session flow.
 *
 * Body:
 * - `{ action: "quote", message: string, accessToken?: string, overrideTime?: string, dateYmd?: string }`
 * - `{ action: "pay", ... }` — retired; returns 410 with the canonical booking path.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";

  if (action === "pay") {
    return NextResponse.json(
      {
        ok: false,
        error: "Direct AI booking payment is retired. Continue through the booking flow to pay securely.",
        errorCode: "AI_BOOKING_AGENT_PAY_RETIRED",
        bookingPath: "/book",
        customerPricingSot: "booking_v2",
      },
      { status: 410 },
    );
  }

  if (action !== "quote") {
    return NextResponse.json({ error: "Invalid action. Use quote." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const userId = await resolveUserIdFromRequest(
    typeof body.accessToken === "string" ? body.accessToken : undefined,
  );
  const vipTier = await resolveVipTierForUserId(userId);

  const intent = parseBookingIntent(message);
  const step1 = intentToStep1State(intent);

  const dateYmdOverride =
    typeof body.dateYmd === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dateYmd) ? body.dateYmd.trim() : null;

  const slotAdjustments = await fetchSlotAdjustmentMap();
  const overrideTime = typeof body.overrideTime === "string" ? body.overrideTime : null;

  let quote;
  try {
    quote = await buildBookingAgentQuote(intent, step1, {
      vipTier,
      slotAdjustments,
      overrideTime,
      dateYmdOverride,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("not configured") || msg.includes("could not be loaded")) {
      return NextResponse.json(supabaseAdminNotConfiguredBody(), { status: 503 });
    }
    throw e;
  }

  const summary = summarizeQuote(quote.dateYmd, quote.suggestedLocked.finalPrice);

  await logAiDecision("booking_agent_quote", {
    user_id: userId,
    intent,
    dateYmd: quote.dateYmd,
    suggested_time: quote.suggestedLocked.time,
    final_price: quote.suggestedLocked.finalPrice,
  });

  const admin = getSupabaseAdmin();
  if (admin && userId) {
    const q1 = await admin.from("user_events").insert({
      user_id: userId,
      event_type: "booking_agent_quote",
      booking_id: null,
      payload: { dateYmd: quote.dateYmd, time: quote.suggestedLocked.time, price: quote.suggestedLocked.finalPrice },
    });
    if (q1.error) {
      /* non-fatal */
    }
    const q2 = await admin.from("user_behavior").insert({
      user_id: userId,
      session_id: typeof body.sessionId === "string" ? body.sessionId : null,
      signal_type: "booking_agent_quote",
      payload: { intent, slots: quote.slots.map((s) => s.time) },
    });
    if (q2.error) {
      /* non-fatal */
    }
  }

  return NextResponse.json({
    ok: true,
    intent,
    step1: quote.step1,
    dateYmd: quote.dateYmd,
    slots: quote.slots,
    recommendations: {
      bestValue: quote.recommendations.bestValue,
      recommended: quote.recommendations.recommended,
      fastest: quote.recommendations.fastest,
    },
    personalizationNote: quote.personalizationNote ?? null,
    suggestedLocked: quote.suggestedLocked,
    smartExtras: quote.smartExtras,
    vipTier,
    summary,
    bookingPath: "/book",
    confirmationHint: "Continue through /book to confirm the booking and start the server-created payment session.",
  });
}
