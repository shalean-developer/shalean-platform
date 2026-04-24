import type { SupabaseClient } from "@supabase/supabase-js";
import { extractBookingIdFromLogContext } from "@/lib/booking/bookingIds";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";

export { extractBookingIdFromLogContext };

export type NotificationDerived = {
  whatsappSuccessRate: number | null;
  whatsappErrorRate: number | null;
  smsFallbackRate: number | null;
  emailSuccessRate: number | null;
  emailErrorRate: number | null;
  whatsappTotal: number;
  smsTotal: number;
  emailTotal: number;
  slowNotificationCount: number;
};

function pct1(num: number, den: number): number | null {
  if (den <= 0 || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return Math.round((1000 * num) / den) / 10;
}

export function computeNotificationDerived(n: (key: string) => number): NotificationDerived {
  const whatsappOk = n("cleaner_whatsapp_sent");
  const whatsappFail = n("cleaner_whatsapp_failed");
  const smsFallback = n("cleaner_sms_fallback_used");
  const smsOther = n("sms_fallback_sent");
  const waDenom = whatsappOk + whatsappFail;

  const emailSent = n("email_sent");
  const emailFailed = n("email_failed");
  const emailDenom = emailSent + emailFailed;
  const slowNotificationCount = n("slow_notification");

  return {
    whatsappSuccessRate: pct1(whatsappOk, waDenom),
    whatsappErrorRate: pct1(whatsappFail, waDenom),
    smsFallbackRate: pct1(smsFallback, waDenom),
    emailSuccessRate: pct1(emailSent, emailDenom),
    emailErrorRate: pct1(emailFailed, emailDenom),
    whatsappTotal: waDenom,
    smsTotal: smsFallback + smsOther,
    emailTotal: emailDenom,
    slowNotificationCount,
  };
}

/** Sources shown in the admin “recent notification events” table. */
export const NOTIFICATION_MONITORING_RECENT_SOURCES = [
  "cleaner_whatsapp_sent",
  "cleaner_whatsapp_failed",
  "cleaner_sms_fallback_used",
  "sms_fallback_sent",
  "email_sent",
  "email_failed",
  "slow_notification",
  "reminder_2h_sent",
  "assigned_sent",
  "completed_sent",
  "sla_breach_sent",
] as const;

/** Sources used for per-booking notification timeline (subset + lifecycle diagnostics). */
export const BOOKING_NOTIFICATION_TIMELINE_SOURCES = Array.from(
  new Set<string>([
    ...NOTIFICATION_MONITORING_RECENT_SOURCES,
    "missing_customer_email",
    "notifyBookingEvent/assigned",
    "sms_fallback_disabled",
    "sms_fallback_invalid_to",
  ]),
);

const BOOKING_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isNotificationTimelineBookingId(id: string): boolean {
  return BOOKING_UUID_RE.test(id.trim());
}

export type BookingNotificationTimelineStatus = "success" | "fallback" | "failed" | "info";

export type BookingNotificationTimelineEntry = {
  id: string;
  at: string;
  label: string;
  source: string;
  level: string;
  detail: string;
  status: BookingNotificationTimelineStatus;
};

export function timelineChannelStatusFromLog(source: string): BookingNotificationTimelineStatus {
  if (source === "cleaner_whatsapp_sent" || source === "sms_fallback_sent") return "success";
  if (source === "cleaner_sms_fallback_used") return "fallback";
  if (source === "cleaner_whatsapp_failed" || source === "email_failed") return "failed";
  if (source === "email_sent" || source.endsWith("_sent")) return "success";
  return "info";
}

function buildBookingTimelineLabel(source: string, context: Record<string, unknown>): string {
  const ch = typeof context.channel === "string" ? context.channel : "";
  const stage = typeof context.stage === "string" ? context.stage : "";
  switch (source) {
    case "email_sent":
      if (ch === "payment_confirmation") return "Payment confirmed — customer email";
      if (ch === "booking_assigned") return "Cleaner assigned — customer email";
      if (ch === "reminder_2h") return "2h reminder — customer email";
      if (ch === "job_completed") return "Job completed — customer email";
      if (ch === "booking_cancelled") return "Cancelled — customer email";
      if (ch === "booking_rescheduled") return "Rescheduled — customer email";
      return ch ? `Email sent (${ch})` : "Email sent";
    case "email_failed":
      return ch ? `Email failed (${ch})` : "Email failed";
    case "assigned_sent":
      return "Cleaner assigned — pipeline (dedupe)";
    case "reminder_2h_sent":
      return "2h reminder — pipeline (dedupe)";
    case "completed_sent":
      return "Completed — pipeline (dedupe)";
    case "sla_breach_sent":
      return "SLA breach — admin notification";
    case "cleaner_whatsapp_sent":
      if (ch === "whatsapp_job_assigned") return "Cleaner WhatsApp — job assigned";
      if (ch === "whatsapp_job_reminder_2h") return "Cleaner WhatsApp — 2h reminder";
      return "Cleaner WhatsApp sent";
    case "cleaner_whatsapp_failed":
      if (ch === "whatsapp_job_assigned") return "Cleaner WhatsApp failed — assigned";
      if (ch === "whatsapp_job_reminder_2h") return "Cleaner WhatsApp failed — reminder";
      return "Cleaner WhatsApp failed";
    case "cleaner_sms_fallback_used":
      return "SMS fallback after WhatsApp";
    case "sms_fallback_sent":
      return "SMS sent (fallback)";
    case "slow_notification":
      return "Slow notification pipeline";
    case "missing_customer_email":
      return stage ? `Missing customer email (${stage})` : "Missing customer email";
    case "notifyBookingEvent/assigned":
      return "Assigned — no cleaner phone";
    case "sms_fallback_disabled":
      return "SMS fallback disabled";
    case "sms_fallback_invalid_to":
      return "SMS fallback invalid number";
    default:
      return source;
  }
}

export type BookingNotificationTimelineResult = {
  entries: BookingNotificationTimelineEntry[];
  unstable: boolean;
};

export async function fetchBookingNotificationTimeline(
  admin: SupabaseClient,
  bookingId: string,
): Promise<BookingNotificationTimelineResult> {
  const id = bookingId.trim();
  if (!isNotificationTimelineBookingId(id)) return { entries: [], unstable: false };

  const sources = [...BOOKING_NOTIFICATION_TIMELINE_SOURCES];
  const [byId, byList] = await Promise.all([
    admin
      .from("system_logs")
      .select("id, created_at, source, level, message, context")
      .in("source", sources)
      .eq("context->>bookingId", id)
      .order("created_at", { ascending: true })
      .limit(400),
    admin
      .from("system_logs")
      .select("id, created_at, source, level, message, context")
      .eq("source", "sla_breach_sent")
      .contains("context", { bookingIds: [id] })
      .order("created_at", { ascending: true })
      .limit(80),
  ]);

  const rows = [...(byId.data ?? []), ...(byList.data ?? [])];
  const seen = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (r && typeof r === "object" && "id" in r) seen.set(String((r as { id: string }).id), r as (typeof rows)[0]);
  }
  const merged = [...seen.values()].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  const entries = merged.map((r) => {
    const c = (r.context && typeof r.context === "object" ? r.context : {}) as Record<string, unknown>;
    const source = String(r.source);
    return {
      id: String(r.id),
      at: String(r.created_at),
      label: buildBookingTimelineLabel(source, c),
      source,
      level: String(r.level ?? ""),
      detail: String(r.message ?? "").slice(0, 400),
      status: timelineChannelStatusFromLog(source),
    };
  });
  return { entries, unstable: computeBookingTimelineUnstable(entries) };
}

