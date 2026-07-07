import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { detectFunnelAnomalies, generateAnalyticsInsights } from "@/lib/analytics/funnelIntelligence";
import { buildFunnelNarrativeSummary } from "@/lib/analytics/narrativeSummary";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Must match client {@link bookingRouteToFunnelStep} labels used in `booking_events.step`. */
const FUNNEL_ORDER = ["entry", "quote", "extras", "datetime", "payment"] as const;

/** Semantic `user_events` mapped to coarse funnel steps when `booking_events` views are sparse. */
const USER_EVENT_FUNNEL_STEP: Record<string, (typeof FUNNEL_ORDER)[number]> = {
  booking_step_details_started: "entry",
  [ANALYTICS_EVENTS.START_BOOKING]: "entry",
  [ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED]: "quote",
  [ANALYTICS_EVENTS.VIEW_PRICE]: "quote",
  booking_addon_selected: "extras",
  booking_continue_schedule: "extras",
  [ANALYTICS_EVENTS.BOOKING_DATE_SELECTED]: "datetime",
  [ANALYTICS_EVENTS.BOOKING_TIME_SELECTED]: "datetime",
  [ANALYTICS_EVENTS.SELECT_TIME]: "datetime",
  [ANALYTICS_EVENTS.BOOKING_CLEANER_SELECTED]: "datetime",
  [ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED]: "payment",
  [ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED]: "payment",
  [ANALYTICS_EVENTS.PAYMENT_COMPLETED]: "payment",
  [ANALYTICS_EVENTS.BOOKING_COMPLETED]: "payment",
};

type Row = { session_id: string; step: string; event_type: string; analytics_session_id?: string | null };
type BookingEventRow = Row & { created_at?: string | null; metadata?: Record<string, unknown> | null };
type UserEventRow = { event_type?: string | null; created_at?: string | null; payload?: Record<string, unknown> | null };
type BookingRow = {
  created_at?: string | null;
  payment_completed_at?: string | null;
  status?: string | null;
  payment_status?: string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  service?: string | null;
  service_slug?: string | null;
  location?: string | null;
  date?: string | null;
  time?: string | null;
  city_id?: string | null;
};

const BOOKING_ANALYTICS_EVENTS = [
  "booking_step_details_started",
  ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED,
  "booking_addon_selected",
  "booking_continue_schedule",
  ANALYTICS_EVENTS.BOOKING_DATE_SELECTED,
  ANALYTICS_EVENTS.BOOKING_TIME_SELECTED,
  ANALYTICS_EVENTS.BOOKING_CLEANER_SELECTED,
  ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED,
  ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED,
  ANALYTICS_EVENTS.PAYMENT_COMPLETED,
  ANALYTICS_EVENTS.BOOKING_COMPLETED,
  ANALYTICS_EVENTS.START_BOOKING,
  ANALYTICS_EVENTS.VIEW_PRICE,
  ANALYTICS_EVENTS.SELECT_TIME,
] as const;

const TERMINAL_UNPAID_STATUSES = new Set(["cancelled", "failed", "payment_expired"]);

function normStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function hasPaidTimestamp(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isFunnelPaidBooking(row: BookingRow): boolean {
  if (TERMINAL_UNPAID_STATUSES.has(normStatus(row.status))) return false;
  const paymentStatus = normStatus(row.payment_status);
  const paid = safeRevenue(row) > 0;
  if (paymentStatus === "success" || paymentStatus === "paid") {
    return paid || hasPaidTimestamp(row.payment_completed_at);
  }
  return paid && hasPaidTimestamp(row.payment_completed_at);
}

function ymd(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function safePayload(row: UserEventRow): Record<string, unknown> {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function correlationSessionId(row: UserEventRow): string | null {
  const p = safePayload(row);
  return (
    stringValue(p.analytics_session_id) ??
    stringValue(p.booking_session_id) ??
    stringValue(p.session_id)
  );
}

function bookingEventCorrelationId(row: BookingEventRow): string {
  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return (
    stringValue(row.analytics_session_id) ??
    stringValue(meta.analytics_session_id) ??
    row.session_id
  );
}

function normalizeBucket(value: string | null | undefined, fallback = "Unknown"): string {
  if (!value) return fallback;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function selectedExtrasCount(value: unknown): number {
  return Array.isArray(value) ? value.filter((x) => typeof x === "string" && x.trim()).length : 0;
}

function selectedExtrasArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
        .map((x) => x.trim()),
    ),
  ].sort();
}

function dayOfWeekLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { weekday: "long", timeZone: "UTC" });
}

function timeSlotLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;
  const hour = Math.max(0, Math.min(23, Number(match[1])));
  const min = match[2] ?? "00";
  return `${String(hour).padStart(2, "0")}:${min}`;
}

function priceBucket(value: number | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const lower = Math.floor(value / 100) * 100;
  const upper = lower + 99;
  return `R${lower}-${upper}`;
}

function safeRevenue(row: BookingRow): number {
  if (typeof row.total_paid_zar === "number" && Number.isFinite(row.total_paid_zar)) return Math.max(0, Math.round(row.total_paid_zar));
  if (typeof row.amount_paid_cents === "number" && Number.isFinite(row.amount_paid_cents)) return Math.max(0, Math.round(row.amount_paid_cents / 100));
  return 0;
}

function initDayMap(since: Date): Map<string, { date: string; starts: number; reachedPayment: number; completed: number; bookings: number; paystackAbandons: number }> {
  const out = new Map<string, { date: string; starts: number; reachedPayment: number; completed: number; bookings: number; paystackAbandons: number }>();
  const d = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    out.set(key, { date: key, starts: 0, reachedPayment: 0, completed: 0, bookings: 0, paystackAbandons: 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
    error: userErr,
  } = await pub.auth.getUser(token);
  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }
  if (!isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const sinceIso = since.toISOString();

  const [bookingEventsRes, userEventsRes, bookingsRes] = await Promise.all([
    admin
      .from("booking_events")
      .select("session_id, analytics_session_id, step, event_type, created_at, metadata")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(25_000),
    admin
      .from("user_events")
      .select("event_type, created_at, payload")
      .gte("created_at", sinceIso)
      .in("event_type", [...BOOKING_ANALYTICS_EVENTS])
      .order("created_at", { ascending: false })
      .limit(50_000),
    admin
      .from("bookings")
      .select(
        "created_at, payment_completed_at, status, payment_status, total_paid_zar, amount_paid_cents, service, service_slug, location, date, time, city_id",
      )
      .or(`created_at.gte.${sinceIso},payment_completed_at.gte.${sinceIso}`)
      .order("created_at", { ascending: false })
      .limit(15_000),
  ]);

  if (bookingEventsRes.error) {
    const error = bookingEventsRes.error;
    if (error.message.includes("does not exist") || error.code === "42P01") {
      return NextResponse.json({
        since: sinceIso,
        rows: 0,
        message: "Run migration `20260475_booking_events.sql` — table booking_events missing.",
        dropOffByStep: [],
        viewsByStep: [],
        conversionRatePct: 0,
        topExitSteps: [],
        errorsByStep: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (userEventsRes.error) return NextResponse.json({ error: userEventsRes.error.message }, { status: 500 });
  if (bookingsRes.error) return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });

  const rows = (bookingEventsRes.data ?? []) as BookingEventRow[];
  const userEvents = (userEventsRes.data ?? []) as UserEventRow[];
  const bookings = (bookingsRes.data ?? []) as BookingRow[];
  const sessionsAny = new Set(rows.map((r) => bookingEventCorrelationId(r)));
  const completedSessions = new Set<string>();
  const paystackOpenedSessions = new Set<string>();
  const paymentStartedSessions = new Set<string>();
  const timeSelectedSessions = new Set<string>();
  const cleanerSelectedSessions = new Set<string>();
  const addonAttachedSessions = new Set<string>();
  const sessionTraits = new Map<
    string,
    {
      device?: string;
      service?: string;
      suburb?: string;
      estimatedPrice?: number;
      selectedExtras?: number;
      selectedExtraIds?: Set<string>;
      firstAt?: number;
      completedAt?: number;
      paystackOpenedAt?: number;
    }
  >();

  function traitFor(sessionId: string) {
    let t = sessionTraits.get(sessionId);
    if (!t) {
      t = {};
      sessionTraits.set(sessionId, t);
    }
    return t;
  }

  const viewedStepBySession = new Map<string, Set<string>>();
  const funnelStepSet = new Set<string>(FUNNEL_ORDER);

  function recordFunnelStepViews(sessionId: string, step: (typeof FUNNEL_ORDER)[number]) {
    const idx = FUNNEL_ORDER.indexOf(step);
    if (idx < 0) return;
    let s = viewedStepBySession.get(sessionId);
    if (!s) {
      s = new Set();
      viewedStepBySession.set(sessionId, s);
    }
    s.add(step);
  }

  function sessionsReachedStep(step: (typeof FUNNEL_ORDER)[number]): number {
    const idx = FUNNEL_ORDER.indexOf(step);
    if (idx < 0) return 0;
    let n = 0;
    for (const [, steps] of viewedStepBySession) {
      for (let i = idx; i < FUNNEL_ORDER.length; i++) {
        if (steps.has(FUNNEL_ORDER[i]!)) {
          n++;
          break;
        }
      }
    }
    return n;
  }

  for (const r of rows) {
    const cid = bookingEventCorrelationId(r);
    const createdAtMs = r.created_at ? new Date(r.created_at).getTime() : NaN;
    if (Number.isFinite(createdAtMs)) {
      const t = traitFor(cid);
      t.firstAt = Math.min(t.firstAt ?? createdAtMs, createdAtMs);
    }
    if (r.event_type !== "view") continue;
    if (!funnelStepSet.has(r.step)) continue;
    let s = viewedStepBySession.get(cid);
    if (!s) {
      s = new Set();
      viewedStepBySession.set(cid, s);
    }
    s.add(r.step);
  }

  for (const event of userEvents) {
    const sessionId = correlationSessionId(event);
    if (!sessionId) continue;
    sessionsAny.add(sessionId);
    const payload = safePayload(event);
    const t = traitFor(sessionId);
    t.device = stringValue(payload.device_type) ?? t.device;
    t.service = stringValue(payload.service_type) ?? t.service;
    t.suburb = stringValue(payload.suburb) ?? t.suburb;
    if (typeof payload.estimated_price === "number" && Number.isFinite(payload.estimated_price)) {
      t.estimatedPrice = payload.estimated_price;
    }
    const extras = selectedExtrasCount(payload.selected_extras);
    if (extras > 0) {
      t.selectedExtras = Math.max(t.selectedExtras ?? 0, extras);
      t.selectedExtraIds = new Set([...(t.selectedExtraIds ?? []), ...selectedExtrasArray(payload.selected_extras)]);
      addonAttachedSessions.add(sessionId);
    }
    const createdAtMs = event.created_at ? new Date(event.created_at).getTime() : NaN;
    if (Number.isFinite(createdAtMs)) {
      t.firstAt = Math.min(t.firstAt ?? createdAtMs, createdAtMs);
    }
    switch (event.event_type) {
      case "booking_addon_selected":
        addonAttachedSessions.add(sessionId);
        break;
      case "booking_time_selected":
        timeSelectedSessions.add(sessionId);
        break;
      case "booking_cleaner_selected":
        cleanerSelectedSessions.add(sessionId);
        break;
      case "booking_payment_started":
        paymentStartedSessions.add(sessionId);
        break;
      case "booking_paystack_opened":
        paystackOpenedSessions.add(sessionId);
        if (Number.isFinite(createdAtMs)) t.paystackOpenedAt = createdAtMs;
        break;
      case ANALYTICS_EVENTS.PAYMENT_COMPLETED:
      case ANALYTICS_EVENTS.BOOKING_COMPLETED:
        completedSessions.add(sessionId);
        if (Number.isFinite(createdAtMs)) t.completedAt = createdAtMs;
        break;
    }
    const mappedStep = USER_EVENT_FUNNEL_STEP[String(event.event_type ?? "")];
    if (mappedStep) recordFunnelStepViews(sessionId, mappedStep);
  }

  const reachedPayment = new Set<string>();
  for (const r of rows) {
    if (r.step === "payment" && (r.event_type === "view" || r.event_type === "next")) {
      reachedPayment.add(bookingEventCorrelationId(r));
    }
  }
  for (const sid of paymentStartedSessions) reachedPayment.add(sid);
  for (const sid of paystackOpenedSessions) reachedPayment.add(sid);
  for (const [sid, steps] of viewedStepBySession) {
    if (steps.has("payment")) reachedPayment.add(sid);
  }

  const startedQuote = new Set<string>();
  for (const r of rows) {
    if (r.step === "quote" && r.event_type === "view") startedQuote.add(bookingEventCorrelationId(r));
  }
  for (const event of userEvents) {
    const sessionId = correlationSessionId(event);
    if (!sessionId) continue;
    if (
      event.event_type === ANALYTICS_EVENTS.BOOKING_SERVICE_SELECTED ||
      event.event_type === "booking_step_details_started" ||
      event.event_type === ANALYTICS_EVENTS.START_BOOKING ||
      event.event_type === ANALYTICS_EVENTS.VIEW_PRICE
    ) {
      startedQuote.add(sessionId);
    }
  }
  for (const [sid, steps] of viewedStepBySession) {
    if (steps.has("quote")) startedQuote.add(sid);
  }
  const funnelStart = Math.max(startedQuote.size, sessionsReachedStep("quote"));
  const paidOrCheckout = reachedPayment.size;
  const conversionRatePct = funnelStart > 0 ? Math.round((paidOrCheckout / funnelStart) * 1000) / 10 : 0;

  const dropOffByStep: { step: string; viewed: number; dropped: number; dropOffPct: number }[] = [];
  for (let i = 0; i < FUNNEL_ORDER.length - 1; i++) {
    const cur = FUNNEL_ORDER[i]!;
    const next = FUNNEL_ORDER[i + 1]!;
    const viewed = sessionsReachedStep(cur);
    const progressed = sessionsReachedStep(next);
    const dropped = Math.max(0, viewed - progressed);
    const dropOffPct = viewed > 0 ? Math.round((dropped / viewed) * 1000) / 10 : 0;
    dropOffByStep.push({ step: cur, viewed, dropped, dropOffPct });
  }

  const exitCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== "exit") continue;
    exitCounts.set(r.step, (exitCounts.get(r.step) ?? 0) + 1);
  }
  const topExitStepsFromEvents = [...exitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([step, count]) => ({ step, count }));
  /** When clients omit explicit `exit` rows, infer exits from step drop-off counts. */
  const topExitSteps =
    topExitStepsFromEvents.length > 0
      ? topExitStepsFromEvents
      : dropOffByStep
          .filter((row) => row.dropped > 0)
          .sort((a, b) => b.dropped - a.dropped)
          .slice(0, 8)
          .map((row) => ({ step: row.step, count: row.dropped }));

  const errCounts = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== "error") continue;
    errCounts.set(r.step, (errCounts.get(r.step) ?? 0) + 1);
  }
  const errorsByStep = [...errCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([step, count]) => ({ step, count }));

  const viewsByStep = FUNNEL_ORDER.map((step) => ({
    step,
    views: sessionsReachedStep(step),
  }));

  /** Distinct sessions with ≥1 funnel step signal — aligns with `viewsByStep`. */
  const sessionsWithFunnelView = viewedStepBySession.size;

  const durations = [...sessionTraits.values()]
    .map((t) => (t.firstAt && t.completedAt && t.completedAt >= t.firstAt ? Math.round((t.completedAt - t.firstAt) / 1000) : null))
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);
  const avgTimeToCompleteSeconds =
    durations.length > 0 ? Math.round(durations.reduce((sum, n) => sum + n, 0) / durations.length) : null;
  const medianTimeToCompleteSeconds = durations.length > 0 ? durations[Math.floor(durations.length / 2)]! : null;

  const paidBookings = bookings.filter(isFunnelPaidBooking);
  const paidBookingsInWindow = paidBookings.filter((booking) => {
    const paidAt = booking.payment_completed_at ?? booking.created_at;
    if (!paidAt) return false;
    return new Date(paidAt).getTime() >= since.getTime();
  });
  const paidCompletedByDay = new Map<string, number>();
  for (const booking of paidBookingsInWindow) {
    const day = ymd(booking.payment_completed_at ?? booking.created_at);
    if (day) paidCompletedByDay.set(day, (paidCompletedByDay.get(day) ?? 0) + 1);
  }

  /**
   * Per-session day attribution. `booking_events` navigation rows are sparse, so fall back to the
   * earliest correlated timestamp (from `user_events` too) captured in {@link sessionTraits.firstAt}.
   */
  function ymdFromMs(ms: number | undefined): string | null {
    return typeof ms === "number" && Number.isFinite(ms) ? ymd(new Date(ms).toISOString()) : null;
  }

  const paymentAtBySession = new Map<string, number>();
  function notePaymentAt(sid: string, ms: number) {
    if (!Number.isFinite(ms)) return;
    const prev = paymentAtBySession.get(sid);
    if (prev == null || ms < prev) paymentAtBySession.set(sid, ms);
  }
  for (const r of rows) {
    if (r.step !== "payment") continue;
    const ms = r.created_at ? new Date(r.created_at).getTime() : NaN;
    if (Number.isFinite(ms)) notePaymentAt(bookingEventCorrelationId(r), ms);
  }
  for (const event of userEvents) {
    const t = String(event.event_type ?? "");
    if (
      t !== "booking_payment_started" &&
      t !== "booking_paystack_opened" &&
      t !== ANALYTICS_EVENTS.PAYMENT_COMPLETED &&
      t !== ANALYTICS_EVENTS.BOOKING_COMPLETED
    ) {
      continue;
    }
    const sid = correlationSessionId(event);
    const ms = event.created_at ? new Date(event.created_at).getTime() : NaN;
    if (sid && Number.isFinite(ms)) notePaymentAt(sid, ms);
  }

  const dayMap = initDayMap(since);
  for (const sid of startedQuote) {
    const day =
      ymd(rows.find((r) => bookingEventCorrelationId(r) === sid && r.step === "quote" && r.event_type === "view")?.created_at) ??
      ymdFromMs(sessionTraits.get(sid)?.firstAt);
    if (day && dayMap.has(day)) dayMap.get(day)!.starts += 1;
  }
  for (const sid of reachedPayment) {
    const day =
      ymd(rows.find((r) => bookingEventCorrelationId(r) === sid && r.step === "payment")?.created_at) ??
      ymdFromMs(paymentAtBySession.get(sid) ?? sessionTraits.get(sid)?.firstAt);
    if (day && dayMap.has(day)) dayMap.get(day)!.reachedPayment += 1;
  }
  for (const event of userEvents) {
    const t = String(event.event_type ?? "");
    if (t !== ANALYTICS_EVENTS.BOOKING_COMPLETED && t !== ANALYTICS_EVENTS.PAYMENT_COMPLETED) continue;
    const day = ymd(event.created_at);
    if (day && dayMap.has(day)) dayMap.get(day)!.completed += 1;
  }
  for (const booking of bookings) {
    const day = ymd(booking.created_at);
    if (day && dayMap.has(day)) dayMap.get(day)!.bookings += 1;
  }
  for (const sid of paystackOpenedSessions) {
    if (completedSessions.has(sid)) continue;
    const day = ymd(userEvents.find((e) => e.event_type === "booking_paystack_opened" && correlationSessionId(e) === sid)?.created_at);
    if (day && dayMap.has(day)) dayMap.get(day)!.paystackAbandons += 1;
  }
  for (const [day, paidCount] of paidCompletedByDay) {
    const bucket = dayMap.get(day);
    if (bucket) bucket.completed = Math.max(bucket.completed, paidCount);
  }
  const dailyTrends = [...dayMap.values()].map((d) => ({
    ...d,
    conversionPct: pct(d.completed, d.starts),
    paymentReachPct: pct(d.reachedPayment, d.starts),
  }));

  function segmentRows(kind: "device" | "service" | "suburb") {
    const buckets = new Map<string, { label: string; starts: Set<string>; completed: Set<string>; reachedPayment: Set<string>; addOns: Set<string> }>();
    const sessionCountsAsStart = (sid: string) => (startedQuote.size > 0 ? startedQuote.has(sid) : sessionsAny.has(sid));
    for (const sid of sessionsAny) {
      const traits = sessionTraits.get(sid);
      const raw = kind === "device" ? traits?.device : kind === "service" ? traits?.service : traits?.suburb;
      const label = normalizeBucket(raw, "Unknown");
      let b = buckets.get(label);
      if (!b) {
        b = { label, starts: new Set(), completed: new Set(), reachedPayment: new Set(), addOns: new Set() };
        buckets.set(label, b);
      }
      if (sessionCountsAsStart(sid)) b.starts.add(sid);
      if (completedSessions.has(sid)) b.completed.add(sid);
      if (reachedPayment.has(sid) || paymentStartedSessions.has(sid)) b.reachedPayment.add(sid);
      if (addonAttachedSessions.has(sid)) b.addOns.add(sid);
    }
    return [...buckets.values()]
      .filter((b) => b.starts.size > 0 || b.completed.size > 0 || b.reachedPayment.size > 0)
      .sort((a, b) => b.starts.size - a.starts.size)
      .slice(0, 8)
      .map((b) => ({
        label: b.label,
        starts: b.starts.size,
        reachedPayment: b.reachedPayment.size,
        completed: b.completed.size,
        conversionPct: pct(b.completed.size, b.starts.size),
        addOnAttachPct: pct(b.addOns.size, b.starts.size),
      }));
  }

  const cohortAnalysis = [
    ...segmentRows("service").map((r) => ({ cohort: `Service: ${r.label}`, ...r })),
    ...segmentRows("device").map((r) => ({ cohort: `Device: ${r.label}`, ...r })),
    ...segmentRows("suburb").map((r) => ({ cohort: `Area: ${r.label}`, ...r })),
  ]
    .sort((a, b) => b.starts - a.starts)
    .slice(0, 12);

  const paystackOpened = paystackOpenedSessions.size;
  const paystackCompleted = [...paystackOpenedSessions].filter((sid) => completedSessions.has(sid)).length;
  const analyticsCompletedSessions = completedSessions.size;
  /** Session-correlated completions only — paid booking volume is exposed separately as `paidBookingsCount`. */
  const completedPaymentSessions = Math.max(analyticsCompletedSessions, paystackCompleted);

  const stepConversion = [
    ...dropOffByStep.map((row, i) => {
      const next = FUNNEL_ORDER[i + 1] ?? "complete";
      const progressed = Math.max(0, row.viewed - row.dropped);
      return {
        from: row.step,
        to: next,
        viewed: row.viewed,
        progressed,
        conversionPct: pct(progressed, row.viewed),
        dropOffPct: row.dropOffPct,
      };
    }),
    ...(paidOrCheckout > 0
      ? [
          {
            from: "payment",
            to: "paid",
            viewed: paidOrCheckout,
            progressed: completedPaymentSessions,
            conversionPct: pct(completedPaymentSessions, paidOrCheckout),
            dropOffPct: pct(Math.max(0, paidOrCheckout - completedPaymentSessions), paidOrCheckout),
          },
        ]
      : []),
  ];

  type DemandBucket = {
    label: string;
    bookingStarts: Set<string>;
    timeSelections: Set<string>;
    completed: Set<string>;
    paidBookings: number;
    revenueZar: number;
  };

  function demandFor(map: Map<string, DemandBucket>, label: string): DemandBucket {
    let bucket = map.get(label);
    if (!bucket) {
      bucket = {
        label,
        bookingStarts: new Set(),
        timeSelections: new Set(),
        completed: new Set(),
        paidBookings: 0,
        revenueZar: 0,
      };
      map.set(label, bucket);
    }
    return bucket;
  }

  const dayDemand = new Map<string, DemandBucket>();
  const areaDemand = new Map<string, DemandBucket>();
  const timeDemand = new Map<string, DemandBucket>();
  const priceBuckets = new Map<string, { label: string; starts: Set<string>; reachedPayment: Set<string>; completed: Set<string>; revenueZar: number }>();
  const upsellCombos = new Map<string, { combo: string; starts: Set<string>; completed: Set<string>; revenueZar: number }>();

  for (const event of userEvents) {
    const sessionId = correlationSessionId(event);
    if (!sessionId) continue;
    const payload = safePayload(event);
    const date = stringValue(payload.date);
    const time = stringValue(payload.time);
    const suburb = normalizeBucket(stringValue(payload.suburb), "Unknown");
    if (suburb !== "Unknown") {
      const area = demandFor(areaDemand, suburb);
      if (startedQuote.has(sessionId)) area.bookingStarts.add(sessionId);
      if (timeSelectedSessions.has(sessionId)) area.timeSelections.add(sessionId);
      if (completedSessions.has(sessionId)) area.completed.add(sessionId);
    }
    const day = dayOfWeekLabel(date);
    if (day) {
      const bucket = demandFor(dayDemand, day);
      if (startedQuote.has(sessionId)) bucket.bookingStarts.add(sessionId);
      if (event.event_type === "booking_time_selected" || timeSelectedSessions.has(sessionId)) bucket.timeSelections.add(sessionId);
      if (completedSessions.has(sessionId)) bucket.completed.add(sessionId);
    }
    const slot = timeSlotLabel(time);
    if (slot) {
      const bucket = demandFor(timeDemand, slot);
      if (startedQuote.has(sessionId)) bucket.bookingStarts.add(sessionId);
      if (event.event_type === "booking_time_selected" || timeSelectedSessions.has(sessionId)) bucket.timeSelections.add(sessionId);
      if (completedSessions.has(sessionId)) bucket.completed.add(sessionId);
    }
  }

  for (const booking of paidBookings) {
    const revenue = safeRevenue(booking);
    const day = dayOfWeekLabel(booking.date);
    if (day) {
      const bucket = demandFor(dayDemand, day);
      bucket.paidBookings += 1;
      bucket.revenueZar += revenue;
    }
    const slot = timeSlotLabel(booking.time);
    if (slot) {
      const bucket = demandFor(timeDemand, slot);
      bucket.paidBookings += 1;
      bucket.revenueZar += revenue;
    }
    const area = normalizeBucket(booking.location, "Unknown");
    if (area !== "Unknown") {
      const bucket = demandFor(areaDemand, area);
      bucket.paidBookings += 1;
      bucket.revenueZar += revenue;
    }
  }

  function demandRows(map: Map<string, DemandBucket>) {
    return [...map.values()]
      .map((b) => {
        const demandScore = b.timeSelections.size * 2 + b.completed.size * 3 + b.paidBookings * 4 + b.bookingStarts.size;
        return {
          label: b.label,
          bookingStarts: b.bookingStarts.size,
          timeSelections: b.timeSelections.size,
          completed: b.completed.size,
          paidBookings: b.paidBookings,
          revenueZar: b.revenueZar,
          demandScore,
          conversionPct: pct(Math.max(b.completed.size, b.paidBookings), Math.max(b.bookingStarts.size, b.timeSelections.size)),
        };
      })
      .filter((row) => row.demandScore > 0)
      .sort((a, b) => b.demandScore - a.demandScore)
      .slice(0, 8);
  }

  for (const sid of sessionsAny) {
    const traits = sessionTraits.get(sid);
    const bucketLabel = priceBucket(traits?.estimatedPrice);
    if (bucketLabel) {
      let bucket = priceBuckets.get(bucketLabel);
      if (!bucket) {
        bucket = { label: bucketLabel, starts: new Set(), reachedPayment: new Set(), completed: new Set(), revenueZar: 0 };
        priceBuckets.set(bucketLabel, bucket);
      }
      if (startedQuote.has(sid)) bucket.starts.add(sid);
      if (reachedPayment.has(sid) || paymentStartedSessions.has(sid)) bucket.reachedPayment.add(sid);
      if (completedSessions.has(sid)) bucket.completed.add(sid);
    }
    const extras = [...(traits?.selectedExtraIds ?? [])];
    if (extras.length > 0) {
      const comboLabel = extras.slice(0, 4).join(" + ");
      let combo = upsellCombos.get(comboLabel);
      if (!combo) {
        combo = { combo: comboLabel, starts: new Set(), completed: new Set(), revenueZar: 0 };
        upsellCombos.set(comboLabel, combo);
      }
      if (startedQuote.has(sid)) combo.starts.add(sid);
      if (completedSessions.has(sid)) combo.completed.add(sid);
    }
  }

  for (const booking of paidBookings) {
    const revenue = safeRevenue(booking);
    const serviceBucket = priceBucket(revenue);
    if (serviceBucket) {
      const bucket = priceBuckets.get(serviceBucket);
      if (bucket) bucket.revenueZar += revenue;
    }
  }

  const priceIntelligence = [...priceBuckets.values()]
    .map((b) => ({
      label: b.label,
      starts: b.starts.size,
      reachedPayment: b.reachedPayment.size,
      completed: b.completed.size,
      conversionPct: pct(b.completed.size, b.starts.size),
      paymentReachPct: pct(b.reachedPayment.size, b.starts.size),
      revenueZar: b.revenueZar,
    }))
    .filter((b) => b.starts > 0)
    .sort((a, b) => b.conversionPct - a.conversionPct || b.starts - a.starts)
    .slice(0, 8);

  const lowConvertingServices = segmentRows("service")
    .filter((r) => r.starts > 0)
    .sort((a, b) => a.conversionPct - b.conversionPct || b.starts - a.starts)
    .slice(0, 6);

  const bestUpsellCombinations = [...upsellCombos.values()]
    .map((b) => ({
      combo: b.combo,
      starts: b.starts.size,
      completed: b.completed.size,
      conversionPct: pct(b.completed.size, b.starts.size),
      revenueZar: b.revenueZar,
    }))
    .filter((b) => b.starts > 0)
    .sort((a, b) => b.completed - a.completed || b.conversionPct - a.conversionPct || b.starts - a.starts)
    .slice(0, 8);

  const paystackAbandonmentPct = pct(paystackOpened - paystackCompleted, paystackOpened);
  const deviceBreakdown = segmentRows("device");
  const mobileRow = deviceBreakdown.find((r) => r.label.toLowerCase() === "mobile");

  const funnelIntel = {
    conversionRatePct,
    funnelStartSessions: funnelStart,
    reachedPaymentSessions: paidOrCheckout,
    completedPaymentSessions,
    paystackAbandonmentPct,
    paystackOpened,
    paystackCompleted,
    dropOffByStep,
    errorsByStep,
    dailyTrends: dailyTrends.map((d) => ({
      date: d.date,
      starts: d.starts,
      completed: d.completed,
      reachedPayment: d.reachedPayment,
    })),
    mobileUxHint:
      mobileRow && mobileRow.starts >= 1
        ? {
            starts: mobileRow.starts,
            completed: mobileRow.completed,
            conversionPct: mobileRow.conversionPct,
            label: mobileRow.label,
          }
        : undefined,
  };

  const insights = generateAnalyticsInsights(funnelIntel);
  const anomalies = detectFunnelAnomalies(funnelIntel);
  const narrativeSummary = buildFunnelNarrativeSummary({
    conversionRatePct,
    funnelStartSessions: funnelStart,
    reachedPaymentSessions: paidOrCheckout,
    completedPaymentSessions,
    paidBookingsCount: paidBookingsInWindow.length,
    insights,
    anomalies,
  });

  return NextResponse.json({
    since: sinceIso,
    rows: rows.length,
    sessions: sessionsAny.size,
    sessionsWithFunnelView,
    funnelStartSessions: funnelStart,
    reachedPaymentSessions: paidOrCheckout,
    completedPaymentSessions,
    analyticsCompletedSessions,
    paidBookingsCount: paidBookingsInWindow.length,
    conversionRatePct,
    dropOffByStep,
    viewsByStep,
    topExitSteps,
    errorsByStep,
    insights,
    anomalies,
    narrativeSummary,
    intelligence: {
      stepConversion,
      timeToComplete: {
        completedSessions: analyticsCompletedSessions,
        avgSeconds: avgTimeToCompleteSeconds,
        medianSeconds: medianTimeToCompleteSeconds,
      },
      deviceBreakdown,
      serviceBreakdown: segmentRows("service"),
      areaBreakdown: segmentRows("suburb"),
      cleanerSelectionRatePct: pct(cleanerSelectedSessions.size, Math.max(timeSelectedSessions.size, reachedPayment.size)),
      addOnAttachRatePct: pct(addonAttachedSessions.size, startedQuote.size),
      paystack: {
        opened: paystackOpened,
        completed: paystackCompleted,
        abandonmentPct: paystackAbandonmentPct,
      },
      dailyTrends,
      cohortAnalysis,
      revenue: {
        paidBookings: paidBookingsInWindow.length,
        totalZar: paidBookingsInWindow.reduce((sum, booking) => sum + safeRevenue(booking), 0),
      },
      operational: {
        cleanerDemandForecast: {
          peakDays: demandRows(dayDemand),
          highDemandSuburbs: demandRows(areaDemand),
          timeSlotDemand: demandRows(timeDemand),
        },
        pricingIntelligence: {
          highConvertingPrices: priceIntelligence,
          lowConvertingServices,
          bestUpsellCombinations,
        },
      },
    },
  });
}
