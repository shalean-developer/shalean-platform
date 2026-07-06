import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_MAX_PREFERRED_CLEANERS } from "@/lib/admin/adminPreferredCleanerLimits";
import { normalizeUuidCandidate } from "@/lib/booking/userSelectedCleanerFromSnapshot";
import { normalizePreferredCleanerIds, preferredCleanerIdsFromSnapshot } from "@/lib/booking/persistPreferredCleaners";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

export type PreferredCleanerParseResult =
  | { ok: true; value: string | null | undefined }
  | { ok: false; error: string };

/**
 * Parse `preferred_cleaner_id` from admin/customer PATCH/POST bodies.
 * - omitted / "" → undefined (no patch)
 * - null → explicit clear
 * - uuid → validated against `cleaners` when admin client supplied
 */
export async function parsePreferredCleanerIdFromBody(
  raw: unknown,
  admin?: SupabaseClient | null,
): Promise<PreferredCleanerParseResult> {
  if (raw === undefined || raw === "") return { ok: true, value: undefined };
  if (raw === null) return { ok: true, value: null };

  const id = normalizeUuidCandidate(typeof raw === "string" ? raw : null);
  if (!id) return { ok: true, value: null };

  if (admin) {
    const { data, error } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Preferred cleaner not found." };
  }

  return { ok: true, value: id };
}

export type PreferredCleanerIdsParseResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string };

/**
 * Parse `preferred_cleaner_ids` (array) or legacy `preferred_cleaner_id` (string) from recurring bodies.
 */
export async function parsePreferredCleanerIdsFromBody(
  body: Record<string, unknown>,
  admin?: SupabaseClient | null,
): Promise<PreferredCleanerIdsParseResult> {
  const rawIds: string[] = [];
  if (Array.isArray(body.preferred_cleaner_ids)) {
    for (const x of body.preferred_cleaner_ids) {
      if (typeof x === "string") rawIds.push(x);
    }
  }
  if (typeof body.preferred_cleaner_id === "string" && body.preferred_cleaner_id.trim()) {
    rawIds.unshift(body.preferred_cleaner_id.trim());
  }
  const ids = normalizePreferredCleanerIds(rawIds).slice(0, ADMIN_MAX_PREFERRED_CLEANERS);
  if (ids.length === 0) return { ok: true, ids: [] };

  if (admin) {
    for (const id of ids) {
      const { data, error } = await admin.from("cleaners").select("id").eq("id", id).maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Preferred cleaner not found." };
    }
  }

  return { ok: true, ids };
}

/** Preferred cleaner ids for a recurring plan (column + snapshot template). */
export function resolveRecurringPreferredCleanerIds(input: {
  recurringPreferredCleanerId?: string | null;
  snapshotTemplate: BookingSnapshotV1 | Record<string, unknown> | null;
}): string[] {
  return preferredCleanerIdsFromSnapshot(input.snapshotTemplate, input.recurringPreferredCleanerId ?? null);
}