export type RecentNotificationEvent = {
  id: string;
  createdAt: string;
  bookingId: string | null;
  channel: string;
  result: "ok" | "failed" | "slow" | "info";
  latencyMs: number | null;
  source: string;
  message: string;
};

function channelFromLogSource(source: string, context: Record<string, unknown>): string {
  const ch = context.channel;
  if (typeof ch === "string" && ch.trim()) return ch.trim();
  if (source.includes("whatsapp")) return "whatsapp";
  if (source.includes("sms") || source === "cleaner_sms_fallback_used") return "sms";
  if (source.startsWith("email_")) return "email";
  return "pipeline";
}

function resultFromLogSource(source: string): RecentNotificationEvent["result"] {
  if (source === "slow_notification") return "slow";
  if (source.endsWith("_failed")) return "failed";
  if (source.endsWith("_sent") || source === "cleaner_whatsapp_sent") return "ok";
  return "info";
}

export function mapSystemLogRowToRecentNotificationEvent(row: {
  id: string;
  created_at: string;
  source: string;
  message: string;
  context: Record<string, unknown> | null;
}): RecentNotificationEvent {
  const c = row.context ?? {};
  const bookingId = extractBookingIdFromLogContext(c);
  const latRaw = c.pipelineLatencyMs;
  let latencyMs: number | null = null;
  if (typeof latRaw === "number" && Number.isFinite(latRaw)) latencyMs = latRaw;
  else if (typeof latRaw === "string") {
    const p = Number(latRaw);
    if (Number.isFinite(p)) latencyMs = p;
  }
  return {
    id: row.id,
    createdAt: row.created_at,
    bookingId,
    channel: channelFromLogSource(row.source, c),
    result: resultFromLogSource(row.source),
    latencyMs,
    source: row.source,
    message: row.message.slice(0, 240),
  };
}

