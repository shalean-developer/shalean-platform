/**
 * Backfill `dispatch_offers.display_earnings_cents` for open pending offers
 * that were created before migration `20260934_dispatch_offers_earnings_snapshot.sql`
 * (or after, but the snapshot write failed). The script touches ONLY the new
 * snapshot columns on `dispatch_offers`; it never writes to `bookings`,
 * `cleaner_payouts`, `cleaner_earnings`, or any ledger.
 *
 * Safety
 *   - Considers ONLY rows where `dispatch_offers.status = 'pending'` and
 *     `expires_at > now()` — historical rows are never modified.
 *   - Updates use `is null` on `display_earnings_cents` so a positive value
 *     written by another path is never overwritten.
 *   - Snapshot resolution is done by `computeCleanerOfferEarningsSnapshot` —
 *     the same pure function used at offer creation time, so the repaired
 *     value is identical to what the cleaner would see today on a freshly
 *     dispatched offer.
 *   - Misses (e.g. solo-standard with zero payment basis) write only the
 *     diagnostic source so the audit query in
 *     `supabase/queries/cleaner_offer_earning_unavailable_audit.sql` can
 *     surface them — `display_earnings_cents` stays null.
 *
 * Usage
 *   cd apps/web
 *   npm run repair:dispatch-offer-earnings -- --dry-run
 *   npm run repair:dispatch-offer-earnings                              # apply
 *   npm run repair:dispatch-offer-earnings -- --offer <uuid>            # single offer
 *   npm run repair:dispatch-offer-earnings -- --booking <uuid>          # all open offers for one booking
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  computeCleanerOfferEarningsSnapshot,
  type ComputeCleanerOfferEarningsSnapshotResult,
} from "../lib/payout/computeCleanerOfferEarningsSnapshot";
import { logSystemEvent } from "../lib/logging/systemLog";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

function argAfter(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx > -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1]!.trim();
  }
  return null;
}
const singleOfferId = argAfter("--offer");
const singleBookingId = argAfter("--booking");

const OFFER_SELECT = "id, booking_id, cleaner_id, status, expires_at, display_earnings_cents, earnings_snapshot_source";
const BOOKING_SELECT =
  "id, service, date, time, is_team_job, team_member_count_snapshot, base_amount_cents, service_fee_cents, total_paid_zar, total_paid_cents, amount_paid_cents, booking_snapshot";

type OfferRow = {
  id: string;
  booking_id: string;
  cleaner_id: string;
  status: string | null;
  expires_at: string | null;
  display_earnings_cents: number | null;
  earnings_snapshot_source: string | null;
};

async function loadCandidates(admin: SupabaseClient): Promise<OfferRow[]> {
  const nowIso = new Date().toISOString();

  if (singleOfferId) {
    const { data, error } = await admin
      .from("dispatch_offers")
      .select(OFFER_SELECT)
      .eq("id", singleOfferId)
      .maybeSingle();
    if (error || !data) return [];
    return [data as OfferRow];
  }

  const out: OfferRow[] = [];
  const pageSize = 500;
  let from = 0;
  for (;;) {
    let q = admin
      .from("dispatch_offers")
      .select(OFFER_SELECT)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .is("display_earnings_cents", null)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (singleBookingId) {
      q = q.eq("booking_id", singleBookingId);
    }
    const { data, error } = await q;
    if (error) {
      console.error("[repair] candidate scan failed:", error.message);
      process.exit(1);
    }
    const batch = (data ?? []) as OfferRow[];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

type ScopeStats = {
  attempted: number;
  repaired: number;
  /** Snapshot resolved with a degraded source (e.g. cleaner_tenure_unknown) — written but flagged. */
  degraded: number;
  /** Snapshot could not resolve (e.g. solo standard with no payment basis) — only source written. */
  unresolved: number;
  failed: number;
};

