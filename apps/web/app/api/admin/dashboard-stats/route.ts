import { NextResponse } from "next/server";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { startOfTodayJohannesburgUtcIso, todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { bucketSmsFailure, bucketWhatsappFailure } from "@/lib/notifications/notificationFailureBuckets";
import { NOTIFICATION_COST_CURRENCY } from "@/lib/notifications/notificationCostEstimates";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingMini = {
  created_at: string | null;
  date: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
};

type EventRow = { session_id: string; step: string; event_type: string };

function zar(b: BookingMini): number {
  if (typeof b.total_paid_zar === "number") return b.total_paid_zar;
  return Math.round((b.amount_paid_cents ?? 0) / 100);
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthStartYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const sinceNotify = startOfTodayJohannesburgUtcIso();

  const [bookingsRes, eventsRes, notifyRes, flagsRes, contactHealthRes] = await Promise.all([
    admin
      .from("bookings")
      .select("created_at, date, total_paid_zar, amount_paid_cents")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(12000),
    admin
      .from("booking_events")
      .select("session_id, step, event_type")
      .gte("created_at", since.toISOString())
      .limit(25000),
    admin
      .from("notification_logs")
      .select("channel, status, role, template_key, error, decision, payload")
      .gte("created_at", sinceNotify)
      .limit(20000),
    admin.from("notification_runtime_flags").select("whatsapp_disabled_until").eq("id", 1).maybeSingle(),
    admin
      .from("customer_contact_health")
      .select("phone_key, success_rate, sample_size, last_updated")
      .gte("sample_size", 3)
      .order("success_rate", { ascending: true })
      .order("sample_size", { ascending: false })
      .limit(8),
  ]);

  if (bookingsRes.error) {
    return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
  }

  const bookings = (bookingsRes.data ?? []) as BookingMini[];
  const events = (eventsRes.error ? [] : (eventsRes.data ?? [])) as EventRow[];
  const notifyRows = (notifyRes.error ? [] : (notifyRes.data ?? [])) as {
    channel: string;
    status: string;
    role: string | null;
    template_key: string | null;
    error: string | null;
    decision: string | null;
    payload: Record<string, unknown> | null;
  }[];
  const topFailingContacts = (contactHealthRes.error ? [] : (contactHealthRes.data ?? [])).map((row) => {
    const r = row as {
      phone_key?: string | null;
      success_rate?: number | null;
      sample_size?: number | null;
      last_updated?: string | null;
    };
    return {
      phoneKey: String(r.phone_key ?? ""),
      successRate: Math.max(0, Math.min(1, Number(r.success_rate ?? 0))),
      sampleSize: Math.max(0, Number(r.sample_size ?? 0)),
      lastUpdated: typeof r.last_updated === "string" ? r.last_updated : null,
    };
  }).filter((r) => r.phoneKey && r.sampleSize >= 3);

  const waFailBuckets: Record<string, number> = {};
  const smsFailBuckets: Record<string, number> = {};

  let emailSent = 0;
  let emailFailed = 0;
  let whatsappSent = 0;
  let whatsappFailed = 0;
  let smsSent = 0;
  let smsFailed = 0;
  let cleanerSmsDirect = 0;
  const decisionBreakdown: Record<string, number> = {};
  const decisionStats: Record<string, { total: number; success: number }> = {};
  let costEmail = 0;
  let costWhatsapp = 0;
  let costSms = 0;
  for (const n of notifyRows) {
    if (n.channel === "email") {
      if (n.status === "sent") emailSent++;
      else if (n.status === "failed") emailFailed++;
    } else if (n.channel === "whatsapp") {
      if (n.status === "sent") whatsappSent++;
      else if (n.status === "failed") {
        whatsappFailed++;
        const b = bucketWhatsappFailure(n.error);
        waFailBuckets[b] = (waFailBuckets[b] ?? 0) + 1;
      }
    } else if (n.channel === "sms") {
      if (n.status === "sent") smsSent++;
      else if (n.status === "failed") {
        smsFailed++;
        const b = bucketSmsFailure(n.error);
        smsFailBuckets[b] = (smsFailBuckets[b] ?? 0) + 1;
      }
      const tk = String(n.template_key ?? "");
      if (n.role === "cleaner" && tk.includes("sms") && n.status === "sent") cleanerSmsDirect++;
    }

    const p = n.payload && typeof n.payload === "object" && !Array.isArray(n.payload) ? n.payload : null;
    const dec =
      typeof n.decision === "string" && n.decision.trim()
        ? n.decision.trim()
        : p && typeof p.decision === "string" && p.decision.trim()
          ? p.decision.trim()
          : null;
    if (dec) {
      decisionBreakdown[dec] = (decisionBreakdown[dec] ?? 0) + 1;
      const current = decisionStats[dec] ?? { total: 0, success: 0 };
      current.total++;
      if (n.status === "sent") current.success++;
      decisionStats[dec] = current;
    }
    const rawCost = p ? (p as { cost_estimate?: unknown }).cost_estimate : undefined;
    const c = typeof rawCost === "number" ? rawCost : Number(rawCost);
    if (Number.isFinite(c) && c >= 0) {
      if (n.channel === "email") {
        costEmail += c;
      } else if (n.channel === "whatsapp") {
        costWhatsapp += c;
      } else if (n.channel === "sms") {
        costSms += c;
      }
    }
  }
  const roundUsd4 = (x: number) => Math.round(x * 10_000) / 10_000;
  const costPerSuccess = (cost: number, success: number): number | null =>
    success > 0 ? roundUsd4(cost / success) : null;
  const totalCostTodayUsd = roundUsd4(costEmail + costWhatsapp + costSms);
  const totalSuccessfulDeliveries = emailSent + whatsappSent + smsSent;
  const decisionPerformance = Object.fromEntries(
    Object.entries(decisionStats).map(([decision, stats]) => [
      decision,
      {
        total: stats.total,
        success: stats.success,
        rate: stats.total > 0 ? Math.round((stats.success / stats.total) * 10_000) / 10_000 : null,
      },
    ]),
  );

  const waTotal = whatsappSent + whatsappFailed;
  const whatsappSuccessRatePct =
    waTotal > 0 ? Math.round((whatsappSent / waTotal) * 1000) / 10 : null;

  const pctOf = (part: number, whole: number): number | null =>
    whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

  const whatsappFailureBreakdown: Record<string, { count: number; pctOfFailed: number | null }> = {};
  for (const [k, v] of Object.entries(waFailBuckets)) {
    whatsappFailureBreakdown[k] = { count: v, pctOfFailed: pctOf(v, whatsappFailed) };
  }
  const smsFailureBreakdown: Record<string, { count: number; pctOfFailed: number | null }> = {};
  for (const [k, v] of Object.entries(smsFailBuckets)) {
    smsFailureBreakdown[k] = { count: v, pctOfFailed: pctOf(v, smsFailed) };
  }

  let whatsappPausedUntilIso: string | null = null;
  if (flagsRes.error) {
    await logSystemEvent({
      level: "warn",
      source: "notification_runtime_flags",
      message: "dashboard_stats_read_failed",
      context: { error: flagsRes.error.message },
    });
  } else if (flagsRes.data) {
    const u = (flagsRes.data as { whatsapp_disabled_until?: string | null }).whatsapp_disabled_until;
    if (typeof u === "string" && u.trim()) {
      const t = new Date(u).getTime();
      if (Number.isFinite(t) && t > Date.now()) whatsappPausedUntilIso = u.trim();
    }
  }

  const allChannelsDegraded =
    Boolean(whatsappPausedUntilIso) &&
    smsFailed >= 3 &&
    emailFailed >= 3;

  const today = todayYmdJohannesburg();
  const monthStart = monthStartYmd();

  let revenueToday = 0;
  let revenueMonth = 0;
  let paidBookingsToday = 0;
  let paidBookingsMonth = 0;

  const revenueByDay = new Map<string, number>();
  const bookingsByDay = new Map<string, number>();

  for (const b of bookings) {
    const z = zar(b);
    const created = String(b.created_at ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(created)) continue;

    bookingsByDay.set(created, (bookingsByDay.get(created) ?? 0) + 1);

    if (z <= 0) continue;

    revenueByDay.set(created, (revenueByDay.get(created) ?? 0) + z);

    if (created === today) {
      revenueToday += z;
      paidBookingsToday++;
    }
    if (created >= monthStart) {
      revenueMonth += z;
      paidBookingsMonth++;
    }
  }

  const totalPaidBookings = bookings.filter((b) => zar(b) > 0).length;
  const avgBookingValue =
    totalPaidBookings > 0
      ? Math.round(bookings.reduce((s, b) => s + zar(b), 0) / Math.max(1, totalPaidBookings))
      : 0;

  const quoteViews = new Set<string>();
  const paymentReached = new Set<string>();
  for (const e of events) {
    if (e.event_type === "view" && e.step === "quote") quoteViews.add(e.session_id);
    if ((e.event_type === "view" || e.event_type === "next") && e.step === "payment") {
      paymentReached.add(e.session_id);
    }
  }
  const funnelStart = Math.max(quoteViews.size, 1);
  const conversionRatePct = Math.round((paymentReached.size / funnelStart) * 1000) / 10;

  const days = 30;
  const revenueSeries: { date: string; revenue: number }[] = [];
  const bookingSeries: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = ymd(d);
    revenueSeries.push({ date: key, revenue: revenueByDay.get(key) ?? 0 });
    bookingSeries.push({ date: key, count: bookingsByDay.get(key) ?? 0 });
  }

  return NextResponse.json({
    revenueTodayZar: revenueToday,
    revenueMonthZar: revenueMonth,
    paidBookingsToday,
    paidBookingsMonth,
    totalBookingsWindow: bookings.length,
    avgBookingValueZar: avgBookingValue,
    conversionRatePct,
    funnelSessionsQuote: quoteViews.size,
    funnelSessionsPayment: paymentReached.size,
    revenueByDay: revenueSeries,
    bookingsByDay: bookingSeries,
    notificationsToday: {
      windowStartIso: sinceNotify,
      email: { sent: emailSent, failed: emailFailed },
      whatsapp: { sent: whatsappSent, failed: whatsappFailed },
      sms: { sent: smsSent, failed: smsFailed },
      whatsappSuccessRatePct,
      cleanerSmsDirectSent: cleanerSmsDirect,
      whatsappPausedUntilIso,
      allChannelsDegraded,
      providerHealth: {
        whatsapp: {
          totalAttempts: waTotal,
          successRatePct: whatsappSuccessRatePct,
          failureBreakdown: whatsappFailureBreakdown,
        },
        sms: {
          failed: smsFailed,
          failureBreakdown: smsFailureBreakdown,
        },
      },
      decisionBreakdown,
      decisionPerformance,
      notificationCostTodayUsd: {
        total: totalCostTodayUsd,
        byChannel: {
          email: roundUsd4(costEmail),
          whatsapp: roundUsd4(costWhatsapp),
          sms: roundUsd4(costSms),
        },
        costPerSuccessByChannel: {
          email: costPerSuccess(costEmail, emailSent),
          whatsapp: costPerSuccess(costWhatsapp, whatsappSent),
          sms: costPerSuccess(costSms, smsSent),
        },
        totalCostPerSuccess: costPerSuccess(totalCostTodayUsd, totalSuccessfulDeliveries),
        currency: NOTIFICATION_COST_CURRENCY,
      },
      topFailingContacts,
    },
  });
}
