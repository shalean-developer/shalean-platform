import crypto from "crypto";

import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { finalizeAdminPaystackCheckout } from "@/lib/admin/adminPaystackPostInitialize";
import {
  abandonAdminBookingCreateIdempotency,
  claimAdminBookingCreateIdempotency,
  finalizeAdminBookingCreateIdempotency,
} from "@/lib/admin/adminBookingCreateIdempotency";
import { adminBookingLocationFingerprint, adminBookingServiceSlug } from "@/lib/admin/adminBookingCreateFingerprint";
import { resolveMonthlyBookingDuplicateRace } from "@/lib/admin/adminBookingPostInsertRace";
import { invalidateCleanerAvailabilityCache } from "@/lib/admin/cleanerAvailabilityCache";
import { findCleanerSlotConflict } from "@/lib/admin/adminCleanerSlotConflict";
import { applyActiveAdminBookingSlotFilters } from "@/lib/booking/activeAdminBookingSlot";
import { buildAdminPaystackLockedPayload } from "@/lib/admin/buildAdminPaystackLockedPayload";
import { assertAdminBookingSlotAllowed, normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { fetchSlaDispatchLastActions } from "@/lib/admin/slaDispatchLastAction";
import { isAdmin } from "@/lib/auth/admin";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  getDispatchSlaBreachMinutes,
  rowMatchesAttentionFilter,
  slaBreachOverdueMinutes,
  sortRowsForAttentionQueue,
  type OpsSnapshotRow,
} from "@/lib/admin/opsSnapshot";
import { adminPaymentLinkTtlMs } from "@/lib/booking/adminPaymentLinkState";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { insertBookingRowUnified } from "@/lib/booking/createBookingUnified";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { reportOperationalIssue, logSystemEvent } from "@/lib/logging/systemLog";
import { aggregatePaymentLinkDeliveryStats } from "@/lib/pay/paymentLinkDeliveryStats";
import { getServiceLabel, parseBookingServiceId, type BookingServiceId } from "@/components/booking/serviceCategories";
import { getDemandSupplySnapshotByCity } from "@/lib/pricing/demandSupplySurge";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runAdminBookingPostCreateNormalizationAndEarnings } from "@/lib/admin/adminBookingPostCreatePipeline";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** If the conflicting booking was created this recently, surface `recent_duplicate` for calmer admin UX. */
const RECENT_DUPLICATE_MS = 4 * 60 * 1000;

function formatAdminRaceSlotLabels(params: {
  date: string;
  timeHm: string;
  serviceRaw: string;
  location: string;
}): {
  race_slot_time_label: string;
  race_slot_service_label: string;
  race_slot_location_snippet: string;
} {
  const serviceLabel = getServiceLabel(parseBookingServiceId(params.serviceRaw) ?? "standard");
  const loc = params.location.trim();
  const race_slot_location_snippet = loc.length === 0 ? "—" : loc.length <= 80 ? loc : `${loc.slice(0, 77)}…`;
  return {
    race_slot_time_label: `${params.date} · ${params.timeHm} (Johannesburg calendar date / slot time)`,
    race_slot_service_label: serviceLabel,
    race_slot_location_snippet,
  };
}

type Row = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  company_revenue_cents: number | null;
  payout_percentage: number | null;
  payout_type: string | null;
  is_test: boolean | null;
  status: string | null;
  dispatch_status: string | null;
  surge_multiplier: number | null;
  surge_reason: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  selected_cleaner_id: string | null;
  assignment_type: string | null;
  fallback_reason: string | null;
  attempted_cleaner_id: string | null;
  became_pending_at: string | null;
  assigned_at: string | null;
  en_route_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  paystack_reference: string;
  city_id: string | null;
  duration_minutes: number | null;
  dispatch_attempt_count: number | null;
  created_by_admin: boolean | null;
  created_by?: string | null;
  payment_link: string | null;
  payment_link_expires_at: string | null;
  payment_link_last_sent_at: string | null;
  payment_link_delivery: Record<string, unknown> | null;
  payment_link_reminder_1h_sent_at: string | null;
  payment_link_reminder_15m_sent_at: string | null;
  payment_link_send_count: number | null;
  payment_link_first_sent_at: string | null;
  payment_needs_follow_up: boolean | null;
  payment_completed_at: string | null;
  payment_conversion_seconds: number | null;
  payment_conversion_bucket: string | null;
  conversion_channel: string | null;
  payment_first_touch_channel: string | null;
  payment_last_touch_channel: string | null;
  payment_assist_channels: unknown;
  booking_priority: string | null;
  last_decision_snapshot: unknown;
  payment_status: string | null;
  monthly_invoice_id: string | null;
  customer_billing_type?: string | null;
  customer_schedule_type?: string | null;
  admin_force_slot_override?: boolean | null;
  booking_source?: string | null;
  created_by_admin_id?: string | null;
  ignore_cleaner_conflict?: boolean | null;
  cleaner_slot_override_reason?: string | null;
};

function toOpsSnapshotRow(r: Row): OpsSnapshotRow {
  return {
    id: r.id,
    status: r.status,
    date: r.date,
    time: r.time,
    cleaner_id: r.cleaner_id,
    dispatch_status: r.dispatch_status,
    became_pending_at: r.became_pending_at,
    created_at: r.created_at,
    total_paid_zar: r.total_paid_zar,
    amount_paid_cents: r.amount_paid_cents,
  };
}

