import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolveMonthlyRaceResult =
  | {
      kind: "proceed";
      deletedIds: string[];
      winnerId: string | null;
      clusterStart: string | null;
      clusterEnd: string | null;
      clusterSize: number | null;
      winnerCreatedAt: string | null;
    }
  | {
      kind: "reject";
      winnerId: string;
      deletedIds: string[];
      leftDuplicate: boolean;
      rolledBackSelf: boolean;
      clusterStart: string | null;
      clusterEnd: string | null;
      clusterSize: number | null;
      winnerCreatedAt: string | null;
    }
  | { kind: "rpc_error"; message: string };

function parseDeletedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => String(x)).filter(Boolean);
}

function parseIso(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw);
  return s.length ? s : null;
}

function parseClusterSize(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * DB-side race cleanup: one transaction, FOR UPDATE on the active-slot set, cluster
 * [min(created_at), min + 2s], invoice-safe deletes. See resolve_admin_monthly_booking_race.
 * Idempotent: single active row → proceed; requester row already gone → reject + winner (no re-delete).
 */
export async function resolveMonthlyBookingDuplicateRace(
  admin: SupabaseClient,
  params: {
    ourBookingId: string;
    userId: string;
    date: string;
    timeHm: string;
    serviceSlug: string;
    force: boolean;
  },
): Promise<ResolveMonthlyRaceResult> {
  const { data, error } = await admin.rpc("resolve_admin_monthly_booking_race", {
    p_our_id: params.ourBookingId,
    p_user_id: params.userId,
    p_date: params.date,
    p_time: params.timeHm,
    p_service_slug: params.serviceSlug,
    p_force: params.force,
  });

  if (error) {
    return { kind: "rpc_error", message: error.message ?? "Race resolver failed." };
  }

  if (!data || typeof data !== "object") {
    return { kind: "rpc_error", message: "Race resolver returned empty payload." };
  }

  const row = data as Record<string, unknown>;
  const deletedIds = parseDeletedIds(row.deleted_ids);
  const ok = Boolean(row.ok);
  const winnerRaw = row.winner_id;
  const winnerId = winnerRaw == null || winnerRaw === "" ? null : String(winnerRaw);
  const leftDuplicate = Boolean(row.left_duplicate);
  const rolledBackSelf = Boolean(row.rolled_back_self);
  const clusterStart = parseIso(row.cluster_start);
  const clusterEnd = parseIso(row.cluster_end);
  const clusterSize = parseClusterSize(row.cluster_size);
  const winnerCreatedAt = parseIso(row.winner_created_at);

  const action =
    row.action === "proceed" || row.action === "reject"
      ? row.action
      : ok
        ? "proceed"
        : winnerId
          ? "reject"
          : null;

  if (action === "proceed") {
    return {
      kind: "proceed",
      deletedIds,
      winnerId,
      clusterStart,
      clusterEnd,
      clusterSize,
      winnerCreatedAt,
    };
  }
  if (action === "reject" && winnerId) {
    return {
      kind: "reject",
      winnerId,
      deletedIds,
      leftDuplicate,
      rolledBackSelf,
      clusterStart,
      clusterEnd,
      clusterSize,
      winnerCreatedAt,
    };
  }
  return { kind: "rpc_error", message: "Race resolver returned an unusable payload." };
}