export async function fetchLastNotificationFailureTimes(
  admin: SupabaseClient,
  sinceIso: string,
): Promise<{ lastWhatsappFailureAt: string | null; lastEmailFailureAt: string | null }> {
  const [wa, em] = await Promise.all([
    admin
      .from("system_logs")
      .select("created_at")
      .eq("source", "cleaner_whatsapp_failed")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("system_logs")
      .select("created_at")
      .eq("source", "email_failed")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const waAt =
    wa.data && typeof wa.data === "object" && "created_at" in wa.data
      ? String((wa.data as { created_at?: string }).created_at ?? "") || null
      : null;
  const emAt =
    em.data && typeof em.data === "object" && "created_at" in em.data
      ? String((em.data as { created_at?: string }).created_at ?? "") || null
      : null;

  return { lastWhatsappFailureAt: waAt, lastEmailFailureAt: emAt };
}

export type AlertSeverity = "warn" | "error" | "critical";

/** Escalation from repeat flap churn within one open incident (`flap_count`). */
export type FlapSeverity = "critical" | "error" | "warn" | "info";

export function getFlapSeverity(flapCount: number): FlapSeverity {
  const n = Math.floor(Number(flapCount));
  if (!Number.isFinite(n) || n < 0) return "info";
  if (n >= 10) return "critical";
  if (n >= 5) return "error";
  if (n >= 2) return "warn";
  return "info";
}

/** Flap churn per hour (flap_count over incident span). Null if not meaningful. */
export function computeFlapRatePerHour(flapCount: number, durationMs: number): number | null {
  const fc = Math.floor(Number(flapCount));
  if (!Number.isFinite(fc) || fc <= 0 || !Number.isFinite(durationMs) || durationMs < 60_000) return null;
  const hours = Math.max(durationMs / 3_600_000, 1 / 60);
  return Math.round((fc / hours) * 10) / 10;
}

/** Heuristic: noisy cleaner channel / failures for this booking’s timeline (not DB `notification_alerts`). */
export function computeBookingTimelineUnstable(entries: BookingNotificationTimelineEntry[]): boolean {
  if (entries.length < 2) return false;
  const bad = entries.filter((e) => e.status === "failed" || e.status === "fallback");
  if (bad.length >= 4) return true;
  if (entries.filter((e) => e.status === "failed").length >= 2) return true;
  const WINDOW_MS = 30 * 60_000;
  for (let i = 0; i < bad.length; i++) {
    const t = new Date(bad[i].at).getTime();
    if (!Number.isFinite(t)) continue;
    const nearby = bad.filter((b) => Math.abs(new Date(b.at).getTime() - t) <= WINDOW_MS).length;
    if (nearby >= 3) return true;
  }
  return false;
}

export function severityForWhatsappSuccessRate(sr: number): AlertSeverity {
  if (sr < 50) return "critical";
  if (sr < 70) return "error";
  return "warn";
}

export function severityForEmailErrorRate(er: number): AlertSeverity {
  if (er > 40) return "critical";
  if (er > 22) return "error";
  return "warn";
}

export function severityForSlowCount(count: number): AlertSeverity {
  if (count >= 25) return "critical";
  if (count >= 12) return "error";
  return "warn";
}

export function reportLevelForSeverity(s: AlertSeverity): "warn" | "error" {
  return s === "warn" ? "warn" : "error";
}

export type NotificationHealth = "healthy" | "degraded" | "critical";

/** Aggregate status for the monitoring dashboard (aligned with alert thresholds + severity ladders). */
export function computeNotificationHealth(params: {
  derived: NotificationDerived;
  minSample: number;
  waAlertPct: number;
  emailErrAlertPct: number;
  slowAlertMin: number;
}): NotificationHealth {
  const { derived, minSample, waAlertPct, emailErrAlertPct, slowAlertMin } = params;
  const waN = derived.whatsappTotal;
  const emN = derived.emailTotal;
  const waSr = derived.whatsappSuccessRate;
  const emEr = derived.emailErrorRate;
  const slow = derived.slowNotificationCount;

  const waCritical = waN >= minSample && waSr != null && waSr < 50;
  const emailCritical = emN >= minSample && emEr != null && emEr > 40;
  const slowCritical = slow >= 25;

  const waBad = waN >= minSample && waSr != null && waSr < waAlertPct;
  const emailBad = emN >= minSample && emEr != null && emEr > emailErrAlertPct;
  const slowBad = slow >= slowAlertMin;

  if (waCritical || emailCritical || slowCritical) return "critical";
  if (waBad || emailBad || slowBad) return "degraded";
  return "healthy";
}

export type NotificationAlertThresholds = {
  minSample: number;
  waAlertPct: number;
  emailErrAlertPct: number;
  slowAlertMin: number;
};

/** True when current metrics no longer warrant this alert type (mirrors fire conditions). */
export function notificationAlertTypeRecovered(
  type: string,
  derived: NotificationDerived,
  t: NotificationAlertThresholds,
): boolean {
  const waN = derived.whatsappTotal;
  const emN = derived.emailTotal;
  const waSr = derived.whatsappSuccessRate;
  const emEr = derived.emailErrorRate;
  switch (type) {
    case "whatsapp_low_success_rate":
      return !(waN >= t.minSample && waSr != null && waSr < t.waAlertPct);
    case "email_high_error_rate":
      return !(emN >= t.minSample && emEr != null && emEr > t.emailErrAlertPct);
    case "slow_notifications_spike":
      return derived.slowNotificationCount < t.slowAlertMin;
    default:
      return false;
  }
}

/** Milliseconds from incident start (`first_fired_at` or `fired_at`) to resolve / now. */
export function incidentDurationMs(startedAt: string, resolvedAt: string | null, nowMs = Date.now()): number {
  const t0 = new Date(startedAt).getTime();
  const t1 = resolvedAt ? new Date(resolvedAt).getTime() : nowMs;
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return 0;
  return t1 - t0;
}

/**
 * True if a same-type alert was resolved recently (re-open churn).
 * Uses only `resolved_at >= since` — in SQL that excludes nulls; avoid `.not(..., 'is', null)` which is unreliable in PostgREST.
 */
async function hasRecentResolvedSameTypeAlert(
  admin: SupabaseClient,
  type: string,
  windowMinutes: number,
): Promise<boolean> {
  const cap = Math.max(5, Math.min(180, windowMinutes));
  const since = new Date(Date.now() - cap * 60_000).toISOString();
  const { data, error } = await admin
    .from("notification_alerts")
    .select("id, resolved_at")
    .eq("type", type)
    .gte("resolved_at", since)
    .order("resolved_at", { ascending: false })
    .limit(1);
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "notification_alerts_flap_probe_failed",
      message: error.message,
      context: { type },
    });
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Closes open `notification_alerts` rows when metrics recover.
 * Run only when `alertsEnabled` (same gate as firing), so cooldown / evaluation stay aligned.
 */
export async function autoResolveNotificationAlertsIfRecovered(params: {
  admin: SupabaseClient;
  derived: NotificationDerived;
  alertsEnabled: boolean;
  thresholds: NotificationAlertThresholds;
}): Promise<string[]> {
  const resolvedIds: string[] = [];
  if (!params.alertsEnabled) return resolvedIds;

  const { data: open, error } = await params.admin
    .from("notification_alerts")
    .select("id, type")
    .is("resolved_at", null);
  if (error || !open?.length) return resolvedIds;

  for (const row of open) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as { id?: string }).id ?? "");
    const type = String((row as { type?: string }).type ?? "");
    if (!id || !type) continue;
    if (!notificationAlertTypeRecovered(type, params.derived, params.thresholds)) continue;

    const { error: upErr } = await params.admin
      .from("notification_alerts")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id)
      .is("resolved_at", null);
    if (upErr) {
      await logSystemEvent({
        level: "warn",
        source: "notification_alert_auto_resolve_failed",
        message: upErr.message,
        context: { alertId: id, type },
      });
      continue;
    }
    resolvedIds.push(id);
    await logSystemEvent({
      level: "info",
      source: "notification_alert_auto_resolved",
      message: `${type} cleared by metrics`,
      context: { alertId: id, type },
    });
  }
  return resolvedIds;
}

