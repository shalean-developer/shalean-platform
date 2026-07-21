import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  type AdminEditBookingDetailsBody,
  type AdminEditBookingDetailsResult,
  bookingRowSignalsPaid,
  isAdminEditBookingDetailsNotesOnlyBody,
} from "@/lib/booking/adminEditBookingDetails";
import { adminRepriceBooking, adminUpdateBookingNotes } from "@/lib/booking/bookingOperations";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { withMoneyActionMakerChecker } from "@/lib/payout/earningsAdjustMakerChecker";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonFromEditResult(result: AdminEditBookingDetailsResult): NextResponse {
  if (result.ok) {
    return NextResponse.json({
      ok: true,
      updated: result.updated,
      new_total: result.new_total,
      ...(result.idempotent ? { idempotent: true } : {}),
      ...(result.payment_mismatch ? { payment_mismatch: true } : {}),
    });
  }
  if ("conflict" in result && result.conflict) {
    return NextResponse.json({ ok: false, conflict: true, message: result.message }, { status: 409 });
  }
  if ("error" in result) {
    const collect = "collect_additional_cents" in result ? result.collect_additional_cents : undefined;
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(collect != null ? { collect_additional_cents: collect } : {}),
      },
      { status: result.status },
    );
  }
  return NextResponse.json({ ok: false, error: "Unexpected response." }, { status: 500 });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
  }

  const adminUserId = adminAuth.userId;

  let body: AdminEditBookingDetailsBody & { proposal_id?: string };
  try {
    body = (await request.json()) as AdminEditBookingDetailsBody & { proposal_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const idempotencyHeader = request.headers.get("idempotency-key")?.trim() ?? "";
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";

  const notesOnly = isAdminEditBookingDetailsNotesOnlyBody(body);
  if (notesOnly) {
    const result = await adminUpdateBookingNotes({
      admin,
      bookingId,
      body,
      adminUserId,
      idempotencyKey: idempotencyHeader || null,
    });
    return jsonFromEditResult(result);
  }

  const { data: bookingRow } = await admin
    .from("bookings")
    .select(
      "payment_status, payment_completed_at, amount_paid_cents, total_paid_cents, total_paid_zar",
    )
    .eq("id", bookingId)
    .maybeSingle();

  const paid = bookingRow ? bookingRowSignalsPaid(bookingRow as Record<string, unknown>) : false;

  if (!paid) {
    const result = await adminRepriceBooking({
      admin,
      bookingId,
      body,
      adminUserId,
      idempotencyKey: idempotencyHeader || null,
    });
    return jsonFromEditResult(result);
  }

  // Phase 4: paid reprice goes through maker–checker when enabled.
  let applyResult: AdminEditBookingDetailsResult | null = null;
  const gate = await withMoneyActionMakerChecker(admin, {
    actionType: "reprice_booking_details",
    bookingId,
    payload: {
      bedrooms: body.bedrooms,
      bathrooms: body.bathrooms,
      extras: body.extras,
      notes: body.notes,
      client_updated_at: body.client_updated_at,
      confirm_collect_additional: body.confirm_collect_additional,
    },
    adminUserId,
    adminEmail: user.email,
    proposalId: proposalId || null,
    apply: async () => {
      const result = await adminRepriceBooking({
        admin,
        bookingId,
        body,
        adminUserId,
        idempotencyKey: idempotencyHeader || null,
      });
      applyResult = result;
      if (!result.ok) {
        const err =
          "error" in result
            ? result.error
            : "conflict" in result
              ? result.message
              : "Repricing failed.";
        return { ok: false as const, error: err, code: "reprice_failed" };
      }
      return { ok: true as const };
    },
  });

  if (!gate.ok) {
    const status =
      gate.code === "maker_checker_self_approve" ||
      gate.code === "proposal_not_pending" ||
      gate.code === "proposal_expired" ||
      gate.code === "proposal_booking_mismatch" ||
      gate.code === "proposal_action_mismatch"
        ? 409
        : gate.code === "proposal_not_found"
          ? 404
          : 400;
    return NextResponse.json({ ok: false, error: gate.error, code: gate.code }, { status });
  }

  if (gate.mode === "proposed") {
    return NextResponse.json({
      ok: true,
      mode: "proposed",
      proposalId: gate.proposalId,
      message: "Paid reprice proposed. A second admin must approve with proposal_id.",
    });
  }

  if (applyResult) return jsonFromEditResult(applyResult);
  return NextResponse.json({ ok: true, mode: "applied", proposalId: gate.proposalId });
}
