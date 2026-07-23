import crypto from "crypto";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
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
import { parseAdminSelectedCleanerIds } from "@/lib/admin/parseAdminSelectedCleanerIds";
import {
  adminPreferredCleanerInsertExtras,
  patchAdminPerBookingPreferredCleaners,
  syncAdminPreferredCleanerRoster,
} from "@/lib/admin/persistAdminPreferredCleaners";
import { applyActiveAdminBookingSlotFilters } from "@/lib/booking/activeAdminBookingSlot";
import { buildAdminPaystackLockedPayload } from "@/lib/admin/buildAdminPaystackLockedPayload";
import { assertAdminBookingSlotAllowed, normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { fetchSlaDispatchLastActions } from "@/lib/admin/slaDispatchLastAction";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  computeOpsSnapshotFromRows,
  OPS_SNAPSHOT_BOOKING_SELECT,
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
import {
  buildEquipmentPricingSnapshot,
  equipmentPersistFields,
  quoteEquipmentForAddress,
} from "@/lib/booking-v2/equipmentPricing";
import { loadEquipmentPricingConfig } from "@/lib/booking-v2/loadEquipmentPricingConfig";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import { bookingCustomerKey, bookingCustomerOwnershipPatch } from "@/lib/booking/bookingCustomerIdentity";
import { resolveBookingOwnershipColumn } from "@/lib/customer/customerBookingsForUser";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";
import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { reportOperationalIssue, logSystemEvent } from "@/lib/logging/systemLog";
import { aggregatePaymentLinkDeliveryStats } from "@/lib/pay/paymentLinkDeliveryStats";
import { getServiceLabel, parseBookingServiceId, type BookingServiceId } from "@/components/booking/serviceCategories";
import { getDemandSupplySnapshotByCity } from "@/lib/pricing/demandSupplySurge";
import { addDaysYmd } from "@/lib/recurring/johannesburgCalendar";
import { fetchTeamRosterByBookingIds } from "@/lib/cleaner/fetchTeamRosterByBookingIds";
import { effectiveBookingCleanersForList } from "@/lib/admin/adminBookingAssignmentDisplay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runAdminBookingPostCreateNormalizationAndEarnings } from "@/lib/admin/adminBookingPostCreatePipeline";
import { ensureUserProfileForAuthUser } from "@/lib/admin/ensureUserProfileForAuthUser";
import { readCustomerProfileContact } from "@/lib/customer/readCustomerProfileContact";
import { classifyAdminBookingListRow } from "@/lib/admin/adminBookingListClassify";
import { buildDashboardLifecycleAlignmentWire } from "@/lib/booking/readModels/bookingReadModel";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import {
  buildCompletionCoherencePatch,
  validateAdminMonthlyCompletedAssignee,
} from "@/lib/booking/bookingCompletionIntegrity";
import { bookingUncollectedCashColumns } from "@/lib/booking/bookingPaidAmountColumns";
import type { AdminMarkPaidMethod } from "@/lib/booking/adminMarkBookingPaid";
import { settleAdminBookingPaymentAlreadyReceived } from "@/lib/admin/settleAdminBookingPaymentAlreadyReceived";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** If the conflicting booking was created this recently, surface `recent_duplicate` for calmer admin UX. */
const RECENT_DUPLICATE_MS = 4 * 60 * 1000;

/** "Top customers" must not reuse the paginated list slice (default 4000 rows) or recurring-heavy emails undercount. */
const TOP_CUSTOMERS_AGG_ROW_CAP = 80_000;

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
  service_slug?: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  total_price?: number | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  cleaner_payout_cents: number | null;
  cleaner_bonus_cents: number | null;
  display_earnings_cents?: number | null;
  cleaner_earnings_total_cents?: number | null;
  company_revenue_cents: number | null;
  payout_percentage: number | null;
  payout_type: string | null;
  is_test: boolean | null;
  status: string | null;
  dispatch_status: string | null;
  surge_multiplier: number | null;
  surge_reason: string | null;
  customer_id: string | null;
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
  cleaner_response_status?: string | null;
  accepted_at?: string | null;
  is_recurring_generated?: boolean | null;
  is_monthly_billing_booking?: boolean | null;
  billing_type?: string | null;
  recurring_id?: string | null;
  payout_status?: string | null;
  payout_paid_at?: string | null;
  admin_recurring_unpaid_completion_override_at?: string | null;
  admin_recurring_unpaid_completion_override_by?: string | null;
  monthly_invoice_id: string | null;
  customer_billing_type?: string | null;
  customer_schedule_type?: string | null;
  admin_force_slot_override?: boolean | null;
  booking_source?: string | null;
  created_by_admin_id?: string | null;
  ignore_cleaner_conflict?: boolean | null;
  cleaner_slot_override_reason?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  /** Joined for list UI; null when no `team_id`. */
  team?: { id: string; name: string | null } | null;
  /** Canonical roster rows for list (from `booking_cleaners` + cleaner names). */
  booking_cleaners?: Array<{ cleaner_id: string; full_name: string | null; role: string }>;
};

function toOpsSnapshotRow(r: Row): OpsSnapshotRow {
  return {
    id: r.id,
    status: r.status,
    date: r.date,
    time: r.time,
    cleaner_id: r.cleaner_id,
    team_id: r.team_id,
    dispatch_status: r.dispatch_status,
    became_pending_at: r.became_pending_at,
    created_at: r.created_at,
    total_paid_zar: r.total_paid_zar,
    amount_paid_cents: r.amount_paid_cents,
    is_recurring_generated: r.is_recurring_generated,
    is_monthly_billing_booking: r.is_monthly_billing_booking,
    billing_type: r.billing_type,
    monthly_invoice_id: r.monthly_invoice_id,
    recurring_id: r.recurring_id,
    payment_status: r.payment_status,
  };
}

const ADMIN_LIST_ROSTER_CHUNK = 120;
const PAGINATED_DEFAULT_PAGE_SIZE = 25;
const PAGINATED_MAX_PAGE_SIZE = 100;
const STATUS_COUNT_KEYS = [
  "confirmed",
  "assigned",
  "in_progress",
  "completed",
  "cancelled",
  "pending_payment",
  "pending",
] as const;

// Supabase builder generics diverge by selected column shape; this helper preserves runtime chaining across those shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminBookingQuery = any;