function classifyBooking(row: Row, today: string): "today" | "upcoming" | "completed" {
  const st = row.status?.toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed" || st === "payment_expired") return "completed";
  const d = row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) ? row.date : null;
  if (!d) return "upcoming";
  if (d === today) return "today";
  if (d > today) return "upcoming";
  return "completed";
}

/**
 * Admin dashboard data. Requires signed-in user email in `ADMIN_EMAILS`.
 */
export async function GET(request: Request) {
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
    error: userErr,
  } = await pub.auth.getUser(token);

  if (userErr || !user?.email) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  if (!isAdmin(user?.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all";
  const cityId = searchParams.get("cityId");
  const bookingStatus = searchParams.get("bookingStatus");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const opsQuick = (searchParams.get("opsQuick") ?? "").trim().toLowerCase();

  const bookingSelect =
    "id, customer_name, customer_email, service, date, time, location, total_paid_zar, amount_paid_cents, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, payout_percentage, payout_type, is_test, status, dispatch_status, surge_multiplier, surge_reason, user_id, cleaner_id, selected_cleaner_id, assignment_type, fallback_reason, attempted_cleaner_id, became_pending_at, assigned_at, en_route_at, started_at, completed_at, created_at, paystack_reference, city_id, duration_minutes, dispatch_attempt_count, created_by_admin, created_by, booking_source, created_by_admin_id, ignore_cleaner_conflict, cleaner_slot_override_reason, payment_link, payment_link_expires_at, payment_link_last_sent_at, payment_link_delivery, payment_link_reminder_1h_sent_at, payment_link_reminder_15m_sent_at, payment_link_send_count, payment_link_first_sent_at, payment_needs_follow_up, payment_completed_at, payment_conversion_seconds, payment_conversion_bucket, conversion_channel, payment_first_touch_channel, payment_last_touch_channel, payment_assist_channels, booking_priority, last_decision_snapshot, payment_status, monthly_invoice_id, admin_force_slot_override";

  let bookingQuery = admin.from("bookings").select(bookingSelect);

  if (filter === "follow-up") {
    bookingQuery = bookingQuery
      .eq("payment_needs_follow_up", true)
      .order("payment_conversion_seconds", { ascending: false, nullsFirst: false })
      .order("payment_link_send_count", { ascending: false })
      .limit(2000);
  } else {
    bookingQuery = bookingQuery.order("created_at", { ascending: false }).limit(4000);
  }
  if (cityId) bookingQuery = bookingQuery.eq("city_id", cityId);
  if (bookingStatus && bookingStatus !== "all") {
    bookingQuery = bookingQuery.eq("status", bookingStatus);
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    bookingQuery = bookingQuery.gte("date", from);
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    bookingQuery = bookingQuery.lte("date", to);
  }
  const { data: rawRows, error: selErr } = await bookingQuery;

  if (selErr) {
    await reportOperationalIssue("error", "api/admin/bookings", selErr.message);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }

  const rows = (rawRows ?? []) as Row[];
  const today = todayYmdJohannesburg();

  let filtered = rows;
  if (filter === "follow-up") {
    filtered = rows;
  } else if (filter === "today") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "today");
  } else if (filter === "upcoming") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "upcoming");
  } else if (filter === "completed") {
    filtered = rows.filter((r) => classifyBooking(r, today) === "completed");
  } else if (filter === "sla") {
    const slaM = getDispatchSlaBreachMinutes();
    const nowMs = Date.now();
    const breachRows = rows.filter((r) => rowMatchesAttentionFilter(toOpsSnapshotRow(r), "sla", nowMs, slaM));
    const enriched = breachRows.map((r) => {
      const op = toOpsSnapshotRow(r);
      return {
        ...r,
        slaBreachMinutes: slaBreachOverdueMinutes(op, nowMs, slaM) ?? 0,
      };
    });
    const sorted = sortRowsForAttentionQueue(enriched, "sla", nowMs, slaM);
    const actions = await fetchSlaDispatchLastActions(admin, sorted.map((r) => r.id));
    filtered = sorted.map((r) => {
      const act = actions.get(r.id);
      return {
        ...r,
        dispatchLastAction: act?.displayText ?? "—",
        lastActionMinutesAgo: act?.lastActionMinutesAgo ?? null,
      };
    });
  }

  const zar = (r: Row) =>
    typeof r.total_paid_zar === "number"
      ? r.total_paid_zar
      : Math.round((r.amount_paid_cents ?? 0) / 100);

  const todayRows = rows.filter((r) => classifyBooking(r, today) === "today");
  const revenueTodayZar = todayRows.reduce((s, r) => s + zar(r), 0);
  const totalBookingsToday = todayRows.length;
  const aovTodayZar = totalBookingsToday > 0 ? Math.round(revenueTodayZar / totalBookingsToday) : 0;

  const byEmail = new Map<string, number>();
  for (const r of rows) {
    const em = r.customer_email?.trim().toLowerCase();
    if (!em) continue;
    byEmail.set(em, (byEmail.get(em) ?? 0) + 1);
  }
  const distinctCustomers = byEmail.size;
  const repeatCustomerCount = [...byEmail.values()].filter((c) => c >= 2).length;
  const repeatCustomerPercent =
    distinctCustomers > 0 ? Math.round((repeatCustomerCount / distinctCustomers) * 1000) / 10 : 0;

  const { data: failedJobs } = await admin
    .from("failed_jobs")
    .select("id, type, created_at, attempts, payload")
    .eq("type", "booking_insert")
    .order("created_at", { ascending: false })
    .limit(50);

  const missingUserIdCount = rows.filter((r) => r.user_id == null).length;

  const totalRevenueZar = rows.reduce((s, r) => s + zar(r), 0);
  const revenuePerCustomerZar =
    distinctCustomers > 0 ? Math.round(totalRevenueZar / distinctCustomers) : 0;

  const spendByEmail = new Map<string, { spendZar: number; bookings: number }>();
  for (const r of rows) {
    const em = r.customer_email?.trim().toLowerCase();
    if (!em) continue;
    const z = zar(r);
    const cur = spendByEmail.get(em) ?? { spendZar: 0, bookings: 0 };
    cur.spendZar += z;
    cur.bookings += 1;
    spendByEmail.set(em, cur);
  }
  const topCustomers = [...spendByEmail.entries()]
    .map(([email, v]) => ({ email, spendZar: v.spendZar, bookings: v.bookings }))
    .sort((a, b) => b.spendZar - a.spendZar)
    .slice(0, 10);

  const { data: profileRows } = await admin.from("user_profiles").select("tier");
  const demandSupply = await getDemandSupplySnapshotByCity(admin, cityId || null);
  const { data: cityRows } = await admin.from("cities").select("id, name, is_active").order("name", { ascending: true });
  const vipDistribution = { regular: 0, silver: 0, gold: 0, platinum: 0 };
  for (const p of profileRows ?? []) {
    const t = typeof p === "object" && p && "tier" in p ? String((p as { tier?: string }).tier ?? "regular") : "regular";
    if (t === "silver") vipDistribution.silver++;
    else if (t === "gold") vipDistribution.gold++;
    else if (t === "platinum") vipDistribution.platinum++;
    else vipDistribution.regular++;
  }

  const paymentLinkChannelStats = aggregatePaymentLinkDeliveryStats(rows);

  const profileUserIds = [...new Set(filtered.map((r) => r.user_id).filter(Boolean))] as string[];
  const profileById = new Map<string, { billing_type: string; schedule_type: string }>();
  if (profileUserIds.length > 0) {
    const { data: plist } = await admin
      .from("user_profiles")
      .select("id, billing_type, schedule_type")
      .in("id", profileUserIds);
    for (const p of plist ?? []) {
      const row = p as { id?: string; billing_type?: string; schedule_type?: string };
      if (row.id) {
        profileById.set(row.id, {
          billing_type: String(row.billing_type ?? "per_booking"),
          schedule_type: String(row.schedule_type ?? "on_demand"),
        });
      }
    }
  }

  let enriched: Row[] = filtered.map((r) => {
    const pr = r.user_id ? profileById.get(r.user_id) : undefined;
    return {
      ...r,
      customer_billing_type: pr?.billing_type ?? null,
      customer_schedule_type: pr?.schedule_type ?? null,
    };
  });

  if (opsQuick === "monthly_only") {
    enriched = enriched.filter((r) => (r.customer_billing_type ?? "").toLowerCase() === "monthly");
  } else if (opsQuick === "awaiting_payment") {
    enriched = enriched.filter((r) => (r.status ?? "").toLowerCase() === "pending_payment");
  } else if (opsQuick === "tomorrow") {
    const tomorrowYmd = addDaysYmd(today, 1);
    enriched = enriched.filter((r) => r.date === tomorrowYmd);
  } else if (opsQuick === "today") {
    enriched = enriched.filter((r) => classifyBooking(r, today) === "today");
  }

  return NextResponse.json({
    bookings: enriched,
    metrics: {
      totalBookingsToday,
      revenueTodayZar,
      averageOrderValueTodayZar: aovTodayZar,
      repeatCustomerPercent,
      repeatBookingRatePercent: repeatCustomerPercent,
      revenuePerCustomerZar,
      missingUserIdCount,
      failedJobsCount: (failedJobs ?? []).length,
      vipDistribution,
      topCustomers,
      demandOpenBookings: demandSupply.demand,
      supplyAvailableCleaners: demandSupply.supply,
      liveSurgeMultiplier: demandSupply.multiplier,
      slaBreachMinutes: getDispatchSlaBreachMinutes(),
      paymentLinkChannelStats,
    },
    failedJobs: failedJobs ?? [],
    cities: cityRows ?? [],
    selectedCityId: cityId || null,
  });
}