const ALERT_SOURCE = "notification_alert_fired";

export async function canFireNotificationAlert(
  admin: SupabaseClient,
  alertKey: string,
  cooldownMinutes: number,
): Promise<boolean> {
  const since = new Date(Date.now() - Math.max(1, Math.min(240, cooldownMinutes)) * 60_000).toISOString();
  const { data, error } = await admin
    .from("system_logs")
    .select("id")
    .eq("source", ALERT_SOURCE)
    .eq("context->>alert", alertKey)
    .gte("created_at", since)
    .limit(1);
  if (error) return true;
  return !data?.length;
}

/** `system_logs.source` + second arg to `reportOperationalIssue` for SLA-style escalation. */
const CRITICAL_FLAPPING_LOG_SOURCE = "critical_flapping_alert";

async function reportCriticalFlappingEscalationIfNeeded(params: {
  admin: SupabaseClient;
  type: string;
  alertRowId: string;
  prevFlapCount: number;
  newFlapCount: number;
}): Promise<void> {
  if (getFlapSeverity(params.newFlapCount) !== "critical") return;
  if (getFlapSeverity(params.prevFlapCount) === "critical") return;

  const coolRaw = Number(process.env.NOTIFICATION_CRITICAL_FLAP_COOLDOWN_MINUTES ?? "45");
  const coolMin = Number.isFinite(coolRaw) ? Math.min(240, Math.max(5, Math.round(coolRaw))) : 45;
  const since = new Date(Date.now() - coolMin * 60_000).toISOString();
  const { data, error } = await params.admin
    .from("system_logs")
    .select("id")
    .eq("source", CRITICAL_FLAPPING_LOG_SOURCE)
    .eq("context->>notificationAlertType", params.type)
    .gte("created_at", since)
    .limit(1);
  if (error || (data?.length ?? 0) > 0) return;

  await reportOperationalIssue(
    "error",
    CRITICAL_FLAPPING_LOG_SOURCE,
    `[critical] Notification alert "${params.type}" reached critical flap churn (${params.newFlapCount}× in-window)`,
    {
      notificationAlertType: params.type,
      notificationAlertId: params.alertRowId,
      flapCount: params.newFlapCount,
    },
  );
}

