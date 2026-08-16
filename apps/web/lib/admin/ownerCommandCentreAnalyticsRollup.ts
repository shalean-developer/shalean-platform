import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeOfficeAnalyticsSummary,
  extractPriorCustomerIds,
  officeAnalyticsFetchStartIso,
  priorCustomerQueryEndIso,
  type OfficeAnalyticsBookingRow,
  type OfficeAnalyticsWindow,
} from "@/lib/admin/officeAnalytics";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";

const ANALYTICS_BOOKING_SELECT = "id, created_at, updated_at, status, payment_status, payment_completed_at, total_paid_zar, amount_paid_cents, refunded_at, refund_status, billing_type, is_monthly_billing_booking, monthly_invoice_id, service, service_slug, customer_id, is_recurring_generated";
const OWNER_ANALYTICS_FALLBACK_LIMIT = 15_000;
const PRIOR_CUSTOMER_FALLBACK_LIMIT = 20_000;

type ServicePair = {
  service?: string | null;
  service_slug?: string | null;
  count?: number | string | null;
};

type RollupRow = {
  total_bookings?: number | string | null;
  total_revenue_zar?: number | string | null;
  distinct_customers?: number | string | null;
  returning_customers?: number | string | null;
  service_pairs?: ServicePair[] | null;
};

export type OwnerCommandCentreAnalyticsRollup = {
  retentionPct: number | null;
  totalBookingsWindow: number;
  avgBookingValueZar: number;
  bookingServices: Array<{ label: string; count: number; revenueZar: null }>;
};

function numberValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingRpcError(
  error: { code?: string | null; message?: string | null } | null,
  functionName: string,
): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return new RegExp(`could not find the function|function .*${functionName}.* does not exist`, "i").test(
    error.message ?? "",
  );
}

function serviceRowsFromPairs(pairs: ServicePair[]): OwnerCommandCentreAnalyticsRollup["bookingServices"] {
  const byLabel = new Map<string, number>();
  for (const pair of pairs) {
    const count = Math.max(0, Math.trunc(numberValue(pair.count)));
    if (count === 0) continue;
    const label =
      serviceLabelFromBookingRow({
        service: pair.service ?? null,
        service_slug: pair.service_slug ?? null,
      }) ?? "Other";
    byLabel.set(label, (byLabel.get(label) ?? 0) + count);
  }
  return [...byLabel.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([label, count]) => ({ label, count, revenueZar: null }));
}

async function loadPriorCustomerIds(admin: SupabaseClient, priorEndIso: string): Promise<Set<string>> {
  const rpcRes = await admin.rpc("owner_prior_customer_ids", { p_before: priorEndIso });
  if (!rpcRes.error) {
    const row = (rpcRes.data?.[0] ?? null) as { customer_ids?: string[] | null } | null;
    return new Set(
      (row?.customer_ids ?? []).filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
  }
  if (!isMissingRpcError(rpcRes.error, "owner_prior_customer_ids")) {
    throw new Error(rpcRes.error.message);
  }

  const fallback = await admin
    .from("bookings")
    .select("customer_id, payment_status, payment_completed_at")
    .eq("payment_status", "success")
    .not("payment_completed_at", "is", null)
    .not("customer_id", "is", null)
    .lt("payment_completed_at", priorEndIso)
    .limit(PRIOR_CUSTOMER_FALLBACK_LIMIT);
  if (fallback.error) throw new Error(fallback.error.message);
  return new Set(extractPriorCustomerIds(fallback.data ?? []));
}

async function loadFallback(
  admin: SupabaseClient,
  window: OfficeAnalyticsWindow,
  now: Date,
): Promise<OwnerCommandCentreAnalyticsRollup> {
  const sinceIso = officeAnalyticsFetchStartIso(window);
  const priorEndIso = priorCustomerQueryEndIso(window);
  const [bookingsRes, priorCustomerIds] = await Promise.all([
    admin
      .from("bookings")
      .select(ANALYTICS_BOOKING_SELECT)
      .or(`created_at.gte.${sinceIso},payment_completed_at.gte.${sinceIso}`)
      .order("created_at", { ascending: false })
      .limit(OWNER_ANALYTICS_FALLBACK_LIMIT),
    loadPriorCustomerIds(admin, priorEndIso),
  ]);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  const analytics = computeOfficeAnalyticsSummary(
    (bookingsRes.data ?? []) as OfficeAnalyticsBookingRow[],
    priorCustomerIds,
    now,
    window,
  );
  return {
    retentionPct: analytics.kpis.customerRetentionPct,
    totalBookingsWindow: analytics.kpis.totalBookings,
    avgBookingValueZar: analytics.kpis.avgBookingValueZar,
    bookingServices: analytics.servicePopularity
      .slice(0, 8)
      .map((row) => ({ label: row.name, count: row.count, revenueZar: null })),
  };
}

export async function loadOwnerCommandCentreAnalyticsRollup(
  admin: SupabaseClient,
  window: OfficeAnalyticsWindow,
  now: Date,
): Promise<OwnerCommandCentreAnalyticsRollup> {
  const rpcRes = await admin.rpc("owner_command_centre_analytics_rollup", {
    p_start: new Date(window.startMs).toISOString(),
    p_end: new Date(window.endMs).toISOString(),
  });

  if (rpcRes.error) {
    // Additive migration rollout safety only. Operational failures must not trigger the 15k-row read.
    if (!isMissingRpcError(rpcRes.error, "owner_command_centre_analytics_rollup")) {
      throw new Error(rpcRes.error.message);
    }
    return loadFallback(admin, window, now);
  }

  const row = (rpcRes.data?.[0] ?? {}) as RollupRow;
  const totalBookingsWindow = Math.max(0, Math.trunc(numberValue(row.total_bookings)));
  const totalRevenueZar = numberValue(row.total_revenue_zar);
  const distinctCustomers = Math.max(0, Math.trunc(numberValue(row.distinct_customers)));
  const returningCustomers = Math.max(0, Math.trunc(numberValue(row.returning_customers)));

  return {
    retentionPct:
      distinctCustomers > 0
        ? Math.round((returningCustomers / distinctCustomers) * 1000) / 10
        : null,
    totalBookingsWindow,
    avgBookingValueZar:
      totalBookingsWindow > 0 ? Math.round(totalRevenueZar / totalBookingsWindow) : 0,
    bookingServices: serviceRowsFromPairs(row.service_pairs ?? []),
  };
}
