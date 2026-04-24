import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  service: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  completed_at: string | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  payout_id: string | null;
};

type PayoutRow = {
  id: string;
  status: string | null;
  paid_at: string | null;
};

type EarningsStatus = "pending" | "approved" | "paid" | "pending_calculation";

type PaymentDetailsRow = {
  recipient_code: string | null;
};

function centsOrNull(value: unknown): number | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.round(Number(value)));
}

function centsOrZero(value: unknown): number {
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value)));
}

function normalizePayoutStatus(raw: string | null | undefined): Exclude<EarningsStatus, "pending_calculation"> {
  const status = String(raw ?? "").toLowerCase();
  if (status === "paid" || status === "approved") return status;
  return "pending";
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const { data: cleaner } = await admin.from("cleaners").select("id").eq("id", session.cleanerId).maybeSingle();
  if (!cleaner) {
    return NextResponse.json({ error: "Not a cleaner account." }, { status: 403 });
  }

  const [{ data: bookings, error }, { data: paymentDetails, error: paymentDetailsError }] = await Promise.all([
    admin
      .from("bookings")
      .select("id, service, date, time, status, completed_at, cleaner_payout_cents, cleaner_bonus_cents, payout_id")
      .eq("cleaner_id", session.cleanerId)
      .eq("status", "completed")
      .order("date", { ascending: false })
      .order("time", { ascending: false })
      .limit(200),
    admin.from("cleaner_payment_details").select("recipient_code").eq("cleaner_id", session.cleanerId).maybeSingle(),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (paymentDetailsError) {
    return NextResponse.json({ error: paymentDetailsError.message }, { status: 500 });
  }

  const rows = (bookings ?? []) as BookingRow[];
  const payoutIds = [...new Set(rows.map((row) => row.payout_id).filter((id): id is string => Boolean(id)))];
  const payoutsById = new Map<string, PayoutRow>();

  if (payoutIds.length > 0) {
    const { data: payouts, error: payoutError } = await admin
      .from("cleaner_payouts")
      .select("id, status, paid_at")
      .in("id", payoutIds);

    if (payoutError) {
      return NextResponse.json({ error: payoutError.message }, { status: 500 });
    }

    for (const payout of (payouts ?? []) as PayoutRow[]) {
      payoutsById.set(payout.id, payout);
    }
  }

  const jobs = rows.map((booking) => {
    const payout = centsOrNull(booking.cleaner_payout_cents);
    const bonus = centsOrZero(booking.cleaner_bonus_cents);
    const payoutBatch = booking.payout_id ? payoutsById.get(booking.payout_id) : null;
    const status: EarningsStatus = payout == null ? "pending_calculation" : normalizePayoutStatus(payoutBatch?.status);
    const total = payout == null ? null : payout + bonus;

    return {
      bookingId: booking.id,
      date: booking.completed_at ?? (booking.date ? `${booking.date}${booking.time ? `T${booking.time}` : "T12:00:00"}` : null),
      service: booking.service?.trim() || "Cleaning",
      payout,
      bonus,
      total,
      status,
      paidAt: status === "paid" ? (payoutBatch?.paid_at ?? null) : null,
    };
  });

  const totalEarned = jobs.reduce((sum, job) => sum + (job.total ?? 0), 0);
  const totalPaid = jobs
    .filter((job) => job.status === "paid")
    .reduce((sum, job) => sum + (job.total ?? 0), 0);

  return NextResponse.json({
    summary: {
      totalEarned,
      totalPaid,
      totalPending: totalEarned - totalPaid,
    },
    paymentDetails: {
      readyForPayout: Boolean((paymentDetails as PaymentDetailsRow | null)?.recipient_code?.trim()),
      missingBankDetails: !((paymentDetails as PaymentDetailsRow | null)?.recipient_code?.trim()),
    },
    jobs,
  });
}