type NotificationMetricAlertKey =
  | "whatsapp_low_success_rate"
  | "email_high_error_rate"
  | "slow_notifications_spike";

const REP_BOOKING_SOURCE_PRIORITY: Record<string, number> = {
  cleaner_whatsapp_failed: 100,
  email_failed: 100,
  slow_notification: 100,
  cleaner_sms_fallback_used: 60,
  cleaner_whatsapp_sent: 20,
  email_sent: 5,
};

const REP_BOOKING_SOURCES_BY_ALERT: Record<NotificationMetricAlertKey, readonly string[]> = {
  whatsapp_low_success_rate: ["cleaner_whatsapp_failed", "cleaner_sms_fallback_used", "cleaner_whatsapp_sent"],
  email_high_error_rate: ["email_failed", "email_sent"],
  slow_notifications_spike: ["slow_notification"],
};

/**
 * Picks a booking UUID from recent notification `system_logs` rows that best illustrates the metric breach.
 */
export async function pickRepresentativeBookingIdForNotificationMetricAlert(params: {
  admin: SupabaseClient;
  sinceIso: string;
  alertKey: NotificationMetricAlertKey;
}): Promise<string | null> {
  const sources = REP_BOOKING_SOURCES_BY_ALERT[params.alertKey];
  if (!sources?.length) return null;
  const { data, error } = await params.admin
    .from("system_logs")
    .select("source, context, created_at")
    .in("source", [...sources])
    .gte("created_at", params.sinceIso)
    .order("created_at", { ascending: false })
    .limit(160);
  if (error || !data?.length) return null;
  const rows = data as Array<{ source: string; context: unknown; created_at: string }>;
  const sorted = [...rows].sort((a, b) => {
    const pa = REP_BOOKING_SOURCE_PRIORITY[a.source] ?? 0;
    const pb = REP_BOOKING_SOURCE_PRIORITY[b.source] ?? 0;
    if (pb !== pa) return pb - pa;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  for (const r of sorted) {
    const bid = extractBookingIdFromLogContext(r.context);
    if (bid && isNotificationTimelineBookingId(bid)) return bid;
  }
  return null;
}

async function upsertNotificationAlertDurableRow(params: {
  admin: SupabaseClient;
  type: string;
  severity: AlertSeverity;
  context: Record<string, unknown>;
}): Promise<void> {
  const type = params.type.slice(0, 200);
  const { data: existing, error: selErr } = await params.admin
    .from("notification_alerts")
    .select("id, occurrence_count, is_flapping, flap_count, context")
    .eq("type", type)
    .is("resolved_at", null)
    .order("fired_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    await logSystemEvent({
      level: "warn",
      source: "notification_alerts_select_failed",
      message: selErr.message,
      context: { type },
    });
    return;
  }

  if (existing && typeof existing === "object" && "id" in existing) {
    const id = String((existing as { id: string }).id);
    const raw = (existing as { occurrence_count?: number }).occurrence_count;
    const prev = typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
    const wasFlapping = Boolean((existing as { is_flapping?: boolean | null }).is_flapping);
    const prevFlapRaw = (existing as { flap_count?: number | null }).flap_count;
    const prevFlap =
      typeof prevFlapRaw === "number" && Number.isFinite(prevFlapRaw) && prevFlapRaw >= 0 ? prevFlapRaw : 0;
    const newFlapCount = wasFlapping ? prevFlap + 1 : prevFlap;
    const prevCtxRaw = (existing as { context?: unknown }).context;
    const prevCtx =
      prevCtxRaw && typeof prevCtxRaw === "object" ? (prevCtxRaw as Record<string, unknown>) : {};
    const mergedContext = {
      ...prevCtx,
      ...params.context,
      flapCount: newFlapCount,
      flapSeverity: getFlapSeverity(newFlapCount),
    };
    const { error: upErr } = await params.admin
      .from("notification_alerts")
      .update({
        occurrence_count: prev + 1,
        fired_at: new Date().toISOString(),
        severity: params.severity,
        context: mergedContext,
        ...(wasFlapping ? { flap_count: newFlapCount } : {}),
      })
      .eq("id", id);
    if (upErr) {
      await logSystemEvent({
        level: "warn",
        source: "notification_alerts_update_failed",
        message: upErr.message,
        context: { type, id },
      });
    } else if (wasFlapping) {
      await reportCriticalFlappingEscalationIfNeeded({
        admin: params.admin,
        type,
        alertRowId: id,
        prevFlapCount: prevFlap,
        newFlapCount,
      });
    }
    return;
  }

  const nowIso = new Date().toISOString();
  const flapRaw = Number(process.env.NOTIFICATION_ALERT_FLAPPING_WINDOW_MINUTES ?? "15");
  const flapMinutes = Number.isFinite(flapRaw) ? flapRaw : 15;
  const isFlapping = await hasRecentResolvedSameTypeAlert(params.admin, type, flapMinutes);
  const flapCountVal = isFlapping ? 1 : 0;
  const mergedContext = {
    ...params.context,
    flapCount: flapCountVal,
    flapSeverity: getFlapSeverity(flapCountVal),
  };

  const { error } = await params.admin.from("notification_alerts").insert({
    type,
    severity: params.severity,
    context: mergedContext,
    occurrence_count: 1,
    fired_at: nowIso,
    first_fired_at: nowIso,
    is_flapping: isFlapping,
    flap_count: flapCountVal,
  });
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "notification_alerts_insert_failed",
      message: error.message,
      context: { type },
    });
  }
}