const ADMIN_BOOKING_SERVICE_IDS = new Set<string>(["quick", "standard", "airbnb", "deep", "carpet", "move"]);

/**
 * Admin: create a booking for an existing customer (monthly → no Paystack; per_booking → Paystack + notifications).
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const date = typeof body.date === "string" ? body.date.trim() : "";
  const timeRaw = typeof body.time === "string" ? body.time.trim() : "";
  const timeHm = normalizeTimeHm(timeRaw);
  const serviceRaw = typeof body.service === "string" ? body.service.trim().toLowerCase() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 4000) : "";
  const totalPaidZar =
    typeof body.totalPaidZar === "number" && Number.isFinite(body.totalPaidZar) ? Math.round(body.totalPaidZar) : NaN;
  const roomsRaw = body.rooms ?? body.bedrooms;
  const roomsOpt =
    typeof roomsRaw === "number" && Number.isFinite(roomsRaw) ? Math.round(roomsRaw) : undefined;
  const bathroomsOpt =
    typeof body.bathrooms === "number" && Number.isFinite(body.bathrooms) ? Math.round(body.bathrooms) : undefined;
  const extrasOpt = Array.isArray(body.extras)
    ? (body.extras as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;
  const force =
    body.force === true ||
    body.force === "true" ||
    (typeof body.force === "string" && body.force.trim().toLowerCase() === "true");
  const adminMarkCompleted =
    body.admin_mark_completed === true ||
    body.admin_mark_completed === "true" ||
    (typeof body.admin_mark_completed === "string" &&
      body.admin_mark_completed.trim().toLowerCase() === "true");
  const overrideReasonRaw = typeof body.override_reason === "string" ? body.override_reason.trim() : "";
  const overrideReason = overrideReasonRaw.length > 500 ? overrideReasonRaw.slice(0, 500) : overrideReasonRaw;

  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ error: "Select an existing customer." }, { status: 400 });
  }
  if (!location) {
    return NextResponse.json({ error: "location is required." }, { status: 400 });
  }
  if (notes.length < 3) {
    return NextResponse.json({ error: "notes are required (at least 3 characters)." }, { status: 400 });
  }
  if (!ADMIN_BOOKING_SERVICE_IDS.has(serviceRaw)) {
    return NextResponse.json(
      { error: "Invalid service. Use one of: quick, standard, airbnb, deep, carpet, move." },
      { status: 400 },
    );
  }
  if (!Number.isFinite(totalPaidZar) || totalPaidZar < 1 || totalPaidZar > 100_000) {
    return NextResponse.json(
      { error: "totalPaidZar must be a number between 1 and 100000 (ZAR), inclusive." },
      { status: 400 },
    );
  }

  if (roomsOpt == null || bathroomsOpt == null || roomsOpt < 1 || roomsOpt > 20 || bathroomsOpt < 1 || bathroomsOpt > 20) {
    return NextResponse.json(
      {
        error:
          "rooms and bathrooms are required (whole numbers 1–20). Send `rooms` and `bathrooms` in the request body.",
      },
      { status: 400 },
    );
  }
  const rooms = Math.min(20, Math.max(1, Math.round(roomsOpt)));
  const bathrooms = Math.min(20, Math.max(1, Math.round(bathroomsOpt)));
  const extrasAllowed = (extrasOpt ?? []).filter(
    (x): x is string => typeof x === "string" && BOOKING_EXTRA_ID_SET.has(x.trim()),
  );
  const extrasPersist = sanitizeBookingExtrasForPersist(extrasAllowed, {
    where: "POST /api/admin/bookings",
  });

  const adminSlotOverride =
    body.admin_slot_override === true ||
    body.admin_slot_override === "true" ||
    (typeof body.admin_slot_override === "string" && body.admin_slot_override.trim().toLowerCase() === "true");
  const selectedCleanerRaw = typeof body.selected_cleaner_id === "string" ? body.selected_cleaner_id.trim() : "";
  const ignoreCleanerSlotConflict =
    body.ignore_cleaner_slot_conflict === true ||
    body.ignore_cleaner_slot_conflict === "true" ||
    (typeof body.ignore_cleaner_slot_conflict === "string" &&
      body.ignore_cleaner_slot_conflict.trim().toLowerCase() === "true");
  const cleanerSlotOverrideReasonRaw =
    typeof body.cleaner_slot_override_reason === "string" ? body.cleaner_slot_override_reason.trim().slice(0, 500) : "";
  const cleanerSlotOverrideReasonForDb =
    ignoreCleanerSlotConflict && cleanerSlotOverrideReasonRaw.length > 0 ? cleanerSlotOverrideReasonRaw : null;

  const amountPaidCents = Math.round(totalPaidZar * 100);

  const slot = assertAdminBookingSlotAllowed({ dateYmd: date, timeHm, adminSlotOverride });
  if (!slot.ok) {
    return NextResponse.json({ error: slot.error }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  let selectedCleanerId: string | null = null;
  if (selectedCleanerRaw && /^[0-9a-f-]{36}$/i.test(selectedCleanerRaw)) {
    const { data: clRow } = await admin.from("cleaners").select("id").eq("id", selectedCleanerRaw).maybeSingle();
    if (clRow && typeof (clRow as { id?: unknown }).id === "string") {
      selectedCleanerId = selectedCleanerRaw;
    }
  }

  if (selectedCleanerId && !ignoreCleanerSlotConflict) {
    const conflictBookingId = await findCleanerSlotConflict(admin, {
      cleanerId: selectedCleanerId,
      dateYmd: date,
      timeHm,
    });
    if (conflictBookingId) {
      return NextResponse.json(
        {
          error:
            "This cleaner already has an active booking (or reserved slot) at this date and time. Open the conflicting row, or submit again with ignore_cleaner_slot_conflict=true after acknowledging the overlap.",
          cleaner_slot_conflict: true,
          conflicting_booking_id: conflictBookingId,
        },
        { status: 409 },
      );
    }
  }

  const serviceSlug = adminBookingServiceSlug(serviceRaw);
  const locationHash = adminBookingLocationFingerprint(location);

  const duplicateFingerprint = {
    customerUserId: userId,
    serviceDate: date,
    serviceTime: timeHm,
    serviceSlug,
    locationHash,
  };

  if (!force) {
    const { data: dupRows, error: dupErr } = await applyActiveAdminBookingSlotFilters(
      admin.from("bookings").select("id, created_at"),
      { userId, date, timeHm, serviceSlug },
    ).limit(1);

    if (dupErr) {
      await reportOperationalIssue("error", "api/admin/bookings POST duplicate probe", dupErr.message);
      return NextResponse.json({ error: "Could not verify duplicate bookings." }, { status: 500 });
    }

    const dup = dupRows?.[0] as { id: string; created_at?: string | null } | undefined;
    if (dup?.id) {
      const createdMs = dup.created_at ? Date.parse(dup.created_at) : NaN;
      const recentDuplicate =
        Number.isFinite(createdMs) && Date.now() - createdMs >= 0 && Date.now() - createdMs <= RECENT_DUPLICATE_MS;
      void logSystemEvent({
        level: "info",
        source: "admin_booking_create",
        message: "admin_booking_duplicate_blocked",
        context: {
          existing_booking_id: dup.id,
          fingerprint: duplicateFingerprint,
          recent_duplicate: recentDuplicate,
          service_slug: serviceSlug,
          date,
          time: timeHm,
        },
      });
      return NextResponse.json(
        {
          error: recentDuplicate
            ? "Looks like you just created this booking. Open it to confirm, or submit again with force=true only if you need a second row on purpose."
            : "This customer already has a booking on this date, time, and service. Open it, change the slot or service, or submit again with force=true if this is intentional.",
          existing_booking_id: dup.id,
          existing_booking_created_at: typeof dup.created_at === "string" ? dup.created_at : null,
          duplicate: true,
          recent_duplicate: recentDuplicate,
        },
        { status: 409 },
      );
    }
  }

  const idem = await claimAdminBookingCreateIdempotency(admin, request, duplicateFingerprint);
  if (idem.kind === "replay") return idem.response;
  if (idem.kind === "in_flight") return idem.response;
  if (idem.kind === "error") return idem.response;

  const claimId = idem.kind === "proceed" ? idem.claimId : null;

  const bail = async (res: NextResponse) => {
    if (claimId) await abandonAdminBookingCreateIdempotency(admin, claimId);
    return res;
  };

  const { data: prof, error: profErr } = await admin
    .from("user_profiles")
    .select("billing_type, schedule_type")
    .eq("id", userId)
    .maybeSingle();

  if (profErr) {
    await reportOperationalIssue("error", "api/admin/bookings POST", profErr.message);
    return bail(NextResponse.json({ error: profErr.message }, { status: 500 }));
  }
  if (!prof) {
    return bail(NextResponse.json({ error: "Select an existing customer." }, { status: 400 }));
  }

  const billingType = String((prof as { billing_type?: string }).billing_type ?? "per_booking").toLowerCase();
  const scheduleType = String((prof as { schedule_type?: string }).schedule_type ?? "on_demand").toLowerCase();

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user?.email) {
    return bail(NextResponse.json({ error: "Select an existing customer." }, { status: 400 }));
  }
  const customerEmail = normalizeEmail(String(authUser.user.email));

  const serviceId: BookingServiceId = parseBookingServiceId(serviceRaw) ?? "standard";
  const paymentLinkTtlHours = Math.max(1, Math.round(adminPaymentLinkTtlMs() / (60 * 60 * 1000)));

  if (billingType === "monthly") {
    if (selectedCleanerId && !ignoreCleanerSlotConflict) {
      const lateConflictMonthly = await findCleanerSlotConflict(admin, {
        cleanerId: selectedCleanerId,
        dateYmd: date,
        timeHm,
      });
      if (lateConflictMonthly) {
        return bail(
          NextResponse.json(
            {
              error:
                "Another booking took this cleaner for this slot while you were submitting. Try again, or acknowledge the overlap.",
              cleaner_slot_conflict: true,
              conflicting_booking_id: lateConflictMonthly,
            },
            { status: 409 },
          ),
        );
      }
    }

    const paystackReference = `adm_mi_${crypto.randomUUID()}`;
    const completedAtIso = adminMarkCompleted ? new Date().toISOString() : null;
    const assignedAtIso = selectedCleanerId ? new Date().toISOString() : null;

    let rowStatus: "completed" | "assigned" | "pending" = adminMarkCompleted
      ? "completed"
      : selectedCleanerId
        ? "assigned"
        : "pending";
    if (selectedCleanerId && !adminMarkCompleted && rowStatus === "pending") {
      rowStatus = "assigned";
    }

    // created_at is DB default (now); omit from insert so clustering stays deterministic.
    const ins = await insertBookingRowUnified(admin, {
      source: "admin_monthly",
      rowBase: {
        paystack_reference: paystackReference,
        customer_email: customerEmail,
        customer_name: null,
        customer_phone: null,
        user_id: userId,
        amount_paid_cents: amountPaidCents,
        currency: "ZAR",
        service_slug: serviceSlug,
        status: rowStatus,
        dispatch_status: selectedCleanerId ? "assigned" : "searching",
        ...(adminMarkCompleted && completedAtIso ? { completed_at: completedAtIso } : {}),
        surge_multiplier: 1,
        surge_reason: null,
        service: getServiceLabel(serviceId),
        location,
        location_id: null,
        city_id: null,
        date,
        time: timeHm,
        total_paid_zar: totalPaidZar,
        pricing_version_id: null,
        price_breakdown: null,
        total_price: null,
        created_by_admin: true,
        created_by: auth.userId,
        booking_source: "admin",
        created_by_admin_id: auth.userId,
        ...(selectedCleanerId
          ? {
              selected_cleaner_id: selectedCleanerId,
              assignment_type: "user_selected",
              cleaner_id: selectedCleanerId,
              cleaner_response_status: CLEANER_RESPONSE.PENDING,
              ...(assignedAtIso ? { assigned_at: assignedAtIso } : {}),
            }
          : {}),
        ...(ignoreCleanerSlotConflict
          ? {
              ignore_cleaner_conflict: true,
              ...(cleanerSlotOverrideReasonForDb
                ? { cleaner_slot_override_reason: cleanerSlotOverrideReasonForDb }
                : {}),
            }
          : {}),
        ...(force
          ? {
              slot_duplicate_exempt: true,
              admin_force_slot_override: true,
            }
          : {}),
      },
      rooms,
      bathrooms,
      extrasRaw: extrasPersist,
      serviceSlugForFlat: serviceRaw,
      locationForFlat: location,
      dateForFlat: date,
      timeForFlat: timeHm,
      snapshotExtension: {
        admin_notes: notes,
        customer_notes: notes,
        service_slug: serviceSlug,
        ...(ignoreCleanerSlotConflict && cleanerSlotOverrideReasonForDb
          ? { cleaner_slot_override_reason: cleanerSlotOverrideReasonForDb }
          : {}),
      },
      select: "id, monthly_invoice_id, created_at",
      logInsert: false,
      lineItemsPricing: {
        mode: "monthly_bundled_zar",
        quotedTotalZar: totalPaidZar,
        bundleLabel: "Admin monthly booking (job subtotal)",
      },
    });

    const row = ins.ok ? ins.row : null;

    if (!ins.ok || !row || typeof (row as { id?: string }).id !== "string") {
      const pgCode = ins.ok ? undefined : ins.pgCode;
      const msg = ins.ok ? "" : ins.error;
      if (
        pgCode === "23505" ||
        /duplicate key|unique constraint|idx_bookings_unique_active_customer_slot/i.test(msg)
      ) {
        const { data: dupExisting } = await applyActiveAdminBookingSlotFilters(
          admin.from("bookings").select("id, created_at"),
          { userId, date, timeHm, serviceSlug },
        ).limit(1);
        const ex = dupExisting?.[0] as { id: string; created_at?: string | null } | undefined;
        return bail(
          NextResponse.json(
            {
              error:
                "This slot already has an active booking (database constraint). Open the existing row, or use force after acknowledging the duplicate.",
              existing_booking_id: ex?.id ?? null,
              existing_booking_created_at: typeof ex?.created_at === "string" ? ex.created_at : null,
              duplicate: true,
            },
            { status: 409 },
          ),
        );
      }
      return bail(
        NextResponse.json(
          { error: !ins.ok ? ins.error : "Could not create booking." },
          { status: 500 },
        ),
      );
    }

    const newBookingId = (row as { id: string }).id;
    const race = await resolveMonthlyBookingDuplicateRace(admin, {
      ourBookingId: newBookingId,
      userId,
      date,
      timeHm,
      serviceSlug,
      force,
    });
    if (race.kind === "rpc_error") {
      return bail(NextResponse.json({ error: race.message }, { status: 500 }));
    }
    if (race.kind === "reject") {
      let winnerCreated = race.winnerCreatedAt ?? "";
      if (!winnerCreated) {
        const { data: winnerRow } = await admin
          .from("bookings")
          .select("created_at")
          .eq("id", race.winnerId)
          .maybeSingle();
        winnerCreated =
          winnerRow && typeof winnerRow === "object" && "created_at" in winnerRow
            ? String((winnerRow as { created_at?: string | null }).created_at ?? "")
            : "";
      }
      const raceLabels = formatAdminRaceSlotLabels({ date, timeHm, serviceRaw, location });
      if (race.deletedIds.length > 0) {
        void logSystemEvent({
          level: "info",
          source: "admin_booking_create",
          message: "admin_booking_race_cleanup",
          context: {
            winner_id: race.winnerId,
            deleted_ids: race.deletedIds,
            service_slug: serviceSlug,
            date,
            time: timeHm,
            cluster_size: race.clusterSize,
            winner_created_at: (race.winnerCreatedAt ?? winnerCreated) || null,
            requester_booking_id: newBookingId,
            cluster_start: race.clusterStart,
            cluster_end: race.clusterEnd,
          },
        });
      }
      void logSystemEvent({
        level: "warn",
        source: "admin_booking_create",
        message: "admin_booking_duplicate_race_rolled_back",
        context: {
          rolled_back_booking_id: newBookingId,
          winner_booking_id: race.winnerId,
          userId,
          service_slug: serviceSlug,
          date,
          time: timeHm,
          left_duplicate: race.leftDuplicate,
          deleted_ids: race.deletedIds,
          cluster_size: race.clusterSize,
          winner_created_at: (race.winnerCreatedAt ?? winnerCreated) || null,
          requester_booking_id: newBookingId,
          cluster_start: race.clusterStart,
          cluster_end: race.clusterEnd,
        },
      });
      return bail(
        NextResponse.json(
          {
            error: race.leftDuplicate
              ? "Another booking kept this slot; open it to reconcile or use Create anyway if you need both."
              : "Another booking for this slot was created at the same time. Open the existing row or try again.",
            existing_booking_id: race.winnerId,
            existing_booking_created_at: winnerCreated || null,
            duplicate: true,
            race_rolled_back: true,
            ...(race.leftDuplicate ? { race_left_duplicate: true } : {}),
            race_cluster_start: race.clusterStart,
            race_cluster_end: race.clusterEnd,
            race_cluster_size: race.clusterSize,
            ...raceLabels,
          },
          { status: 409 },
        ),
      );
    }
    if (race.deletedIds.length > 0) {
      void logSystemEvent({
        level: "info",
        source: "admin_booking_create",
        message: "admin_booking_race_cleanup",
        context: {
          winner_id: newBookingId,
          deleted_ids: race.deletedIds,
          service_slug: serviceSlug,
          date,
          time: timeHm,
          cluster_size: race.clusterSize,
          winner_created_at: race.winnerCreatedAt,
          requester_booking_id: newBookingId,
          cluster_start: race.clusterStart,
          cluster_end: race.clusterEnd,
        },
      });
    }

    if (!force) {
      const { count: activeSlotCount, error: invErr } = await applyActiveAdminBookingSlotFilters(
        admin.from("bookings").select("id", { count: "exact", head: true }),
        { userId, date, timeHm, serviceSlug },
      );
      if (!invErr && typeof activeSlotCount === "number" && activeSlotCount > 1) {
        void logSystemEvent({
          level: "warn",
          source: "admin_booking_create",
          message: "admin_booking_race_invariant_violation",
          context: {
            booking_id: newBookingId,
            userId,
            service_slug: serviceSlug,
            date,
            time: timeHm,
            active_slot_count: activeSlotCount,
            cluster_size: race.clusterSize,
            cluster_start: race.clusterStart,
            cluster_end: race.clusterEnd,
          },
        });
      }
    }

    await runAdminBookingPostCreateNormalizationAndEarnings(admin, newBookingId, "admin_booking_create_monthly");

    void logSystemEvent({
      level: "info",
      source: "admin_booking_create",
      message: "admin_monthly_booking_created",
      context: {
        bookingId: newBookingId,
        userId,
        schedule_type: scheduleType,
        admin_id: auth.userId,
        admin_mark_completed: adminMarkCompleted,
      },
    });
    if (force) {
      void logSystemEvent({
        level: "info",
        source: "admin_booking_create",
        message: "admin_booking_force_override_used",
        context: {
          bookingId: newBookingId,
          userId,
          admin_id: auth.userId,
          mode: "monthly",
          service_slug: serviceSlug,
          date,
          time: timeHm,
          override_reason: overrideReason.length > 0 ? overrideReason : null,
        },
      });
    }

    const monthlyBody: Record<string, unknown> = {
      ok: true,
      mode: "monthly",
      message: "Booking created (billed monthly)",
      bookingId: newBookingId,
      monthly_invoice_id: (row as { monthly_invoice_id?: string | null }).monthly_invoice_id ?? null,
      amount_paid_cents: amountPaidCents,
    };
    if (claimId) await finalizeAdminBookingCreateIdempotency(admin, claimId, 200, monthlyBody);
    invalidateCleanerAvailabilityCache(date, timeHm);
    return NextResponse.json(monthlyBody);
  }

  if (billingType !== "per_booking") {
    return bail(NextResponse.json({ error: "Unsupported billing_type on profile." }, { status: 400 }));
  }

  // Per-booking / Paystack: intentionally no post-insert race cleanup; rely on idempotency + duplicate pre-check.
  // If duplicates slip through after payment, reconcile Paystack before deleting rows.

  const { data: profPaystackGate, error: profGateErr } = await admin
    .from("user_profiles")
    .select("billing_type")
    .eq("id", userId)
    .maybeSingle();
  if (profGateErr) {
    await reportOperationalIssue("error", "api/admin/bookings POST paystack_gate", profGateErr.message);
    return bail(NextResponse.json({ error: profGateErr.message }, { status: 500 }));
  }
  const gateBilling = String((profPaystackGate as { billing_type?: string } | null)?.billing_type ?? "per_booking")
    .trim()
    .toLowerCase();
  if (gateBilling === "monthly") {
    return bail(
      NextResponse.json(
        {
          error:
            "This customer is on monthly billing — Paystack checkout is disabled. Refresh the customer card and try again.",
        },
        { status: 409 },
      ),
    );
  }

  if (selectedCleanerId && !ignoreCleanerSlotConflict) {
    const lateConflictPaystack = await findCleanerSlotConflict(admin, {
      cleanerId: selectedCleanerId,
      dateYmd: date,
      timeHm,
    });
    if (lateConflictPaystack) {
      return bail(
        NextResponse.json(
          {
            error:
              "Another booking took this cleaner for this slot while you were submitting. Try again, or acknowledge the overlap.",
            cleaner_slot_conflict: true,
            conflicting_booking_id: lateConflictPaystack,
          },
          { status: 409 },
        ),
      );
    }
  }

  let locked: Record<string, unknown>;
  try {
    locked = buildAdminPaystackLockedPayload({
      serviceId,
      dateYmd: date,
      timeHm,
      location,
      finalPriceZar: totalPaidZar,
      rooms,
      bathrooms,
      ...(extrasPersist.length > 0 ? { extras: extrasPersist.map((e) => e.slug) } : {}),
    });
  } catch (e) {
    return bail(
      NextResponse.json({ error: e instanceof Error ? e.message : "Invalid checkout lock." }, { status: 400 }),
    );
  }

  const paystackBody: Record<string, unknown> = {
    email: customerEmail,
    locked,
    relaxedLockValidation: true,
    tip: 0,
    ...(selectedCleanerId ? { cleanerId: selectedCleanerId } : {}),
  };

  const paystackResult = await processPaystackInitializeBody(paystackBody, {
    adminTrustedCustomerUserId: userId,
    ...(force ? { adminSlotFlags: { slotDuplicateExempt: true, adminForceSlotOverride: true } } : {}),
  });
  if (!paystackResult.ok) {
    let existing_booking_id: string | null = null;
    let existing_booking_created_at: string | null = null;
    if (paystackResult.duplicateSlot) {
      const { data: dupPay } = await applyActiveAdminBookingSlotFilters(
        admin.from("bookings").select("id, created_at"),
        { userId, date, timeHm, serviceSlug },
      ).limit(1);
      const ex = dupPay?.[0] as { id: string; created_at?: string | null } | undefined;
      if (ex?.id) existing_booking_id = ex.id;
      if (typeof ex?.created_at === "string") existing_booking_created_at = ex.created_at;
    }
    return bail(
      NextResponse.json(
        {
          error: paystackResult.error,
          ...(paystackResult.errorCode != null ? { errorCode: paystackResult.errorCode } : {}),
          ...(paystackResult.duplicateSlot
            ? {
                duplicate: true,
                existing_booking_id,
                existing_booking_created_at,
              }
            : {}),
        },
        { status: paystackResult.status },
      ),
    );
  }

  const finalized = await finalizeAdminPaystackCheckout({
    admin,
    adminUserId: auth.userId,
    result: paystackResult,
    locked,
    notificationMode: "chain_plus_email",
    ignoreCleanerSlotConflict,
    cleanerSlotOverrideReason: cleanerSlotOverrideReasonForDb,
  });
  if (!finalized.ok) {
    return bail(NextResponse.json({ error: finalized.error }, { status: 500 }));
  }

  const createdPaystackBookingId =
    typeof paystackResult.bookingId === "string" && paystackResult.bookingId.trim()
      ? paystackResult.bookingId.trim()
      : null;
  if (createdPaystackBookingId) {
    if (adminMarkCompleted) {
      const completedAt = new Date().toISOString();
      const { error: completeErr } = await admin
        .from("bookings")
        .update({
          status: "completed",
          completed_at: completedAt,
          dispatch_status: selectedCleanerId ? "assigned" : "searching",
        })
        .eq("id", createdPaystackBookingId)
        .eq("status", "pending_payment");
      if (completeErr) {
        await reportOperationalIssue("error", "api/admin/bookings POST", completeErr.message, {
          bookingId: createdPaystackBookingId,
        });
        return bail(NextResponse.json({ error: "Could not mark booking completed." }, { status: 500 }));
      }
    }
    await runAdminBookingPostCreateNormalizationAndEarnings(
      admin,
      createdPaystackBookingId,
      "admin_booking_create_per_booking",
    );
  }

  const perBody: Record<string, unknown> = {
    ok: true,
    mode: "per_booking",
    message: "Payment link sent",
    bookingId: paystackResult.bookingId,
    authorizationUrl: paystackResult.authorizationUrl,
    reference: paystackResult.reference,
    payment_link_expires_at: finalized.expiresAt,
    payment_link_ttl_hours: paymentLinkTtlHours,
    amount_paid_cents: amountPaidCents,
  };
  if (claimId) await finalizeAdminBookingCreateIdempotency(admin, claimId, 200, perBody);
  if (force && paystackResult.bookingId) {
    void logSystemEvent({
      level: "info",
      source: "admin_booking_create",
      message: "admin_booking_force_override_used",
      context: {
        bookingId: paystackResult.bookingId,
        userId,
        admin_id: auth.userId,
        mode: "per_booking",
        service_slug: serviceSlug,
        date,
        time: timeHm,
        override_reason: overrideReason.length > 0 ? overrideReason : null,
      },
    });
  }
  invalidateCleanerAvailabilityCache(date, timeHm);
  return NextResponse.json(perBody);
}
