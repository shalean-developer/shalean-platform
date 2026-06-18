import { NextResponse } from "next/server";
import { fetchAdminDashboardConversionSummary } from "@/lib/admin/dashboardConversion";
import { fetchAdminDashboardRevenueSummary } from "@/lib/admin/dashboardRevenue";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { startOfTodayJohannesburgUtcIso } from "@/lib/booking/dateInJohannesburg";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { bucketSmsFailure, bucketWhatsappFailure } from "@/lib/notifications/notificationFailureBuckets";
import { NOTIFICATION_COST_CURRENCY } from "@/lib/notifications/notificationCostEstimates";
import { runProductionHealthScan } from "@/lib/observability/productionHealthMetrics";
import {
  applyOpsHealthAcknowledgements,
  listOpsHealthAcknowledgements,
} from "@/lib/observability/opsHealthAcknowledgements";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 30);
  const fetchedAt = new Date().toISOString();

  const sinceNotify = startOfTodayJohannesburgUtcIso();
  const refundWindowStartIso = since.toISOString();

  const [
    revenueSummary,
    conversionSummary,
    notifyRes,
    flagsRes,
    contactHealthRes,
    pendingPaymentsRes,
    overdueMonthlyInvoicesRes,
    refundsRes,
    recentBookingsRes,
    recentNotificationsRes,
    recentSystemLogsRes,
    recentCronRunsRes,
    productionHealthRes,
    opsHealthAcknowledgements,
  ] = await Promise.all([
    fetchAdminDashboardRevenueSummary(admin),
    fetchAdminDashboardConversionSummary(admin, since.toISOString()),
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
    admin
      .from("bookings")
      .select("id,total_price,total_paid_zar,amount_paid_cents,created_at")
      .in("status", ["pending_payment"])
      .in("payment_status", ["pending", "pending_payment"])
      .limit(1000),
    admin
      .from("monthly_invoices")
      .select("id,balance_cents,status,is_overdue,due_date")
      .or("status.eq.overdue,is_overdue.eq.true")
      .limit(1000),
    admin
      .from("bookings")
      .select("id,total_paid_zar,amount_paid_cents,refunded_at,refund_status")
      .or(`refunded_at.gte.${refundWindowStartIso},refund_status.in.(refunded,full,partial,chargeback,reversed)`)
      .limit(1000),
    admin
      .from("bookings")
      .select("id,status,service,date,time,total_paid_zar,amount_paid_cents,customer_name,cleaner_id,created_at,payment_completed_at,assigned_at,became_pending_at")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("notification_logs")
      .select("id,channel,status,template_key,created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("system_logs")
      .select("id,level,source,message,created_at,context")
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("cron_runs")
      .select("job_name,status,message,created_at")
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(80),
    runProductionHealthScan(admin, { scanLimit: 250 }).then(
      (summary) => ({ ok: true as const, summary }),
      (error) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }),
    ),
    listOpsHealthAcknowledgements(admin),
  ]);

  const notificationsAvailable = !notifyRes.error;
  if (notifyRes.error) {
    await logSystemEvent({
      level: "warn",
      source: "notification_logs",
      message: "dashboard_stats_read_failed",
      context: { error: notifyRes.error.message },
    });
  }

  const notifyRows = (notificationsAvailable ? (notifyRes.data ?? []) : []) as {
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

  const centsFromBookingAmount = (row: {
    total_price?: unknown;
    total_paid_zar?: unknown;
    amount_paid_cents?: unknown;
  }): number => {
    const paidCents = Number(row.amount_paid_cents);
    if (Number.isFinite(paidCents) && paidCents > 0) return Math.round(paidCents);
    const paidZar = Number(row.total_paid_zar);
    if (Number.isFinite(paidZar) && paidZar > 0) return Math.round(paidZar * 100);
    const totalPrice = Number(row.total_price);
    if (Number.isFinite(totalPrice) && totalPrice > 0) return Math.round(totalPrice * 100);
    return 0;
  };

  const pendingPaymentRows = pendingPaymentsRes.error ? [] : (pendingPaymentsRes.data ?? []);
  const pendingPaymentCents = pendingPaymentRows.reduce((sum, row) => sum + centsFromBookingAmount(row), 0);
  const overdueInvoiceRows = overdueMonthlyInvoicesRes.error ? [] : (overdueMonthlyInvoicesRes.data ?? []);
  const overdueMonthlyInvoiceCents = overdueInvoiceRows.reduce((sum, row) => {
    const cents = Number((row as { balance_cents?: unknown }).balance_cents);
    return sum + (Number.isFinite(cents) && cents > 0 ? Math.round(cents) : 0);
  }, 0);
  const refundRows = refundsRes.error ? [] : (refundsRes.data ?? []);
  const refundCents = refundRows.reduce((sum, row) => sum + centsFromBookingAmount(row), 0);

  const activityTime = (iso: string | null | undefined): number => {
    if (!iso) return 0;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const recentBookingActivities = (recentBookingsRes.error ? [] : (recentBookingsRes.data ?? [])).flatMap((row) => {
    const r = row as {
      id?: string | null;
      status?: string | null;
      service?: string | null;
      date?: string | null;
      time?: string | null;
      customer_name?: string | null;
      cleaner_id?: string | null;
      created_at?: string | null;
      payment_completed_at?: string | null;
      assigned_at?: string | null;
      became_pending_at?: string | null;
    };
    const bookingId = String(r.id ?? "").slice(0, 8);
    const service = String(r.service ?? "Booking").replace(/-/g, " ");
    const dateTime = [r.date, r.time?.slice(0, 5)].filter(Boolean).join(" at ");
    const out: Array<{ createdAt: string; type: string; details: string; user: string; severity: string }> = [];
    if (r.created_at) {
      out.push({
        createdAt: r.created_at,
        type: "New booking",
        details: `${service}${dateTime ? ` on ${dateTime}` : ""}${bookingId ? ` (#${bookingId})` : ""}`,
        user: r.customer_name?.trim() || "Customer",
        severity: "info",
      });
    }
    if (r.payment_completed_at) {
      out.push({
        createdAt: r.payment_completed_at,
        type: "Payment received",
        details: `Payment captured${bookingId ? ` for booking #${bookingId}` : ""}`,
        user: "System",
        severity: "success",
      });
    }
    if (r.assigned_at || r.cleaner_id) {
      out.push({
        createdAt: r.assigned_at ?? r.created_at ?? new Date(0).toISOString(),
        type: "Cleaner assigned",
        details: `Cleaner assigned${bookingId ? ` to booking #${bookingId}` : ""}`,
        user: "Admin",
        severity: "info",
      });
    }
    if (String(r.status ?? "").toLowerCase() === "pending" && r.became_pending_at) {
      out.push({
        createdAt: r.became_pending_at,
        type: "Booking pending dispatch",
        details: `Booking${bookingId ? ` #${bookingId}` : ""} is waiting for cleaner assignment`,
        user: "System",
        severity: "warning",
      });
    }
    return out;
  });

  const recentNotificationActivities = (recentNotificationsRes.error ? [] : (recentNotificationsRes.data ?? [])).map((row) => {
    const r = row as {
      channel?: string | null;
      status?: string | null;
      template_key?: string | null;
      created_at?: string | null;
    };
    const status = String(r.status ?? "").toLowerCase();
    return {
      createdAt: r.created_at ?? new Date(0).toISOString(),
      type: status === "failed" ? "Notification failed" : "Notification sent",
      details: `${String(r.channel ?? "notification")} ${String(r.template_key ?? "message")}`,
      user: "System",
      severity: status === "failed" ? "error" : "success",
    };
  });

  const recentSystemLogActivities = (recentSystemLogsRes.error ? [] : (recentSystemLogsRes.data ?? [])).map((row) => {
    const r = row as {
      level?: string | null;
      source?: string | null;
      message?: string | null;
      created_at?: string | null;
      context?: Record<string, unknown> | null;
    };
    const level = String(r.level ?? "").toLowerCase();
    const source = String(r.source ?? "system").replace(/_/g, " ");
    const message = String(r.message ?? "System event");
    return {
      createdAt: r.created_at ?? new Date(0).toISOString(),
      type: source,
      details: message,
      user: "System",
      severity: level === "error" ? "error" : level === "warn" ? "warning" : "info",
    };
  });

  const recentCronActivities = (recentCronRunsRes.error ? [] : (recentCronRunsRes.data ?? [])).slice(0, 10).map((row) => {
    const r = row as {
      job_name?: string | null;
      status?: string | null;
      message?: string | null;
      created_at?: string | null;
    };
    const status = String(r.status ?? "").toLowerCase();
    return {
      createdAt: r.created_at ?? new Date(0).toISOString(),
      type: status === "error" ? "Cron failed" : "Cron completed",
      details: `${String(r.job_name ?? "cron job")}${r.message ? `: ${String(r.message).slice(0, 140)}` : ""}`,
      user: "System",
      severity: status === "error" ? "error" : "success",
    };
  });

  const recentActivity = [
    ...recentSystemLogActivities,
    ...recentCronActivities,
    ...recentBookingActivities,
    ...recentNotificationActivities,
  ]
    .filter((a) => activityTime(a.createdAt) > 0)
    .sort((a, b) => activityTime(b.createdAt) - activityTime(a.createdAt))
    .slice(0, 6);

  const productionHealthSummaryRaw = productionHealthRes.ok ? productionHealthRes.summary : null;
  const productionHealthSummary = productionHealthSummaryRaw
    ? applyOpsHealthAcknowledgements(productionHealthSummaryRaw, opsHealthAcknowledgements).visibleSummary
    : null;
  const productionFindings = productionHealthSummary?.findings ?? [];
  const hasCritical = (productionHealthSummary?.totals.critical ?? 0) > 0;
  const hasBookingEngineHighFindings = productionFindings.some((f) => {
    if (f.severity !== "critical" && f.severity !== "high") return false;
    return (
      f.code.includes("dispatch") ||
      f.code.includes("cron") ||
      f.code.includes("recurring") ||
      f.code.includes("duration") ||
      f.code.includes("workload")
    );
  });
  const hasPaymentHighFindings = productionFindings.some((f) => {
    if (f.severity !== "critical" && f.severity !== "high") return false;
    return f.code.includes("payment") || f.code.includes("invoice") || f.code.includes("payout");
  });
  const cronErrorsLast24h = (recentCronRunsRes.error ? [] : (recentCronRunsRes.data ?? [])).filter(
    (row) => String((row as { status?: string | null }).status ?? "").toLowerCase() === "error",
  ).length;

  return NextResponse.json({
    fetchedAt,
    revenueTodayZar: revenueSummary.revenueTodayZar,
    revenueMonthZar: revenueSummary.revenueMonthZar,
    paidBookingsToday: revenueSummary.paidBookingsToday,
    paidBookingsMonth: revenueSummary.paidBookingsMonth,
    totalBookingsWindow: revenueSummary.totalPaidBookingsWindow,
    avgBookingValueZar: revenueSummary.avgBookingValueZar,
    revenueScope: revenueSummary.scope,
    revenueWindow: {
      windowStartIso: revenueSummary.windowStartIso,
      monthStartIso: revenueSummary.monthStartIso,
      todayStartIso: revenueSummary.todayStartIso,
      todayEndExclusiveIso: revenueSummary.todayEndExclusiveIso,
      timezone: "Africa/Johannesburg",
    },
    conversionAvailable: conversionSummary.available,
    conversionRatePct: conversionSummary.conversionRatePct,
    funnelSessionsQuote: conversionSummary.funnelSessionsQuote,
    funnelSessionsPayment: conversionSummary.funnelSessionsPayment,
    ...(conversionSummary.available ? {} : { conversionError: conversionSummary.error }),
    revenueByDay: revenueSummary.revenueByDay,
    bookingsByDay: revenueSummary.bookingsByDay,
    notificationsToday: {
      available: notificationsAvailable,
      ...(notificationsAvailable ? {} : { error: notifyRes.error?.message ?? "Could not read notification logs." }),
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
    paymentsSnapshot: {
      pendingZar: Math.round(pendingPaymentCents / 100),
      pendingCount: pendingPaymentRows.length,
      overdueZar: Math.round(overdueMonthlyInvoiceCents / 100),
      overdueCount: overdueInvoiceRows.length,
      refunds30dZar: Math.round(refundCents / 100),
      refunds30dCount: refundRows.length,
    },
    recentActivity,
    systemStatus: {
      website: recentSystemLogsRes.error ? "degraded" : "operational",
      bookingEngine:
        productionHealthRes.ok === false || hasCritical
          ? "down"
          : recentBookingsRes.error || hasBookingEngineHighFindings || cronErrorsLast24h > 0
            ? "degraded"
            : "operational",
      paymentGateway:
        pendingPaymentsRes.error || refundsRes.error || hasCritical
          ? "down"
          : hasPaymentHighFindings
            ? "degraded"
            : "operational",
      productionHealth: productionHealthSummary
        ? {
            generatedAt: productionHealthSummary.generatedAt,
            totals: productionHealthSummary.totals,
            totalFindings: productionFindings.reduce((sum, finding) => sum + finding.count, 0),
            topFindings: productionFindings.slice(0, 3).map((finding) => ({
              code: finding.code,
              severity: finding.severity,
              count: finding.count,
              message: finding.message,
            })),
          }
        : {
            error: productionHealthRes.ok === false ? productionHealthRes.error : "Production health unavailable.",
          },
      cronErrorsLast24h,
    },
  });
}