export async function recordNotificationAlertFired(params: {
  admin: SupabaseClient;
  alertKey: string;
  severity: AlertSeverity;
  days: number;
  extra?: Record<string, unknown>;
}): Promise<void> {
  const ctx = {
    alert: params.alertKey,
    severity: params.severity,
    days: params.days,
    ...(params.extra ?? {}),
  };
  const { error } = await params.admin.from("system_logs").insert({
    level: "info",
    source: ALERT_SOURCE,
    message: params.alertKey.slice(0, 500),
    context: ctx,
  });
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: "notification_alert_fired_insert_failed",
      message: error.message,
      context: { alert: params.alertKey },
    });
    return;
  }
  await upsertNotificationAlertDurableRow({
    admin: params.admin,
    type: params.alertKey,
    severity: params.severity,
    context: ctx,
  });
}

export async function evaluateNotificationAlertsAndFire(params: {
  admin: SupabaseClient;
  days: number;
  derived: NotificationDerived;
  alertsEnabled: boolean;
  minSample: number;
  waAlertPct: number;
  emailErrAlertPct: number;
  slowAlertMin: number;
  cooldownMinutes: number;
}): Promise<string[]> {
  const fired: string[] = [];
  if (!params.alertsEnabled) return fired;

  const sinceIso = new Date(Date.now() - params.days * 86_400_000).toISOString();

  const {
    admin,
    days,
    derived,
    minSample,
    waAlertPct,
    emailErrAlertPct,
    slowAlertMin,
    cooldownMinutes,
  } = params;
  const waDenom = derived.whatsappTotal;
  const emailDenom = derived.emailTotal;

  if (
    waDenom >= minSample &&
    derived.whatsappSuccessRate != null &&
    derived.whatsappSuccessRate < waAlertPct
  ) {
    const key = "whatsapp_low_success_rate";
    if (await canFireNotificationAlert(admin, key, cooldownMinutes)) {
      fired.push(key);
      const sev = severityForWhatsappSuccessRate(derived.whatsappSuccessRate);
      const level = reportLevelForSeverity(sev);
      const repBookingId = await pickRepresentativeBookingIdForNotificationMetricAlert({
        admin,
        sinceIso,
        alertKey: key,
      });
      await reportOperationalIssue(
        level,
        `notification_metrics/${key}`,
        `[${sev}] WhatsApp success rate ${derived.whatsappSuccessRate}% below ${waAlertPct}% (n=${waDenom}, days=${days})`,
        { days, waDenom, thresholdPct: waAlertPct, severity: sev, ...(repBookingId ? { bookingId: repBookingId } : {}) },
      );
      await recordNotificationAlertFired({
        admin,
        alertKey: key,
        severity: sev,
        days,
        extra: {
          waDenom,
          whatsappSuccessRate: derived.whatsappSuccessRate,
          ...(repBookingId ? { bookingId: repBookingId } : {}),
        },
      });
    }
  }

  if (
    emailDenom >= minSample &&
    derived.emailErrorRate != null &&
    derived.emailErrorRate > emailErrAlertPct
  ) {
    const key = "email_high_error_rate";
    if (await canFireNotificationAlert(admin, key, cooldownMinutes)) {
      fired.push(key);
      const sev = severityForEmailErrorRate(derived.emailErrorRate);
      const level = reportLevelForSeverity(sev);
      const repBookingId = await pickRepresentativeBookingIdForNotificationMetricAlert({
        admin,
        sinceIso,
        alertKey: key,
      });
      await reportOperationalIssue(
        level,
        `notification_metrics/${key}`,
        `[${sev}] Email error rate ${derived.emailErrorRate}% above ${emailErrAlertPct}% (n=${emailDenom}, days=${days})`,
        { days, emailDenom, thresholdPct: emailErrAlertPct, severity: sev, ...(repBookingId ? { bookingId: repBookingId } : {}) },
      );
      await recordNotificationAlertFired({
        admin,
        alertKey: key,
        severity: sev,
        days,
        extra: {
          emailDenom,
          emailErrorRate: derived.emailErrorRate,
          ...(repBookingId ? { bookingId: repBookingId } : {}),
        },
      });
    }
  }

  if (derived.slowNotificationCount >= slowAlertMin) {
    const key = "slow_notifications_spike";
    if (await canFireNotificationAlert(admin, key, cooldownMinutes)) {
      fired.push(key);
      const sev = severityForSlowCount(derived.slowNotificationCount);
      const level = reportLevelForSeverity(sev);
      const repBookingId = await pickRepresentativeBookingIdForNotificationMetricAlert({
        admin,
        sinceIso,
        alertKey: key,
      });
      await reportOperationalIssue(
        level,
        `notification_metrics/${key}`,
        `[${sev}] slow_notification count ${derived.slowNotificationCount} ≥ ${slowAlertMin} (days=${days})`,
        { days, slowCount: derived.slowNotificationCount, slowAlertMin, severity: sev, ...(repBookingId ? { bookingId: repBookingId } : {}) },
      );
      await recordNotificationAlertFired({
        admin,
        alertKey: key,
        severity: sev,
        days,
        extra: {
          slowCount: derived.slowNotificationCount,
          ...(repBookingId ? { bookingId: repBookingId } : {}),
        },
      });
    }
  }

  return fired;
}
