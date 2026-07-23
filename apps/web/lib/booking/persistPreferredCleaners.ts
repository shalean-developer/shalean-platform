import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_MAX_PREFERRED_CLEANERS } from "@/lib/admin/adminPreferredCleanerLimits";
import {
  validateMembersToReplaceBookingCleanersRpcRows,
  type ReplaceBookingCleanersRpcRow,
} from "@/lib/admin/bookingRosterReplacePayload";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalize, dedupe, and cap preferred cleaner UUIDs. */
export function normalizePreferredCleanerIds(raw: readonly string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw ?? []) {
    const t = String(item ?? "").trim().toLowerCase();
    if (!UUID_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= ADMIN_MAX_PREFERRED_CLEANERS) break;
  }
  return out;
}

/** Read preferred cleaner ids from a booking snapshot + optional lead column fallback. */
export function preferredCleanerIdsFromSnapshot(
  snap: unknown,
  selectedCleanerId?: string | null,
): string[] {
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const rec = snap as Record<string, unknown>;
    const ids = rec.selectedCleanerIds;
    if (Array.isArray(ids)) {
      const normalized = normalizePreferredCleanerIds(ids.filter((x): x is string => typeof x === "string"));
      if (normalized.length > 0) return normalized;
    }
  }
  return normalizePreferredCleanerIds(selectedCleanerId ? [selectedCleanerId] : []);
}

/** Extra DB + snapshot fields when creating a booking with preferred cleaners. */
export function preferredCleanerInsertExtras(selectedCleanerIds: readonly string[]): {
  snapshotExtension: Record<string, unknown>;
  rowExtras: Record<string, unknown>;
} {
  if (selectedCleanerIds.length === 0) {
    return { snapshotExtension: {}, rowExtras: {} };
  }
  return {
    snapshotExtension: { selectedCleanerIds: [...selectedCleanerIds] },
    rowExtras: selectedCleanerIds.length > 1 ? { cleaner_count: selectedCleanerIds.length } : {},
  };
}

/** Booking row patch for user-selected cleaner preference (lead = first). */
export function preferredCleanerAssignmentFields(
  selectedCleanerIds: readonly string[],
): Record<string, unknown> {
  const lead = selectedCleanerIds[0] ?? null;
  if (!lead) return {};
  return {
    selected_cleaner_id: lead,
    assignment_type: "user_selected",
    ...(selectedCleanerIds.length > 1 ? { cleaner_count: selectedCleanerIds.length } : {}),
  };
}

/**
 * Build `booking_cleaners` roster when 2+ preferred cleaners were chosen.
 * Safe to call after payment or on admin monthly / payment-already-received create
 * (not on `pending_payment` per-booking).
 */
export type SyncPreferredCleanerRosterResult =
  | { ok: true; kind: "synced"; cleanerCount: number; rows: ReplaceBookingCleanersRpcRow[] }
  | { ok: true; kind: "skipped_single_or_empty"; cleanerCount: number }
  | { ok: false; kind: "validation_failed"; error: string; cleanerCount: number }
  | { ok: false; kind: "rpc_failed"; error: string; cleanerCount: number };

export async function syncPreferredCleanerRoster(
  admin: SupabaseClient,
  bookingId: string,
  selectedCleanerIds: readonly string[],
  source = "customer_preferred",
): Promise<SyncPreferredCleanerRosterResult> {
  const ids = normalizePreferredCleanerIds(selectedCleanerIds);
  if (ids.length < 2) {
    return { ok: true, kind: "skipped_single_or_empty", cleanerCount: ids.length };
  }

  const rosterValidated = validateMembersToReplaceBookingCleanersRpcRows(
    ids.map((id, i) => ({ cleanerId: id, role: i === 0 ? "lead" : "member" })),
    { defaultSource: source },
  );
  if (!rosterValidated.ok) {
    return {
      ok: false,
      kind: "validation_failed",
      error: rosterValidated.error,
      cleanerCount: ids.length,
    };
  }

  const { error } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
    p_booking_id: bookingId,
    p_rows: rosterValidated.rows,
  });
  if (error) {
    return {
      ok: false,
      kind: "rpc_failed",
      error: error.message ?? String(error),
      cleanerCount: ids.length,
    };
  }

  return {
    ok: true,
    kind: "synced",
    cleanerCount: ids.length,
    rows: rosterValidated.rows,
  };
}

/** Merge multi-cleaner preference into `booking_snapshot` (per-booking pending path). */
export async function patchBookingPreferredCleanersSnapshot(
  admin: SupabaseClient,
  bookingId: string,
  selectedCleanerIds: readonly string[],
): Promise<void> {
  if (selectedCleanerIds.length === 0) return;

  const { data: row } = await admin.from("bookings").select("booking_snapshot").eq("id", bookingId).maybeSingle();
  const existing =
    row &&
    typeof row === "object" &&
    "booking_snapshot" in row &&
    row.booking_snapshot &&
    typeof row.booking_snapshot === "object" &&
    !Array.isArray(row.booking_snapshot)
      ? (row.booking_snapshot as Record<string, unknown>)
      : {};

  const patch: Record<string, unknown> = {
    booking_snapshot: { ...existing, selectedCleanerIds: [...selectedCleanerIds] },
  };
  if (selectedCleanerIds.length > 1) {
    patch.cleaner_count = selectedCleanerIds.length;
  }

  await admin.from("bookings").update(patch).eq("id", bookingId);
}

/** After payment finalize: roster from snapshot / row when customer picked 2+ cleaners. */
export async function syncPreferredCleanerRosterFromBookingRow(
  admin: SupabaseClient,
  bookingId: string,
  row: { booking_snapshot?: unknown; selected_cleaner_id?: string | null },
  source = "checkout_preferred",
): Promise<SyncPreferredCleanerRosterResult> {
  const ids = preferredCleanerIdsFromSnapshot(row.booking_snapshot, row.selected_cleaner_id);
  return syncPreferredCleanerRoster(admin, bookingId, ids, source);
}
