import { NextResponse } from "next/server";
import { buildBookingAgentQuote } from "@/lib/ai/bookingAgentQuote";
import { logAiDecision } from "@/lib/ai/logAiDecision";
import { intentToStep1State, parseBookingIntent } from "@/lib/ai/parseBookingIntent";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { fetchSlotAdjustmentMap } from "@/lib/pricing/loadDynamicPricing";
import { resolveVipTierForUserId } from "@/lib/booking/resolveVipTierServer";
import { verifySupabaseAccessToken } from "@/lib/booking/verifySupabaseSession";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function summarizeQuote(dateYmd: string, priceZar: number): string {
  return `Here’s your quote for ${dateYmd}: from R${priceZar.toLocaleString("en-ZA")} for the suggested time. Pick a slot to lock pricing, then confirm to pay securely.`;
}

async function resolveUserIdFromRequest(accessToken: string | undefined): Promise<string | null> {
  const t = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!t) return null;
  const verified = await verifySupabaseAccessToken(t);
  return verified?.id ?? null;
}

/**
 * AI booking agent: natural-language quote + Paystack confirm (same validation as web checkout).
 *
 * Body:
 * - `{ action: "quote", message: string, accessToken?: string, overrideTime?: string, dateYmd?: string }`
 * - `{ action: "pay", ... }` — same shape as `/api/paystack/initialize`
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
    const result = await processPaystackInitializeBody(body);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const userId = await resolveUserIdFromRequest(
      typeof body.accessToken === "string" ? body.accessToken : undefined,
    );
    const admin = getSupabaseAdmin();
    if (admin) {
      const { error: evErr } = await admin.from("user_events").insert({
        user_id: userId,
        event_type: "booking_agent_confirm",
        booking_id: null,
        payload: { reference: result.reference, source: "ai_booking_agent" },
      });
      if (evErr) {
        /* non-fatal if analytics schema lags */
      }
      await logAiDecision("booking_agent_pay", {
        user_id: userId,
        reference: result.reference,
      });
    }
    return NextResponse.json({
      ok: true,
      authorizationUrl: result.authorizationUrl,
      reference: result.reference,
      confirmationLabel: "Pay now",
    });
  }

  if (action !== "quote") {
    return NextResponse.json({ error: "Invalid action. Use quote or pay." }, { status: 400 });
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

  const quote = buildBookingAgentQuote(intent, step1, {
    vipTier,
    slotAdjustments,
    overrideTime,
    dateYmdOverride,
  });

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
    confirmationHint: "POST with action pay using the same payload as /api/paystack/initialize.",
  });
}
