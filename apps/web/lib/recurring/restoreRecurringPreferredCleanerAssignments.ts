import "server-only";

import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";
import { fetchLastAssignedCleanerForRecurringPlan } from "@/lib/recurring/fetchLastAssignedCleanerForRecurringPlan";
import { applyRecurringOccurrenceRosterContinuity } from "@/lib/recurring/applyRecurringOccurrenceRosterContinuity";
import {
  recurringOccurrenceCleanerPatch,
  recurringPropagateCleanerOperationalStatus,
  resolveRecurringPreferredCleanerId,
} from "@/lib/recurring/resolveRecurringPreferredCleanerId";
import type { SupabaseClient } from "@supabase/supabase-js";

const TERMINAL_STATUSES = ["completed", "cancelled", "failed", "payment_expired", "pending_payment"] as const;

type StuckRow = {
  id: string;
  recurring_id: string | null;
  selected_cleaner_id: string | null;
  customer_name: string | null;
  status: string | null;
  date: string | null;
  booking_snapshot: unknown;
};

export type RestoreRecurringAssignmentsResult = {
  updated: number;
  skipped: number;
  plansUpdated: number;
  rostersApplied: number;
  remaining: number;
};

async function resolveCleanerForStuckRow(
  admin: SupabaseClient,
  row: StuckRow,
  planCache: Map<string, { preferred_cleaner_id: string | null; booking_snapshot_template: unknown }>,
): Promise<string | null> {
  const fromSelected = normalizeUuidCandidate(row.selected_cleaner_id);
  if (fromSelected) return fromSelected;

  const planId = row.recurring_id?.trim();
  if (!planId) return null;

  let plan = planCache.get(planId);
  if (!plan) {
    const { data } = await admin
      .from("recurring_bookings")
      .select("preferred_cleaner_id, booking_snapshot_template")
      .eq("id", planId)
      .maybeSingle();
    plan = {
      preferred_cleaner_id:
        data && typeof data === "object" && "preferred_cleaner_id" in data
          ? ((data as { preferred_cleaner_id?: string | null }).preferred_cleaner_id ?? null)
          : null,
      booking_snapshot_template:
        data && typeof data === "object" && "booking_snapshot_template" in data
          ? (data as { booking_snapshot_template?: unknown }).booking_snapshot_template
          : null,
    };
    planCache.set(planId, plan);
  }

  const lastAssignedCleanerId = await fetchLastAssignedCleanerForRecurringPlan(admin, planId);
  return resolveRecurringPreferredCleanerId({
    recurringPreferredCleanerId: plan.preferred_cleaner_id,
    lastAssignedCleanerId,
    snapshotTemplate:
      plan.booking_snapshot_template && typeof plan.booking_snapshot_template === "object"
        ? (plan.booking_snapshot_template as Parameters<typeof resolveRecurringPreferredCleanerId>[0]["snapshotTemplate"])
        : null,
  });
}

/**
 * Promotes stuck recurring occurrences to `assigned` using continuity cleaner resolution
 * (selected_cleaner_id → plan preferred → last assigned occurrence → snapshot).
 */
export async function restoreRecurringPreferredCleanerAssignments(
  admin: SupabaseClient,
  options?: { fromDate?: string | null; toDate?: string | null },
): Promise<RestoreRecurringAssignmentsResult> {
  let query = admin
    .from("bookings")
    .select("id, recurring_id, selected_cleaner_id, customer_name, status, date, booking_snapshot")
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .is("team_id", null)
    .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);

  const fromDate = options?.fromDate?.trim();
  const toDate = options?.toDate?.trim();
  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) query = query.gte("date", fromDate);
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) query = query.lte("date", toDate);

  const { data: stuckRows, error } = await query.limit(5000);
  if (error) throw new Error(error.message);

  let updated = 0;
  let skipped = 0;
  let rostersApplied = 0;
  const planCleaner = new Map<string, string>();
  const planCache = new Map<string, { preferred_cleaner_id: string | null; booking_snapshot_template: unknown }>();

  for (const raw of stuckRows ?? []) {
    const row = raw as StuckRow;
    const cleanerId = await resolveCleanerForStuckRow(admin, row, planCache);
    if (!cleanerId) {
      skipped++;
      continue;
    }

    const patch = recurringOccurrenceCleanerPatch(cleanerId, {
      operationalStatus: recurringPropagateCleanerOperationalStatus(row.status),
    });
    const { error: updateErr } = await admin.from("bookings").update(patch).eq("id", row.id);
    if (updateErr) {
      skipped++;
      continue;
    }
    updated++;

    if (row.recurring_id) {
      const rosterResult = await applyRecurringOccurrenceRosterContinuity(admin, {
        bookingId: row.id,
        recurringId: row.recurring_id,
        leadCleanerId: cleanerId,
      });
      if (rosterResult.applied) rostersApplied++;
    }

    if (row.recurring_id && !planCleaner.has(row.recurring_id)) {
      planCleaner.set(row.recurring_id, cleanerId);
    }
  }

  let plansUpdated = 0;
  for (const [planId, cleanerId] of planCleaner) {
    const { error: planErr } = await admin
      .from("recurring_bookings")
      .update({ preferred_cleaner_id: cleanerId })
      .eq("id", planId)
      .is("preferred_cleaner_id", null);
    if (!planErr) plansUpdated++;
  }

  let remainingQuery = admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("is_recurring_generated", true)
    .is("cleaner_id", null)
    .is("team_id", null)
    .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`);
  if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) remainingQuery = remainingQuery.gte("date", fromDate);
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) remainingQuery = remainingQuery.lte("date", toDate);
  const { count: remaining } = await remainingQuery;

  return { updated, skipped, plansUpdated, rostersApplied, remaining: remaining ?? 0 };
}
