import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertBookingCleanerEarningsResetSafe } from "@/lib/admin/adminBookingEarningsResetSafety";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { CANONICAL_EARNINGS_MODEL_VERSION } from "@/lib/payout/canonicalCleanerPayout";
import { resolvePersistCleanerIdForBooking } from "@/lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";
import { resetBookingCleanerLineEarnings } from "@/lib/payout/resetBookingCleanerLineEarnings";

const TERMINAL_STATUSES = ["cancelled", "failed", "payment_expired"] as const;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export type RecalculateCleanerEarningsBatchOptions = {
  admin: SupabaseClient;
  /** Inclusive booking `date` lower bound (YYYY-MM-DD). */
  from?: string | null;
  /** Inclusive booking `date` upper bound (YYYY-MM-DD). */
  to?: string | null;
  bookingId?: string | null;
  limit?: number | null;
  dryRun?: boolean;
  /** When true, skip line-earnings reset before re-persist. */
  skipReset?: boolean;
  /** Skip rows already on the canonical model with display set. */
  skipAlreadyV3?: boolean;
  /** Actor id for audit logs (admin user). */
  actorUserId?: string | null;
  logSource?: string;
};

export type RecalculateCleanerEarningsBatchResult = {
  ok: boolean;
  modelVersion: string;
  candidates: number;
  attempted: number;
  recomputed: number;
  skipped: number;
  failed: number;
  resetBlocked: number;
  skipReasons: Record<string, number>;
  changed: Array<{
    id: string;
    before: number | null;
    after: number | null;
    version: string | null;
  }>;
  dryRun: boolean;
};

type CandidateRow = {
  id: string;
  status: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  is_team_job: boolean | null;
  display_earnings_cents: number | null;
  earnings_model_version: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
};

function parseYmd(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  return YMD_RE.test(t) ? t : null;
}

async function loadCandidates(
  admin: SupabaseClient,
  opts: Pick<RecalculateCleanerEarningsBatchOptions, "from" | "to" | "bookingId" | "limit">,
): Promise<CandidateRow[]> {
  const singleId = String(opts.bookingId ?? "").trim();
  if (singleId) {
    const { data, error } = await admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, earnings_model_version, service, date, time",
      )
      .eq("id", singleId)
      .maybeSingle();
    if (error || !data) return [];
    return [data as CandidateRow];
  }

  const from = parseYmd(opts.from);
  const to = parseYmd(opts.to);
  const out: CandidateRow[] = [];
  const pageSize = 500;
  let lastId = "";

  for (;;) {
    if (opts.limit != null && out.length >= opts.limit) break;

    let q = admin
      .from("bookings")
      .select(
        "id, status, cleaner_id, payout_owner_cleaner_id, is_team_job, display_earnings_cents, earnings_model_version, service, date, time",
      )
      .or("cleaner_id.not.is.null,payout_owner_cleaner_id.not.is.null")
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .order("id", { ascending: true })
      .limit(Math.min(pageSize, opts.limit != null ? opts.limit - out.length : pageSize));
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (lastId) q = q.gt("id", lastId);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as CandidateRow[];
    if (batch.length === 0) break;
    out.push(...batch);
    lastId = batch[batch.length - 1]!.id;
    if (batch.length < pageSize) break;
  }

  return out;
}

/**
 * Recompute stored cleaner earnings using the canonical v3 engine
 * (`persistCleanerPayoutIfUnset({ forceDisplayRecompute: true })`).
 *
 * When reset is allowed, clears finalized line earnings first (same gate as
 * `POST /api/admin/bookings/[id]/reset-earnings`) so completed jobs are not
 * blocked by the solo line-finalized idempotent skip.
 */
export async function recalculateCleanerEarningsBatch(
  options: RecalculateCleanerEarningsBatchOptions,
): Promise<RecalculateCleanerEarningsBatchResult> {
  const {
    admin,
    dryRun = false,
    skipReset = false,
    skipAlreadyV3 = false,
    actorUserId = null,
    logSource = "recalculateCleanerEarningsBatch",
  } = options;

  const candidates = await loadCandidates(admin, options);
  const skipReasons = new Map<string, number>();
  const changed: RecalculateCleanerEarningsBatchResult["changed"] = [];

  let attempted = 0;
  let recomputed = 0;
  let skipped = 0;
  let failed = 0;
  let resetBlocked = 0;

  for (const row of candidates) {
    const cleanerId = resolvePersistCleanerIdForBooking({
      cleaner_id: row.cleaner_id,
      payout_owner_cleaner_id: row.payout_owner_cleaner_id,
      is_team_job: row.is_team_job,
    });
    if (!cleanerId) {
      skipped += 1;
      skipReasons.set("no_cleaner_or_payout_owner", (skipReasons.get("no_cleaner_or_payout_owner") ?? 0) + 1);
      continue;
    }

    if (
      skipAlreadyV3 &&
      row.earnings_model_version === CANONICAL_EARNINGS_MODEL_VERSION &&
      row.display_earnings_cents != null
    ) {
      skipped += 1;
      skipReasons.set("already_v3", (skipReasons.get("already_v3") ?? 0) + 1);
      continue;
    }

    attempted += 1;

    if (dryRun) {
      continue;
    }

    try {
      if (!skipReset) {
        const safe = await assertBookingCleanerEarningsResetSafe(admin, row.id);
        if (safe.ok) {
          const rst = await resetBookingCleanerLineEarnings(admin, row.id);
          if (!rst.ok) {
            skipReasons.set("reset_failed", (skipReasons.get("reset_failed") ?? 0) + 1);
          }
        } else {
          resetBlocked += 1;
          skipReasons.set(safe.code, (skipReasons.get(safe.code) ?? 0) + 1);
        }
      }

      const result = await persistCleanerPayoutIfUnset({
        admin,
        bookingId: row.id,
        cleanerId,
        forceDisplayRecompute: true,
      });

      if (!result.ok) {
        failed += 1;
        skipReasons.set("persist_failed", (skipReasons.get("persist_failed") ?? 0) + 1);
        continue;
      }

      if (result.skipped) {
        skipped += 1;
        const reason = result.skipReason ?? "skipped";
        skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
        continue;
      }

      const { data: after } = await admin
        .from("bookings")
        .select("display_earnings_cents, earnings_model_version")
        .eq("id", row.id)
        .maybeSingle();
      const afterRow = after as { display_earnings_cents?: number | null; earnings_model_version?: string | null } | null;
      const afterCents = afterRow?.display_earnings_cents ?? null;
      const afterVersion = afterRow?.earnings_model_version ?? null;

      recomputed += 1;
      changed.push({ id: row.id, before: row.display_earnings_cents, after: afterCents, version: afterVersion });

      void logSystemEvent({
        level: "info",
        source: logSource,
        message: "booking_earnings_recomputed_v3",
        context: {
          booking_id: row.id,
          cleaner_id: cleanerId,
          before_display_earnings_cents: row.display_earnings_cents,
          after_display_earnings_cents: afterCents,
          before_model_version: row.earnings_model_version,
          after_model_version: afterVersion,
          status: row.status,
          actor_user_id: actorUserId,
        },
      });
    } catch {
      failed += 1;
      skipReasons.set("throw", (skipReasons.get("throw") ?? 0) + 1);
    }
  }

  return {
    ok: failed === 0,
    modelVersion: CANONICAL_EARNINGS_MODEL_VERSION,
    candidates: candidates.length,
    attempted,
    recomputed,
    skipped,
    failed,
    resetBlocked,
    skipReasons: Object.fromEntries(skipReasons),
    changed,
    dryRun,
  };
}