async function main(): Promise<void> {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const candidates = await loadCandidates(admin);
  console.log(`[repair] candidate offers: ${candidates.length}${dryRun ? " (DRY-RUN)" : ""}`);

  const stats: ScopeStats = { attempted: 0, repaired: 0, degraded: 0, unresolved: 0, failed: 0 };
  const sourceCounts = new Map<string, number>();

  for (const offer of candidates) {
    /** Skip rows that already have a positive snapshot (race-safety belt — the query already filters these out). */
    if (offer.display_earnings_cents != null && offer.display_earnings_cents > 0) {
      continue;
    }

    const tag = `${offer.id}  booking=${offer.booking_id}  cleaner=${offer.cleaner_id}`;

    const [{ data: bookingRow, error: bookingErr }, { data: cleanerRow, error: cleanerErr }] = await Promise.all([
      admin.from("bookings").select(BOOKING_SELECT).eq("id", offer.booking_id).maybeSingle(),
      admin.from("cleaners").select("id, joined_at, created_at").eq("id", offer.cleaner_id).maybeSingle(),
    ]);

    if (bookingErr || !bookingRow || cleanerErr || !cleanerRow) {
      stats.failed += 1;
      console.error(
        `[repair][fail] ${tag}: ${bookingErr?.message ?? cleanerErr?.message ?? "booking_or_cleaner_not_found"}`,
      );
      continue;
    }

    stats.attempted += 1;
    const snapshot: ComputeCleanerOfferEarningsSnapshotResult = computeCleanerOfferEarningsSnapshot({
      booking: bookingRow as Parameters<typeof computeCleanerOfferEarningsSnapshot>[0]["booking"],
      cleaner: cleanerRow as Parameters<typeof computeCleanerOfferEarningsSnapshot>[0]["cleaner"],
    });
    sourceCounts.set(snapshot.source, (sourceCounts.get(snapshot.source) ?? 0) + 1);

    if (!snapshot.ok) {
      stats.unresolved += 1;
      console.log(`[repair][miss] ${tag}: source=${snapshot.source} reason=${snapshot.missingReason}`);
      if (dryRun) continue;
      /** Write only the source so the audit query can group misses; leave display_earnings_cents null. */
      await admin
        .from("dispatch_offers")
        .update({
          earnings_snapshot_source: snapshot.source,
          earnings_snapshot_at: new Date().toISOString(),
        })
        .eq("id", offer.id)
        .is("display_earnings_cents", null);
      continue;
    }

    if (dryRun) {
      console.log(
        `[repair][dry] would write ${tag}: source=${snapshot.source} cents=${snapshot.amount_cents}`,
      );
      continue;
    }

    const { error: upErr } = await admin
      .from("dispatch_offers")
      .update({
        display_earnings_cents: snapshot.amount_cents,
        earnings_snapshot_source: snapshot.source,
        earnings_snapshot_at: new Date().toISOString(),
      })
      .eq("id", offer.id)
      .is("display_earnings_cents", null);
    if (upErr) {
      stats.failed += 1;
      console.error(`[repair][fail] ${tag}: ${upErr.message}`);
      continue;
    }

    stats.repaired += 1;
    if (snapshot.source !== "canonical") stats.degraded += 1;
    console.log(`[repair][ok]  ${tag}: source=${snapshot.source} cents=${snapshot.amount_cents}`);

    void logSystemEvent({
      level: "info",
      source: "scripts/repair_missing_dispatch_offer_earnings_snapshot",
      message: "dispatch_offer_earnings_snapshot_repaired",
      context: {
        offerId: offer.id,
        bookingId: offer.booking_id,
        cleanerId: offer.cleaner_id,
        source: snapshot.source,
        amount_cents: snapshot.amount_cents,
        diagnostics: snapshot.diagnostics,
      },
    });
  }

  console.log(
    `[repair] done — attempted=${stats.attempted} repaired=${stats.repaired} degraded=${stats.degraded} unresolved=${stats.unresolved} failed=${stats.failed}`,
  );
  if (sourceCounts.size > 0) {
    console.log("[repair] source breakdown:", Object.fromEntries(sourceCounts));
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[repair] fatal:", msg);
  process.exit(1);
});
