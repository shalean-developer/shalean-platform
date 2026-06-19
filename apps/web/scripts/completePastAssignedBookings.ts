/**
 * Mark past-date bookings with an assigned cleaner as completed (ops backfill).
 *
 * Usage:
 *   cd apps/web
 *   npx tsx --env-file=.env.local scripts/completePastAssignedBookings.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/completePastAssignedBookings.ts --execute
 *
 * Optional: --before=2026-06-18  (default: today Johannesburg)
 */
import { buildCompletionCoherencePatch } from "../lib/booking/bookingCompletionIntegrity";
import { todayYmdJohannesburg } from "../lib/booking/dateInJohannesburg";
import {
  syncCleanersBusyAfterBookingTerminalByBookingId,
} from "../lib/cleaner/syncCleanerStatus";
import {
  fetchBookingDisplayEarningsCents,
  isCompletableDisplayEarningsCents,
  resolvePersistCleanerIdForBooking,
} from "../lib/payout/bookingEarningsIntegrity";
import { persistCleanerPayoutIfUnset } from "../lib/payout/persistCleanerPayout";
import { getSupabaseAdmin } from "../lib/supabase/admin";

const TERMINAL = new Set(["completed", "cancelled", "failed", "payment_expired"]);
const DISPATCH_FUNNEL_BOOKING_STATUS = new Set(["pending_assignment", "offered"]);
const EXECUTE = process.argv.includes("--execute");
const beforeArg = process.argv.find((a) => a.startsWith("--before="));
const beforeDate = beforeArg?.slice("--before=".length) ?? todayYmdJohannesburg();

async function main() {
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error("Missing Supabase admin client.");
    process.exit(1);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(beforeDate)) {
    console.error("Invalid --before date; use YYYY-MM-DD.");
    process.exit(1);
  }

  const { data: rows, error } = await admin
    .from("bookings")
    .select(
      "id, date, time, status, customer_name, customer_email, cleaner_id, payout_owner_cleaner_id, is_team_job, dispatch_status, completed_at",
    )
    .lt("date", beforeDate)
    .not("cleaner_id", "is", null)
    .order("date", { ascending: true });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const targets = (rows ?? []).filter((r) => !TERMINAL.has(String(r.status ?? "").toLowerCase()));
  console.log(EXECUTE ? "=== EXECUTE ===" : "=== DRY RUN ===");
  console.log(`Before date: ${beforeDate}`);
  console.log(`Candidates: ${targets.length}`);

  let completed = 0;
  let skipped = 0;
  const failures: Array<{ id: string; reason: string }> = [];

  for (const b of targets) {
    const id = String(b.id);
    const persistCleanerId = resolvePersistCleanerIdForBooking(
      b as { cleaner_id?: string | null; payout_owner_cleaner_id?: string | null; is_team_job?: boolean | null },
    );
    if (!persistCleanerId) {
      skipped += 1;
      failures.push({ id, reason: "no persist cleaner id" });
      continue;
    }

    if (!EXECUTE) {
      console.log(`  would complete ${id.slice(0, 8)} ${b.date} ${b.status} ${b.customer_name ?? b.customer_email ?? ""}`);
      continue;
    }

    const statusLower = String(b.status ?? "").toLowerCase();
    if (DISPATCH_FUNNEL_BOOKING_STATUS.has(statusLower)) {
      const nowIso = new Date().toISOString();
      const promotePatch: Record<string, unknown> = {
        status: "assigned",
        dispatch_status: "assigned",
      };
      if (!(b as { assigned_at?: string | null }).assigned_at) {
        promotePatch.assigned_at = nowIso;
      }
      const { error: promoteErr } = await admin.from("bookings").update(promotePatch).eq("id", id);
      if (promoteErr) {
        skipped += 1;
        failures.push({ id, reason: `promote offered→assigned: ${promoteErr.message}` });
        continue;
      }
      (b as { status?: string }).status = "assigned";
    }

    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId: id, cleanerId: persistCleanerId });
      if (!payout.ok) {
        skipped += 1;
        failures.push({ id, reason: payout.error ?? "payout persist failed" });
        continue;
      }
      const displayCents = await fetchBookingDisplayEarningsCents(admin, id);
      if (!isCompletableDisplayEarningsCents(displayCents)) {
        skipped += 1;
        failures.push({ id, reason: "display_earnings not positive after persist" });
        continue;
      }
    } catch (e) {
      skipped += 1;
      failures.push({ id, reason: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const completedAt = new Date().toISOString();
    const { patch: completionPatch } = buildCompletionCoherencePatch({
      beforeCompletedAt: (b as { completed_at?: string | null }).completed_at,
      beforeDispatchStatus: (b as { dispatch_status?: string | null }).dispatch_status,
      fillCompletedAtIfMissing: true,
      nowIso: completedAt,
    });

    const { error: upErr } = await admin
      .from("bookings")
      .update({ status: "completed", completed_at: completedAt, ...completionPatch })
      .eq("id", id);

    if (upErr) {
      skipped += 1;
      failures.push({ id, reason: upErr.message });
      continue;
    }

    await syncCleanersBusyAfterBookingTerminalByBookingId(admin, id, {
      cleaner_id: (b as { cleaner_id?: string | null }).cleaner_id,
      payout_owner_cleaner_id: (b as { payout_owner_cleaner_id?: string | null }).payout_owner_cleaner_id,
    });

    completed += 1;
    if (completed % 10 === 0) console.log(`  completed ${completed}…`);
  }

  console.log(`\nDone. Completed: ${completed}, skipped: ${skipped}`);
  if (failures.length) {
    console.log("Failures (first 20):");
    for (const f of failures.slice(0, 20)) {
      console.log(`  ${f.id.slice(0, 8)} — ${f.reason}`);
    }
    if (failures.length > 20) console.log(`  … and ${failures.length - 20} more`);
  }

  if (!EXECUTE) {
    console.log("\nRe-run with --execute to apply.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
