import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ManualEftBody = {
  period_start?: string;
  period_end?: string;
  paid_date?: string;
  reference?: string;
  note?: string;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as ManualEftBody | null;
  const periodStart = body?.period_start?.trim() ?? "";
  const periodEnd = body?.period_end?.trim() ?? "";
  const paidDate = body?.paid_date?.trim() ?? "";
  const reference = body?.reference?.trim() ?? "";
  const note = body?.note?.trim() ?? "";

  if (!YMD.test(periodStart) || !YMD.test(periodEnd) || !YMD.test(paidDate)) {
    return NextResponse.json({ error: "period_start, period_end and paid_date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!reference) {
    return NextResponse.json({ error: "A bank/EFT reference is required." }, { status: 400 });
  }

  // Noon Johannesburg preserves the intended banking date regardless of UTC display.
  const paidAt = new Date(`${paidDate}T12:00:00+02:00`).toISOString();

  const { data: payouts, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, payment_status, payout_run_id")
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .neq("status", "cancelled");

  if (payoutErr) return NextResponse.json({ error: payoutErr.message }, { status: 500 });
  if (!payouts?.length) return NextResponse.json({ error: "No payout rows found for this period." }, { status: 404 });

  const payable = payouts.filter((row) => String((row as { status?: string }).status ?? "").toLowerCase() !== "paid");
  const alreadyPaid = payouts.length - payable.length;
  if (!payable.length) {
    return NextResponse.json({ ok: true, recorded: 0, already_paid: alreadyPaid, total_amount_cents: 0 });
  }

  const payoutIds = payable.map((row) => String((row as { id: string }).id));
  const runIds = [...new Set(payable.map((row) => String((row as { payout_run_id?: string | null }).payout_run_id ?? "").trim()).filter(Boolean))];

  const { data: updatedPayouts, error: updateErr } = await admin
    .from("cleaner_payouts")
    .update({
      status: "paid",
      payment_status: "paid",
      payment_reference: reference,
      paid_at: paidAt,
    })
    .in("id", payoutIds)
    .neq("status", "cancelled")
    .select("id, cleaner_id, total_amount_cents, payout_run_id");

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const updatedIds = (updatedPayouts ?? []).map((row) => String((row as { id: string }).id));
  if (!updatedIds.length) return NextResponse.json({ error: "No payout rows were updated." }, { status: 409 });

  const bookingIds = new Set<string>();
  const { data: directBookings, error: directErr } = await admin
    .from("bookings")
    .update({ payout_status: "paid", payout_paid_at: paidAt })
    .in("payout_id", updatedIds)
    .select("id");
  if (directErr) await reportOperationalIssue("error", "manual_eft_payout", directErr.message, { phase: "direct_bookings" });
  for (const row of directBookings ?? []) bookingIds.add(String((row as { id: string }).id));

  const { data: rosterRows, error: rosterErr } = await admin
    .from("booking_roster_member_payouts")
    .update({ status: "paid" })
    .in("cleaner_payout_id", updatedIds)
    .select("booking_id, cleaner_id");
  if (rosterErr) await reportOperationalIssue("error", "manual_eft_payout", rosterErr.message, { phase: "roster_members" });
  for (const row of rosterRows ?? []) bookingIds.add(String((row as { booking_id: string }).booking_id));

  const { data: teamRows, error: teamErr } = await admin
    .from("team_job_member_payouts")
    .update({ status: "paid" })
    .in("cleaner_payout_id", updatedIds)
    .select("booking_id, cleaner_id");
  if (teamErr) await reportOperationalIssue("error", "manual_eft_payout", teamErr.message, { phase: "team_members" });
  for (const row of teamRows ?? []) bookingIds.add(String((row as { booking_id: string }).booking_id));

  // Mark ledger rows paid only for the cleaner/booking pairs represented by these payout rows.
  for (const payout of updatedPayouts ?? []) {
    const payoutId = String((payout as { id: string }).id);
    const cleanerId = String((payout as { cleaner_id: string }).cleaner_id);
    const { data: items } = await admin.from("bookings").select("id").eq("payout_id", payoutId);
    const ids = (items ?? []).map((row) => String((row as { id: string }).id));
    if (ids.length) {
      const { error: earningsErr } = await admin
        .from("cleaner_earnings")
        .update({ status: "paid", paid_at: paidAt })
        .eq("cleaner_id", cleanerId)
        .in("booking_id", ids)
        .neq("status", "paid");
      if (earningsErr) {
        await reportOperationalIssue("error", "manual_eft_payout", earningsErr.message, { phase: "cleaner_earnings", payoutId, cleanerId });
      }
    }
  }

  // A run is paid only when every non-cancelled payout attached to it is paid.
  for (const runId of runIds) {
    const { count, error: remainingErr } = await admin
      .from("cleaner_payouts")
      .select("id", { count: "exact", head: true })
      .eq("payout_run_id", runId)
      .neq("status", "cancelled")
      .neq("status", "paid");
    if (remainingErr) {
      await reportOperationalIssue("error", "manual_eft_payout", remainingErr.message, { phase: "run_remaining", runId });
      continue;
    }
    if ((count ?? 0) === 0) {
      const { error: runErr } = await admin
        .from("cleaner_payout_runs")
        .update({ status: "paid", paid_at: paidAt })
        .eq("id", runId)
        .neq("status", "paid");
      if (runErr) await reportOperationalIssue("error", "manual_eft_payout", runErr.message, { phase: "run_paid", runId });
    }
  }

  const auditRows = (updatedPayouts ?? []).map((row) => ({
    event_type: "MANUAL_EFT_RECORDED",
    actor_user_id: auth.userId,
    payout_id: String((row as { id: string }).id),
    amount_cents: Math.max(0, Math.floor(Number((row as { total_amount_cents?: number }).total_amount_cents) || 0)),
    reference,
    context: {
      payment_method: "bank_eft",
      paid_date: paidDate,
      period_start: periodStart,
      period_end: periodEnd,
      note: note || null,
    },
  }));
  const { error: auditErr } = await admin.from("payout_audit_events").insert(auditRows);
  if (auditErr) await reportOperationalIssue("error", "manual_eft_payout", auditErr.message, { phase: "audit" });

  const totalAmountCents = (updatedPayouts ?? []).reduce(
    (sum, row) => sum + Math.max(0, Math.floor(Number((row as { total_amount_cents?: number }).total_amount_cents) || 0)),
    0,
  );

  await logSystemEvent({
    level: "info",
    source: "manual_eft_payout",
    message: "Recorded externally paid cleaner payouts by bank EFT",
    context: {
      period_start: periodStart,
      period_end: periodEnd,
      paid_date: paidDate,
      reference,
      payout_count: updatedIds.length,
      total_amount_cents: totalAmountCents,
      run_ids: runIds,
      note: note || null,
    },
  });

  return NextResponse.json({
    ok: true,
    payment_method: "bank_eft",
    period: { start: periodStart, end: periodEnd },
    paid_date: paidDate,
    reference,
    recorded: updatedIds.length,
    already_paid: alreadyPaid,
    total_amount_cents: totalAmountCents,
    payout_ids: updatedIds,
    run_ids: runIds,
  });
}