function parsePositiveInt(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function clampPageSize(raw: string | null): number {
  return Math.min(PAGINATED_MAX_PAGE_SIZE, Math.max(1, parsePositiveInt(raw, PAGINATED_DEFAULT_PAGE_SIZE)));
}

function safeSearchTerm(raw: string | null): string {
  return String(raw ?? "")
    .trim()
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function escapeIlike(raw: string): string {
  return raw.replace(/[%_]/g, (m) => `\\${m}`);
}

function applyAdminBookingDbFilters(params: {
  query: AdminBookingQuery;
  cityId: string | null;
  serviceSlug: string | null;
  recurringIdFilter: string | null;
  recurringListScope: boolean;
  bookingStatus: string | null;
  from: string | null;
  to: string | null;
  filter: string;
  opsQuick: string;
  search: string;
  today: string;
  includeBookingStatus?: boolean;
}): AdminBookingQuery {
  let q = params.query;
  if (params.cityId && !params.recurringListScope) q = q.eq("city_id", params.cityId);
  if (params.serviceSlug && !params.recurringListScope) q = q.eq("service_slug", params.serviceSlug);
  if (params.recurringIdFilter) q = q.eq("recurring_id", params.recurringIdFilter);
  if (params.includeBookingStatus !== false && params.bookingStatus && params.bookingStatus !== "all") {
    q = q.eq("status", params.bookingStatus);
  }
  if (!params.recurringListScope && params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    q = q.gte("date", params.from);
  }
  if (!params.recurringListScope && params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    q = q.lte("date", params.to);
  }
  if (!params.recurringListScope) {
    if (params.filter === "follow-up") {
      q = q.eq("payment_needs_follow_up", true);
    } else if (params.filter === "today") {
      q = q.eq("date", params.today);
    } else if (params.filter === "upcoming") {
      q = q.gt("date", params.today);
    } else if (params.filter === "completed") {
      q = q.or(`status.in.(completed,cancelled,failed,payment_expired),date.lt.${params.today}`);
    } else if (params.filter === "sla") {
      q = q.eq("status", "pending").is("cleaner_id", null).in("dispatch_status", ["searching", "offered"]);
    } else if (params.filter === "unassigned") {
      q = q
        .is("cleaner_id", null)
        .is("team_id", null)
        .not("status", "in", "(completed,cancelled,failed,payment_expired,pending_payment)")
        .not("dispatch_status", "in", "(unassignable,no_cleaner)");
    } else if (params.filter === "unassignable") {
      q = q
        .in("dispatch_status", ["unassignable", "no_cleaner"])
        .is("cleaner_id", null)
        .is("team_id", null)
        .not("status", "in", "(completed,cancelled,failed,payment_expired,pending_payment)");
    } else if (params.filter === "starting-soon") {
      q = q
        .is("cleaner_id", null)
        .is("team_id", null)
        .not("status", "in", "(completed,cancelled,failed,payment_expired,pending_payment)")
        .gte("date", params.today);
    }

    if (params.opsQuick === "awaiting_payment") {
      q = q.eq("status", "pending_payment");
    } else if (params.opsQuick === "tomorrow") {
      q = q.eq("date", addDaysYmd(params.today, 1));
    } else if (params.opsQuick === "today") {
      q = q.eq("date", params.today);
    }
  }

  if (params.search) {
    const like = `%${escapeIlike(params.search)}%`;
    const clauses = [
      `customer_name.ilike.${like}`,
      `customer_email.ilike.${like}`,
      `location.ilike.${like}`,
      `service.ilike.${like}`,
      `service_slug.ilike.${like}`,
      `paystack_reference.ilike.${like}`,
    ];
    if (/^[0-9a-f-]{36}$/i.test(params.search)) clauses.unshift(`id.eq.${params.search}`);
    q = q.or(clauses.join(","));
  }

  return q;
}

async function attachTeamAndRosterToBookings(admin: SupabaseClient, bookings: Row[]): Promise<Row[]> {
  if (!bookings.length) return bookings;
  const ids = bookings.map((r) => r.id).filter(Boolean);
  const rosterMap = new Map<string, Array<{ cleaner_id: string; full_name: string | null; role: string }>>();
  for (let i = 0; i < ids.length; i += ADMIN_LIST_ROSTER_CHUNK) {
    const slice = ids.slice(i, i + ADMIN_LIST_ROSTER_CHUNK);
    const chunk = await fetchTeamRosterByBookingIds(admin, slice);
    for (const [bid, members] of chunk) rosterMap.set(bid, [...members]);
  }

  const teamIds = [...new Set(bookings.map((r) => String(r.team_id ?? "").trim()).filter(Boolean))];
  const teamNameMap = new Map<string, string | null>();
  for (let i = 0; i < teamIds.length; i += ADMIN_LIST_ROSTER_CHUNK) {
    const slice = teamIds.slice(i, i + ADMIN_LIST_ROSTER_CHUNK);
    const { data: teamRows, error: teamErr } = await admin.from("teams").select("id, name").in("id", slice);
    if (teamErr) continue;
    for (const t of teamRows ?? []) {
      const row = t as { id?: string; name?: string | null };
      const id = String(row.id ?? "").trim();
      if (id) teamNameMap.set(id, row.name?.trim() ? row.name.trim() : null);
    }
  }

  const directCleanerIds = [
    ...new Set(
      bookings
        .map((r) => String(r.cleaner_id ?? "").trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
  const directCleanerNameMap = new Map<string, string | null>();
  for (let i = 0; i < directCleanerIds.length; i += ADMIN_LIST_ROSTER_CHUNK) {
    const slice = directCleanerIds.slice(i, i + ADMIN_LIST_ROSTER_CHUNK);
    const { data: cleanerRows } = await admin.from("cleaners").select("id, full_name").in("id", slice);
    for (const c of cleanerRows ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      const id = String(row.id ?? "").trim();
      if (id) directCleanerNameMap.set(id, row.full_name?.trim() ? row.full_name.trim() : null);
    }
  }

  return bookings.map((r) => {
    const tid = String(r.team_id ?? "").trim();
    const directCleanerId = String(r.cleaner_id ?? "").trim();
    const roster = rosterMap.get(r.id) ?? [];
    const bookingCleanersRaw =
      roster.length > 0 || !directCleanerId
        ? roster
        : [
            {
              cleaner_id: directCleanerId,
              full_name: directCleanerNameMap.get(directCleanerId) ?? null,
              role: "lead",
            },
          ];
    const bookingCleaners = [...effectiveBookingCleanersForList(r, bookingCleanersRaw)];
    return {
      ...r,
      team: tid ? { id: tid, name: teamNameMap.get(tid) ?? null } : null,
      booking_cleaners: bookingCleaners,
    };
  });
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

  if (userErr || !user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const adminAuth = await requireAdminUser(user);
  if (!adminAuth.ok) {
    return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
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
  const search = safeSearchTerm(searchParams.get("search"));
  const paginationRequested = searchParams.has("page") || searchParams.has("pageSize") || search.length > 0;
  const requestedPage = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = clampPageSize(searchParams.get("pageSize"));
  const rangeFrom = (requestedPage - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;
  const opsQuick = (searchParams.get("opsQuick") ?? "").trim().toLowerCase();
  const serviceSlugRaw = (searchParams.get("serviceSlug") ?? searchParams.get("service") ?? "").trim().toLowerCase();
  const serviceSlug = serviceSlugRaw && serviceSlugRaw !== "all" ? serviceSlugRaw : null;
  const recurringIdRaw = (searchParams.get("recurring_id") ?? searchParams.get("recurringId") ?? "").trim();
  const recurringIdFilter = /^[0-9a-f-]{36}$/i.test(recurringIdRaw) ? recurringIdRaw : null;
  /** Drill-down from `/admin/recurring` — ignore ops/date quick filters so future visits are not hidden. */
  const recurringListScope = Boolean(recurringIdFilter);
  /** SLA breach queue only needs pending dispatch rows — avoid scanning 4k bookings + heavy metrics (prevents client timeouts / "Failed to fetch"). */
  const slaFast = filter === "sla" && !recurringListScope;
  const today = todayYmdJohannesburg();

  const bookingSelect =
    "id, customer_name, customer_email, service, service_slug, date, time, location, total_paid_zar, amount_paid_cents, total_price, base_amount_cents, service_fee_cents, cleaner_payout_cents, cleaner_bonus_cents, display_earnings_cents, cleaner_earnings_total_cents, company_revenue_cents, payout_percentage, payout_type, is_test, status, dispatch_status, surge_multiplier, surge_reason, customer_id, cleaner_id, selected_cleaner_id, assignment_type, fallback_reason, attempted_cleaner_id, became_pending_at, assigned_at, en_route_at, started_at, completed_at, created_at, paystack_reference, city_id, duration_minutes, estimated_duration_minutes, estimated_finish_at, pricing_summary, booking_snapshot, dispatch_attempt_count, created_by_admin, created_by, booking_source, created_by_admin_id, ignore_cleaner_conflict, cleaner_slot_override_reason, payment_link, payment_link_expires_at, payment_link_last_sent_at, payment_link_delivery, payment_link_reminder_1h_sent_at, payment_link_reminder_15m_sent_at, payment_link_send_count, payment_link_first_sent_at, payment_needs_follow_up, payment_completed_at, payment_conversion_seconds, payment_conversion_bucket, conversion_channel, payment_first_touch_channel, payment_last_touch_channel, payment_assist_channels, booking_priority, last_decision_snapshot, payment_status, cleaner_response_status, accepted_at, is_recurring_generated, is_monthly_billing_booking, billing_type, recurring_id, payout_status, payout_paid_at, admin_recurring_unpaid_completion_override_at, admin_recurring_unpaid_completion_override_by, monthly_invoice_id, admin_force_slot_override, team_id, is_team_job, team_member_count_snapshot";

  let bookingQuery = admin.from("bookings").select(bookingSelect, paginationRequested ? { count: "exact" } : undefined);
  bookingQuery = applyAdminBookingDbFilters({
    query: bookingQuery,
    cityId,
    serviceSlug,
    recurringIdFilter,
    recurringListScope,
    bookingStatus,
    from,
    to,
    filter,
    opsQuick,
    search,
    today,
  });
  if (!paginationRequested && slaFast) {
    bookingQuery = bookingQuery.order("created_at", { ascending: false }).limit(800);
  } else if (!paginationRequested && filter === "follow-up" && !recurringListScope) {
    bookingQuery = bookingQuery
      .order("payment_conversion_seconds", { ascending: false, nullsFirst: false })
      .order("payment_link_send_count", { ascending: false })
      .limit(2000);
  } else {
    bookingQuery = bookingQuery.order("created_at", { ascending: false });
    bookingQuery = paginationRequested ? bookingQuery.range(rangeFrom, rangeTo) : bookingQuery.limit(4000);
  }

  const topSpendSince = new Date();
  topSpendSince.setFullYear(topSpendSince.getFullYear() - 1);
  let topSpendQuery = admin
    .from("bookings")
    .select("customer_email, total_paid_zar, amount_paid_cents")
    .not("customer_email", "is", null);
  if (recurringIdFilter) {
    topSpendQuery = topSpendQuery.eq("recurring_id", recurringIdFilter);
  }
  if (!recurringListScope && from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    topSpendQuery = topSpendQuery.gte("date", from);
  }
  if (!recurringListScope && to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    topSpendQuery = topSpendQuery.lte("date", to);
  }
  if (!recurringListScope && !from && !to) {
    topSpendQuery = topSpendQuery.gte("created_at", topSpendSince.toISOString());
  }
  if (cityId && !recurringListScope) {
    topSpendQuery = topSpendQuery.eq("city_id", cityId);
  }
  topSpendQuery = topSpendQuery.limit(TOP_CUSTOMERS_AGG_ROW_CAP);

  const topSpendExec = slaFast ? Promise.resolve({ data: [] as Row[], error: null }) : topSpendQuery;
  const [{ data: rawRows, error: selErr, count: listCount }, topSpendRes] = await Promise.all([bookingQuery, topSpendExec]);

  if (selErr) {
    await reportOperationalIssue("error", "api/admin/bookings", selErr.message);
    return NextResponse.json({ error: "Could not load bookings." }, { status: 500 });
  }

  const rows = (rawRows ?? []) as Row[];

  let filtered = rows;
  if (!recurringListScope) {
    if (filter === "follow-up") {
      filtered = rows;
    } else if (filter === "today") {
      filtered = rows.filter((r) => classifyAdminBookingListRow(r, today) === "today");
    } else if (filter === "upcoming") {
      filtered = rows.filter((r) => classifyAdminBookingListRow(r, today) === "upcoming");
    } else if (filter === "completed") {
      filtered = rows.filter((r) => classifyAdminBookingListRow(r, today) === "completed");
    } else if (filter === "sla") {
      const slaM = getDispatchSlaBreachMinutes();
      const nowMs = Date.now();
      const breachRows = rows.filter((r) => rowMatchesAttentionFilter(toOpsSnapshotRow(r), "sla", nowMs, slaM));
      const enrichedSla = breachRows.map((r) => {
        const op = toOpsSnapshotRow(r);
        return {
          ...r,
          slaBreachMinutes: slaBreachOverdueMinutes(op, nowMs, slaM) ?? 0,
        };
      });
      const sorted = sortRowsForAttentionQueue(enrichedSla, "sla", nowMs, slaM);
      const actions = await fetchSlaDispatchLastActions(admin, sorted.map((r) => r.id));
      filtered = sorted.map((r) => {
        const act = actions.get(r.id);
        return {
          ...r,
          dispatchLastAction: act?.displayText ?? "—",
          lastActionMinutesAgo: act?.lastActionMinutesAgo ?? null,
        };
      });
    } else if (filter === "unassigned") {
      const slaM = getDispatchSlaBreachMinutes();
      const nowMs = Date.now();
      filtered = sortRowsForAttentionQueue(
        rows.filter((r) => rowMatchesAttentionFilter(toOpsSnapshotRow(r), "unassigned", nowMs, slaM)),
        "unassigned",
        nowMs,
        slaM,
      );
    } else if (filter === "unassignable") {
      const slaM = getDispatchSlaBreachMinutes();
      const nowMs = Date.now();
      filtered = sortRowsForAttentionQueue(
        rows.filter((r) => rowMatchesAttentionFilter(toOpsSnapshotRow(r), "unassignable", nowMs, slaM)),
        "unassignable",
        nowMs,
        slaM,
      );
    } else if (filter === "starting-soon") {
      const slaM = getDispatchSlaBreachMinutes();
      const nowMs = Date.now();
      filtered = sortRowsForAttentionQueue(
        rows.filter((r) => rowMatchesAttentionFilter(toOpsSnapshotRow(r), "starting-soon", nowMs, slaM)),
        "starting-soon",
        nowMs,
        slaM,
      );
    }
  }

  const zar = (r: Row) =>
    typeof r.total_paid_zar === "number"
      ? r.total_paid_zar
      : Math.round((r.amount_paid_cents ?? 0) / 100);

  const todayRows = rows.filter((r) => classifyAdminBookingListRow(r, today) === "today");
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

  const { data: failedJobs } = slaFast
    ? { data: [] as { id: string; type: string; created_at: string; attempts: number; payload: unknown }[] }
    : await admin
        .from("failed_jobs")
        .select("id, type, created_at, attempts, payload")
        .eq("type", "booking_insert")
        .order("created_at", { ascending: false })
        .limit(50);

  const missingUserIdCount = rows.filter((r) => !bookingCustomerKey(r)).length;

  const totalRevenueZar = rows.reduce((s, r) => s + zar(r), 0);
  const revenuePerCustomerZar =
    distinctCustomers > 0 ? Math.round(totalRevenueZar / distinctCustomers) : 0;

  const spendAggRows =
    !topSpendRes.error && Array.isArray(topSpendRes.data) ? (topSpendRes.data as Row[]) : rows;
  const spendByEmail = new Map<string, { spendZar: number; bookings: number }>();
  for (const r of spendAggRows) {
    const em = normalizeEmail(String(r.customer_email ?? ""));
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
  const topCustomersAggRows = spendAggRows.length;
  const topCustomersAggTruncated =
    !topSpendRes.error && (topSpendRes.data?.length ?? 0) >= TOP_CUSTOMERS_AGG_ROW_CAP;

  const profileRows = slaFast ? [] : (await admin.from("user_profiles").select("tier")).data;
  const demandSupply = slaFast
    ? { demand: 0, supply: 0, multiplier: 1 }
    : await getDemandSupplySnapshotByCity(admin, cityId || null);
  const cityRows = slaFast
    ? []
    : (await admin.from("cities").select("id, name, is_active").order("name", { ascending: true })).data;
  const vipDistribution = { regular: 0, silver: 0, gold: 0, platinum: 0 };
  if (!slaFast) {
    for (const p of profileRows ?? []) {
      const t = typeof p === "object" && p && "tier" in p ? String((p as { tier?: string }).tier ?? "regular") : "regular";
      if (t === "silver") vipDistribution.silver++;
      else if (t === "gold") vipDistribution.gold++;
      else if (t === "platinum") vipDistribution.platinum++;
      else vipDistribution.regular++;
    }
  }

  const paymentLinkChannelStats = slaFast ? aggregatePaymentLinkDeliveryStats([]) : aggregatePaymentLinkDeliveryStats(rows);
  const countQueryForStatus = (status: string | null) =>
    applyAdminBookingDbFilters({
      query: admin.from("bookings").select("id", { count: "exact", head: true }),
      cityId,
      serviceSlug,
      recurringIdFilter,
      recurringListScope,
      bookingStatus: status,
      from,
      to,
      filter,
      opsQuick,
      search,
      today,
      includeBookingStatus: status != null,
    });
  const countResults = paginationRequested
    ? await Promise.all([
        countQueryForStatus(null),
        ...STATUS_COUNT_KEYS.map((status) => countQueryForStatus(status)),
        applyAdminBookingDbFilters({
          query: admin.from("bookings").select("id", { count: "exact", head: true }).eq("date", today).eq("status", "completed"),
          cityId,
          serviceSlug,
          recurringIdFilter,
          recurringListScope,
          bookingStatus: null,
          from: null,
          to: null,
          filter: "all",
          opsQuick: "",
          search,
          today,
          includeBookingStatus: false,
        }),
      ])
    : [];
  const statusCounts = paginationRequested
    ? {
        all: countResults[0]?.count ?? 0,
        ...Object.fromEntries(STATUS_COUNT_KEYS.map((status, index) => [status, countResults[index + 1]?.count ?? 0])),
        completedToday: countResults[STATUS_COUNT_KEYS.length + 1]?.count ?? 0,
      }
    : {
        all: filtered.length,
        ...Object.fromEntries(STATUS_COUNT_KEYS.map((status) => [status, filtered.filter((r) => r.status === status).length])),
        completedToday: filtered.filter((r) => r.status === "completed" && r.date === today).length,
      };
  const { data: attentionRows } = await applyAdminBookingDbFilters({
    query: admin
      .from("bookings")
      .select(OPS_SNAPSHOT_BOOKING_SELECT)
      .not("status", "in", "(completed,cancelled,failed,payment_expired)")
      .limit(3500),
    cityId,
    serviceSlug,
    recurringIdFilter,
    recurringListScope,
    bookingStatus: null,
    from,
    to,
    filter: "all",
    opsQuick: "",
    search,
    today,
    includeBookingStatus: false,
  });
  const attention = computeOpsSnapshotFromRows(
    ((attentionRows ?? []) as Row[]).map((r) => toOpsSnapshotRow(r)),
  );

  const profileUserIds = [...new Set(filtered.map((r) => bookingCustomerKey(r)).filter(Boolean))] as string[];
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
    const customerKey = bookingCustomerKey(r);
    const pr = customerKey ? profileById.get(customerKey) : undefined;
    return {
      ...r,
      customer_billing_type: pr?.billing_type ?? null,
      customer_schedule_type: pr?.schedule_type ?? null,
    };
  });

  if (!recurringListScope) {
    if (opsQuick === "monthly_only") {
      enriched = enriched.filter((r) => (r.customer_billing_type ?? "").toLowerCase() === "monthly");
    } else if (opsQuick === "awaiting_payment") {
      enriched = enriched.filter((r) => (r.status ?? "").toLowerCase() === "pending_payment");
    } else if (opsQuick === "tomorrow") {
      const tomorrowYmd = addDaysYmd(today, 1);
      enriched = enriched.filter((r) => r.date === tomorrowYmd);
    } else if (opsQuick === "today") {
      enriched = enriched.filter((r) => classifyAdminBookingListRow(r, today) === "today");
    }
  }

  const withRoster = await attachTeamAndRosterToBookings(admin, enriched);
  const bookingsPayload = withRoster.map((r) => ({
    ...r,
    dashboardLifecycle: buildDashboardLifecycleAlignmentWire(r as Record<string, unknown>),
  }));
  const totalRows = paginationRequested ? listCount ?? 0 : bookingsPayload.length;
  const totalPages = paginationRequested ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;
  const safePage = paginationRequested ? Math.min(requestedPage, totalPages) : 1;

  return NextResponse.json({
    bookings: bookingsPayload,
    pagination: {
      page: safePage,
      pageSize: paginationRequested ? pageSize : bookingsPayload.length,
      total: totalRows,
      totalPages,
      from: totalRows === 0 ? 0 : rangeFrom + 1,
      to: totalRows === 0 ? 0 : Math.min(rangeFrom + bookingsPayload.length, totalRows),
      hasNextPage: paginationRequested ? requestedPage < totalPages : false,
      hasPreviousPage: paginationRequested ? requestedPage > 1 : false,
    },
    statusCounts,
    attention: {
      unassigned: attention.unassigned,
      slaBreaches: attention.slaBreaches,
      startingSoon: attention.startingSoon,
      unassignable: attention.unassignable,
    },
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
      topCustomersAggRows,
      topCustomersAggTruncated,
    },
    failedJobs: failedJobs ?? [],
    cities: cityRows ?? [],
    selectedCityId: cityId || null,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

const ADMIN_BOOKING_SERVICE_IDS = new Set<string>(["standard", "airbnb", "deep", "move", "carpet"]);

/**
 * Admin: create a booking for an existing customer.
 * `billing_type` in the body (`per_booking` | `monthly` | `payment_already_received`) selects the create path;
 * defaults to the customer profile (`per_booking` | `monthly` only).
 * Monthly → no Paystack; per_booking → Paystack + notifications;
 * payment_already_received → no Paystack; settle off-platform, sync paid invoice, then email receipt.
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

  const equipmentRequired =
    body.equipment_required === true ||
    body.equipment_required === "true" ||
    (typeof body.equipment_required === "string" && body.equipment_required.trim().toLowerCase() === "true");
  const equipmentOverrideReasonRaw =
    typeof body.equipment_fee_override_reason === "string" ? body.equipment_fee_override_reason.trim() : "";
  const equipmentOverrideReason =
    equipmentOverrideReasonRaw.length > 500 ? equipmentOverrideReasonRaw.slice(0, 500) : equipmentOverrideReasonRaw;
  const equipmentLogisticsFeeBody =
    typeof body.equipment_logistics_fee === "number" && Number.isFinite(body.equipment_logistics_fee)
      ? Math.round(body.equipment_logistics_fee)
      : null;
  const equipmentAddress =
    typeof body.equipment_address === "string" ? body.equipment_address.trim() : location;
  const equipmentSuburb =
    typeof body.equipment_suburb === "string" ? body.equipment_suburb.trim() : "Cape Town";
  const equipmentCity =
    typeof body.equipment_city === "string" ? body.equipment_city.trim() : "Cape Town";
  const equipmentPostal =
    typeof body.equipment_postal_code === "string" ? body.equipment_postal_code.trim() : "";

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
      { error: "Invalid service. Use one of: standard, airbnb, deep, move, carpet." },
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

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);

  const selectedCleanerIds = await parseAdminSelectedCleanerIds(body, admin);
  const selectedCleanerId = selectedCleanerIds[0] ?? null;
  const preferredCleanerExtras = adminPreferredCleanerInsertExtras(selectedCleanerIds);

  if (selectedCleanerIds.length > 0 && !ignoreCleanerSlotConflict) {
    for (const cleanerId of selectedCleanerIds) {
      const conflictBookingId = await findCleanerSlotConflict(admin, {
        cleanerId,
        dateYmd: date,
        timeHm,
      });
      if (conflictBookingId) {
        return NextResponse.json(
          {
            error:
              "A selected cleaner already has an active booking (or reserved slot) at this date and time. Open the conflicting row, or submit again with ignore_cleaner_slot_conflict=true after acknowledging the overlap.",
            cleaner_slot_conflict: true,
            conflicting_booking_id: conflictBookingId,
          },
          { status: 409 },
        );
      }
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
      { userId, ownershipColumn, date, timeHm, serviceSlug },
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

  // Repair / read profile. An auth user without a `user_profiles` row (e.g.
  // legacy seed, customer self-signup that bypassed admin create, or split
  // data) used to short-circuit here with `"Select an existing customer."`,
  // even when the admin booking customer search correctly listed them. Now we
  // upsert a default `per_booking` / `on_demand` profile and continue. Existing
  // profiles are returned untouched.
  const profResult = await ensureUserProfileForAuthUser(admin, userId);
  if ("error" in profResult) {
    await reportOperationalIssue("error", "api/admin/bookings POST", profResult.error);
    return bail(NextResponse.json({ error: profResult.error }, { status: 500 }));
  }

  const profileBillingType = String(profResult.billing_type ?? "per_booking").toLowerCase();
  const scheduleType = String(profResult.schedule_type ?? "on_demand").toLowerCase();
  const billingTypeRaw = typeof body.billing_type === "string" ? body.billing_type.trim().toLowerCase() : "";
  const createBillingType =
    billingTypeRaw === "monthly" ||
    billingTypeRaw === "per_booking" ||
    billingTypeRaw === "payment_already_received"
      ? billingTypeRaw
      : profileBillingType === "monthly"
        ? "monthly"
        : "per_booking";

  const settlementMethodRaw =
    typeof body.settlement_method === "string"
      ? body.settlement_method.trim().toLowerCase()
      : typeof body.payment_method === "string"
        ? body.payment_method.trim().toLowerCase()
        : "";
  const settlementReferenceRaw =
    typeof body.settlement_reference === "string"
      ? body.settlement_reference.trim().slice(0, 500)
      : typeof body.payment_reference === "string"
        ? body.payment_reference.trim().slice(0, 500)
        : "";

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user?.email) {
    return bail(NextResponse.json({ error: "Select an existing customer." }, { status: 400 }));
  }
  const customerContact = await readCustomerProfileContact(admin, userId, authUser.user);
  if (!customerContact.bookingEmail) {
    return bail(NextResponse.json({ error: "Customer has no contact email on file." }, { status: 400 }));
  }
  const customerEmail = customerContact.bookingEmail;
  const customerName = customerContact.fullName;
  const customerPhone = customerContact.phone;

  const serviceId: BookingServiceId = parseBookingServiceId(serviceRaw) ?? "standard";
  const paymentLinkTtlHours = Math.max(1, Math.round(adminPaymentLinkTtlMs() / (60 * 60 * 1000)));

  if (createBillingType === "payment_already_received") {
    if (adminMarkCompleted) {
      return bail(
        NextResponse.json(
          {
            error:
              "admin_mark_completed is not supported with payment already received. Create the paid booking, then complete it from booking details if needed.",
            code: "admin_mark_completed_unsupported_for_payment_already_received",
          },
          { status: 400 },
        ),
      );
    }

    if (settlementMethodRaw !== "cash" && settlementMethodRaw !== "zoho" && settlementMethodRaw !== "eft") {
      return bail(
        NextResponse.json(
          {
            error: 'settlement_method must be "cash", "eft", or "zoho" when payment is already received.',
            code: "payment_already_received_method_required",
          },
          { status: 400 },
        ),
      );
    }
    const settlementMethod = settlementMethodRaw as AdminMarkPaidMethod;
    if ((settlementMethod === "eft" || settlementMethod === "zoho") && settlementReferenceRaw.length < 2) {
      return bail(
        NextResponse.json(
          {
            error: "settlement_reference is required for EFT and Zoho / off-platform payments.",
            code: "payment_already_received_reference_required",
          },
          { status: 400 },
        ),
      );
    }

    if (selectedCleanerIds.length > 0 && !ignoreCleanerSlotConflict) {
      for (const cleanerId of selectedCleanerIds) {
        const lateConflictPaid = await findCleanerSlotConflict(admin, {
          cleanerId,
          dateYmd: date,
          timeHm,
        });
        if (lateConflictPaid) {
          return bail(
            NextResponse.json(
              {
                error:
                  "Another booking took a selected cleaner for this slot while you were submitting. Try again, or acknowledge the overlap.",
                cleaner_slot_conflict: true,
                conflicting_booking_id: lateConflictPaid,
              },
              { status: 409 },
            ),
          );
        }
      }
    }

    let equipmentPatchPaid: Record<string, unknown> = {};
    if (serviceRaw === "standard" && typeof body.equipment_required === "boolean") {
      if (equipmentRequired) {
        const equipConfig = await loadEquipmentPricingConfig();
        let quote = await quoteEquipmentForAddress({
          config: equipConfig,
          address: equipmentAddress,
          suburb: equipmentSuburb,
          city: equipmentCity,
          postalCode: equipmentPostal,
          equipmentRequired: true,
        });
        if (
          equipmentLogisticsFeeBody != null &&
          equipmentLogisticsFeeBody !== quote.logistics_fee &&
          equipmentOverrideReason.length < 3
        ) {
          return bail(
            NextResponse.json(
              { error: "equipment_fee_override_reason is required when overriding the equipment fee." },
              { status: 400 },
            ),
          );
        }
        if (equipmentLogisticsFeeBody != null && equipmentLogisticsFeeBody !== quote.logistics_fee) {
          quote = { ...quote, logistics_fee: equipmentLogisticsFeeBody };
        }
        equipmentPatchPaid = equipmentPersistFields({
          equipmentRequired: true,
          quote,
          pricingSnapshot: buildEquipmentPricingSnapshot({ config: equipConfig, quote }),
          overrideReason: equipmentOverrideReason || null,
        });
      } else {
        equipmentPatchPaid = equipmentPersistFields({
          equipmentRequired: false,
          quote: null,
          pricingSnapshot: null,
        });
      }
    }

    const paystackReferencePaid = `adm_ar_${crypto.randomUUID()}`;
    const assignedAtIsoPaid = selectedCleanerId ? new Date().toISOString() : null;
    const rowStatusPaid: "assigned" | "pending" = selectedCleanerId ? "assigned" : "pending";
    const uncollected = bookingUncollectedCashColumns();

    const insPaid = await insertBookingRowUnified(admin, {
      source: "admin_payment_already_received",
      rowBase: {
        paystack_reference: paystackReferencePaid,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
        ...bookingCustomerOwnershipPatch(userId, ownershipColumn),
        ...uncollected,
        currency: "ZAR",
        service_slug: serviceSlug,
        status: rowStatusPaid,
        dispatch_status: selectedCleanerId ? "assigned" : "searching",
        surge_multiplier: 1,
        surge_reason: null,
        service: getServiceLabel(serviceId),
        location,
        location_id: null,
        city_id: null,
        date,
        time: timeHm,
        total_price: totalPaidZar,
        pricing_version_id: null,
        price_breakdown: null,
        created_by_admin: true,
        created_by: auth.userId,
        booking_source: "admin",
        created_by_admin_id: auth.userId,
        ...equipmentPatchPaid,
        ...preferredCleanerExtras.rowExtras,
        ...(selectedCleanerId
          ? {
              selected_cleaner_id: selectedCleanerId,
              assignment_type: "user_selected",
              cleaner_id: selectedCleanerId,
              cleaner_response_status: CLEANER_RESPONSE.PENDING,
              ...(assignedAtIsoPaid ? { assigned_at: assignedAtIsoPaid } : {}),
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
        is_monthly_billing_booking: false,
        payment_status: "pending",
        billing_type: "per_booking",
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
        payment_already_received: true,
        ...preferredCleanerExtras.snapshotExtension,
        ...(ignoreCleanerSlotConflict && cleanerSlotOverrideReasonForDb
          ? { cleaner_slot_override_reason: cleanerSlotOverrideReasonForDb }
          : {}),
      },
      select: "id, created_at",
      logInsert: false,
      lineItemsPricing: {
        mode: "monthly_bundled_zar",
        quotedTotalZar: totalPaidZar,
        bundleLabel: "Admin booking (payment already received)",
      },
    });

    const paidRow = insPaid.ok ? insPaid.row : null;
    if (!insPaid.ok || !paidRow || typeof (paidRow as { id?: string }).id !== "string") {
      const pgCode = insPaid.ok ? undefined : insPaid.pgCode;
      const msg = insPaid.ok ? "" : insPaid.error;
      if (
        pgCode === "23505" ||
        /duplicate key|unique constraint|idx_bookings_unique_active_customer_slot/i.test(msg)
      ) {
        const { data: dupExisting } = await applyActiveAdminBookingSlotFilters(
          admin.from("bookings").select("id, created_at"),
          { userId, ownershipColumn, date, timeHm, serviceSlug },
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
          { error: !insPaid.ok ? insPaid.error : "Could not create booking." },
          { status: 500 },
        ),
      );
    }

    const newPaidBookingId = (paidRow as { id: string }).id;

    await runAdminBookingPostCreateNormalizationAndEarnings(
      admin,
      newPaidBookingId,
      "admin_booking_create_payment_already_received",
    );
    // Immediately paid/active — sync booking_cleaners like monthly create (not snapshot-only).
    const rosterSync = await syncAdminPreferredCleanerRoster(
      admin,
      newPaidBookingId,
      selectedCleanerIds,
      "admin_payment_already_received",
    );
    if (!rosterSync.ok) {
      void logSystemEvent({
        level: "error",
        source: "admin_booking_create",
        message: "admin_payment_already_received_roster_sync_failed",
        context: {
          bookingId: newPaidBookingId,
          error: rosterSync.error,
          kind: rosterSync.kind,
          cleanerCount: rosterSync.cleanerCount,
        },
      });
    }

    const settled = await settleAdminBookingPaymentAlreadyReceived(admin, {
      bookingId: newPaidBookingId,
      adminUserId: auth.userId,
      method: settlementMethod,
      reference: settlementReferenceRaw.length > 0 ? settlementReferenceRaw : null,
      amountCents: amountPaidCents,
      customerEmail,
    });

    if (!settled.ok) {
      void logSystemEvent({
        level: "error",
        source: "admin_booking_create",
        message: "admin_payment_already_received_settle_failed",
        context: {
          bookingId: newPaidBookingId,
          error: settled.error,
          code: settled.code ?? null,
          method: settlementMethod,
        },
      });
      // Booking row exists; finalize idempotency with the failure payload so retries
      // replay the same booking id instead of creating another unpaid/paid row.
      const failBody: Record<string, unknown> = {
        ok: false,
        error: settled.error,
        code: settled.code ?? "payment_already_received_settle_failed",
        bookingId: newPaidBookingId,
        mode: "payment_already_received",
      };
      if (claimId) await finalizeAdminBookingCreateIdempotency(admin, claimId, settled.httpStatus, failBody);
      invalidateCleanerAvailabilityCache(date, timeHm);
      return NextResponse.json(failBody, { status: settled.httpStatus });
    }

    void logSystemEvent({
      level: "info",
      source: "admin_booking_create",
      message: "admin_payment_already_received_booking_created",
      context: {
        bookingId: newPaidBookingId,
        userId,
        admin_id: auth.userId,
        method: settlementMethod,
        amount_cents: settled.settlement.amount_cents,
        receipt_email_sent: settled.receipt_email_sent,
        invoice_kind: settled.invoice.kind,
      },
    });

    const paidBody: Record<string, unknown> = {
      ok: true,
      mode: "payment_already_received",
      message: settled.receipt_email_sent
        ? settled.paid_invoice_included
          ? "Booking created, payment recorded, paid invoice emailed"
          : "Booking created, payment recorded, payment confirmation receipt emailed"
        : "Booking created and payment recorded (payment confirmation receipt could not be sent)",
      bookingId: newPaidBookingId,
      amount_paid_cents: settled.settlement.amount_cents,
      settlement: {
        method: settled.settlement.method,
        payment_reference_external: settled.settlement.payment_reference_external,
        settlement_marker: settled.settlement.settlement_marker,
      },
      invoice: settled.invoice,
      paid_confirmed: settled.paid_confirmed,
      zero_balance_confirmed: settled.zero_balance_confirmed,
      receipt_email_sent: settled.receipt_email_sent,
      paid_invoice_included: settled.paid_invoice_included,
      receipt_kind: settled.receipt_kind,
      notification: settled.notification,
      ...(settled.receipt_email_skipped_reason
        ? { receipt_email_skipped_reason: settled.receipt_email_skipped_reason }
        : {}),
      authorizationUrl: null,
      payment_link: null,
    };
    if (claimId) await finalizeAdminBookingCreateIdempotency(admin, claimId, 200, paidBody);
    invalidateCleanerAvailabilityCache(date, timeHm);
    return NextResponse.json(paidBody);
  }

  if (createBillingType === "monthly") {
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

    const teamIdRaw = typeof body.team_id === "string" ? body.team_id.trim() : "";
    const isTeamJobFlag =
      body.is_team_job === true ||
      body.is_team_job === "true" ||
      (typeof body.is_team_job === "string" && body.is_team_job.trim().toLowerCase() === "true");

    let validatedMonthlyTeamId: string | null = null;
    if (isTeamJobFlag && teamIdRaw && /^[0-9a-f-]{36}$/i.test(teamIdRaw)) {
      const { data: tRow } = await admin.from("teams").select("id, is_active").eq("id", teamIdRaw).maybeSingle();
      if (
        tRow &&
        typeof (tRow as { id?: unknown }).id === "string" &&
        (tRow as { is_active?: boolean | null }).is_active !== false
      ) {
        validatedMonthlyTeamId = teamIdRaw;
      }
    }

    if (adminMarkCompleted) {
      const assigneeGate = validateAdminMonthlyCompletedAssignee({
        selectedCleanerId,
        isTeamJobFlag,
        validatedTeamId: validatedMonthlyTeamId,
      });
      if (!assigneeGate.ok) {
        return bail(
          NextResponse.json({ error: assigneeGate.message, code: assigneeGate.code }, { status: 400 }),
        );
      }
      if (
        !selectedCleanerId &&
        isTeamJobFlag &&
        teamIdRaw &&
        /^[0-9a-f-]{36}$/i.test(teamIdRaw) &&
        !validatedMonthlyTeamId
      ) {
        return bail(
          NextResponse.json(
            {
              error: "team_id must reference an existing active team.",
              code: "admin_monthly_completed_invalid_team",
            },
            { status: 400 },
          ),
        );
      }
    }

    let monthlyTeamPayoutOwnerId: string | null = null;
    if (adminMarkCompleted && validatedMonthlyTeamId && !selectedCleanerId) {
      const { data: mems, error: memErr } = await admin
        .from("team_members")
        .select("cleaner_id")
        .eq("team_id", validatedMonthlyTeamId)
        .not("cleaner_id", "is", null)
        .order("cleaner_id", { ascending: true })
        .limit(1);
      if (memErr || !mems?.length) {
        return bail(
          NextResponse.json(
            {
              error: "Team has no roster cleaners; cannot mark completed without a payout owner.",
              code: "admin_monthly_team_no_members",
            },
            { status: 400 },
          ),
        );
      }
      const cid = String((mems[0] as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
      if (!cid) {
        return bail(
          NextResponse.json(
            {
              error: "Team has no roster cleaners; cannot mark completed without a payout owner.",
              code: "admin_monthly_team_no_members",
            },
            { status: 400 },
          ),
        );
      }
      monthlyTeamPayoutOwnerId = cid;
    }

    const paystackReference = `adm_mi_${crypto.randomUUID()}`;
    const completedAtIso = adminMarkCompleted ? new Date().toISOString() : null;

    const preliminaryDispatch = adminMarkCompleted
      ? "assigned"
      : selectedCleanerId
        ? "assigned"
        : "searching";

    const completionCoherencePatch =
      adminMarkCompleted && completedAtIso
        ? buildCompletionCoherencePatch({
            beforeCompletedAt: null,
            beforeDispatchStatus: preliminaryDispatch,
            fillCompletedAtIfMissing: true,
            nowIso: completedAtIso,
          }).patch
        : {};

    const assignedAtIso =
      selectedCleanerId || (adminMarkCompleted && validatedMonthlyTeamId && !selectedCleanerId)
        ? new Date().toISOString()
        : null;

    let rowStatus: "completed" | "assigned" | "pending" = adminMarkCompleted
      ? "completed"
      : selectedCleanerId
        ? "assigned"
        : "pending";
    if (selectedCleanerId && !adminMarkCompleted && rowStatus === "pending") {
      rowStatus = "assigned";
    }

    let equipmentPatch: Record<string, unknown> = {};
    if (serviceRaw === "standard" && typeof body.equipment_required === "boolean") {
      if (equipmentRequired) {
        const equipConfig = await loadEquipmentPricingConfig();
        let quote = await quoteEquipmentForAddress({
          config: equipConfig,
          address: equipmentAddress,
          suburb: equipmentSuburb,
          city: equipmentCity,
          postalCode: equipmentPostal,
          equipmentRequired: true,
        });
        if (
          equipmentLogisticsFeeBody != null &&
          equipmentLogisticsFeeBody !== quote.logistics_fee &&
          equipmentOverrideReason.length < 3
        ) {
          return NextResponse.json(
            { error: "equipment_fee_override_reason is required when overriding the equipment fee." },
            { status: 400 },
          );
        }
        if (equipmentLogisticsFeeBody != null && equipmentLogisticsFeeBody !== quote.logistics_fee) {
          quote = { ...quote, logistics_fee: equipmentLogisticsFeeBody };
        }
        equipmentPatch = equipmentPersistFields({
          equipmentRequired: true,
          quote,
          pricingSnapshot: buildEquipmentPricingSnapshot({ config: equipConfig, quote }),
          overrideReason: equipmentOverrideReason || null,
        });
      } else {
        equipmentPatch = equipmentPersistFields({
          equipmentRequired: false,
          quote: null,
          pricingSnapshot: null,
        });
      }
    }

    // created_at is DB default (now); omit from insert so clustering stays deterministic.
    const ins = await insertBookingRowUnified(admin, {
      source: "admin_monthly",
      rowBase: {
        paystack_reference: paystackReference,
        customer_email: customerEmail,
        customer_name: customerName,
        customer_phone: customerPhone,
        ...bookingCustomerOwnershipPatch(userId, ownershipColumn),
        amount_paid_cents: amountPaidCents,
        currency: "ZAR",
        service_slug: serviceSlug,
        status: rowStatus,
        dispatch_status: preliminaryDispatch,
        ...completionCoherencePatch,
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
        ...equipmentPatch,
        ...preferredCleanerExtras.rowExtras,
        ...(selectedCleanerId
          ? {
              selected_cleaner_id: selectedCleanerId,
              assignment_type: "user_selected",
              cleaner_id: selectedCleanerId,
              cleaner_response_status: CLEANER_RESPONSE.PENDING,
              ...(assignedAtIso ? { assigned_at: assignedAtIso } : {}),
            }
          : {}),
        ...(validatedMonthlyTeamId && !selectedCleanerId && adminMarkCompleted && monthlyTeamPayoutOwnerId
          ? {
              is_team_job: true,
              team_id: validatedMonthlyTeamId,
              payout_owner_cleaner_id: monthlyTeamPayoutOwnerId,
              cleaner_response_status: CLEANER_RESPONSE.COMPLETED,
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
        is_monthly_billing_booking: true,
        payment_status: "pending_monthly",
        billing_type: "recurring_invoice",
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
        ...preferredCleanerExtras.snapshotExtension,
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
          { userId, ownershipColumn, date, timeHm, serviceSlug },
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
        { userId, ownershipColumn, date, timeHm, serviceSlug },
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
    await syncAdminPreferredCleanerRoster(admin, newBookingId, selectedCleanerIds);

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

  if (createBillingType !== "per_booking") {
    return bail(NextResponse.json({ error: "Unsupported billing_type for this booking." }, { status: 400 }));
  }

  // Per-booking / Paystack: intentionally no post-insert race cleanup; rely on idempotency + duplicate pre-check.
  // If duplicates slip through after payment, reconcile Paystack before deleting rows.

  /**
   * Paystack per-booking creates a `pending_payment` row with `amount_paid_cents=0` and
   * `payment_completed_at=null`. Forcing `status='completed'` here would (a) break the
   * `bookings_paid_*` invariants once `payment_status='success'` is later written, and (b)
   * cause the Paystack webhook / verify to skip-finalize because `upsertBookingFromPaystack`
   * filters `status='pending_payment'`. Off-platform mark-paid uses {@link adminMarkBookingPaid}.
   */
  if (adminMarkCompleted) {
    return bail(
      NextResponse.json(
        {
          error:
            "Cannot mark a Paystack payment-link booking as completed before payment is confirmed. Use the Mark Paid action after payment, or create the booking without admin_mark_completed.",
          code: "admin_mark_completed_unsafe_for_payment_link",
        },
        { status: 400 },
      ),
    );
  }

  if (selectedCleanerIds.length > 0 && !ignoreCleanerSlotConflict) {
    for (const cleanerId of selectedCleanerIds) {
      const lateConflictPaystack = await findCleanerSlotConflict(admin, {
        cleanerId,
        dateYmd: date,
        timeHm,
      });
      if (lateConflictPaystack) {
        return bail(
          NextResponse.json(
            {
              error:
                "Another booking took a selected cleaner for this slot while you were submitting. Try again, or acknowledge the overlap.",
              cleaner_slot_conflict: true,
              conflicting_booking_id: lateConflictPaystack,
            },
            { status: 409 },
          ),
        );
      }
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
    ...(selectedCleanerIds.length > 0
      ? { cleanerId: selectedCleanerIds[0], selected_cleaner_ids: selectedCleanerIds }
      : {}),
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
        { userId, ownershipColumn, date, timeHm, serviceSlug },
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
  // M-1: this branch is reachable only when adminMarkCompleted is false —
  // the guard at `admin_mark_completed_unsafe_for_payment_link` (above)
  // hard-rejects per-booking creates that pass the flag BEFORE we ever
  // call `processPaystackInitializeBody`. A previously-present completion
  // shortcut lived here and was statically unreachable; it has been
  // removed because it would bypass the protected completion path
  // (off-platform settle via `adminMarkBookingPaid`, or the customer-paid
  // → Paystack webhook completion funnel) if the upstream guard ever
  // regressed. Off-platform completion for per-booking Paystack rows
  // MUST go through `adminMarkBookingPaid`.
  if (createdPaystackBookingId) {
    await runAdminBookingPostCreateNormalizationAndEarnings(
      admin,
      createdPaystackBookingId,
      "admin_booking_create_per_booking",
    );
    await patchAdminPerBookingPreferredCleaners(admin, createdPaystackBookingId, selectedCleanerIds);
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
