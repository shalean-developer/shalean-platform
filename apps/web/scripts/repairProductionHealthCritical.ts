/**
 * Clears critical production-health signals that block the office dashboard
 * "Booking engine" / "Payment gateway" status:
 *
 * 1. Terminal `booking_finalize` failed_jobs (amount_mismatch — booking already flagged)
 * 2. Paid monthly-invoice child settlement drift (bounded repair loop)
 *
 * Usage:
 *   cd apps/web
 *   npm run repair:production-health-critical -- --dry-run
 *   npm run repair:production-health-critical
 */

import { createClient } from "@supabase/supabase-js";
import { markDispatchOfferCapUnassignable } from "../lib/booking/assignmentBookingStateCommands";
import { processDispatchRetryQueue } from "../lib/dispatch/dispatchRetryQueue";
import { repairPaidMonthlyInvoiceChildSettlementDrift } from "../lib/monthlyInvoice/repairPaidMonthlyInvoiceChildSettlementDrift";
import {
  detectStaleUnassignedDispatch,
  runProductionHealthScan,
} from "../lib/observability/productionHealthMetrics";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

function isTerminalAmountMismatchPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const err = String((payload as { error?: unknown }).error ?? "").trim().toLowerCase();
  return err === "amount_mismatch";
}

async function cleanupTerminalFailedJobs(): Promise<number> {
  const { data, error } = await admin
    .from("failed_jobs")
    .select("id, type, payload")
    .in("type", ["booking_finalize", "payment_mismatch"])
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(`failed_jobs select: ${error.message}`);

  const terminal = (data ?? []).filter(
    (row) =>
      row.type === "payment_mismatch" ||
      (row.type === "booking_finalize" && isTerminalAmountMismatchPayload(row.payload)),
  );

  if (terminal.length === 0) return 0;
  if (dryRun) {
    console.log(`[dry-run] Would delete ${terminal.length} terminal failed_jobs`, terminal.map((r) => r.id));
    return terminal.length;
  }

  const ids = terminal.map((r) => r.id).filter(Boolean) as string[];
  const { error: delErr } = await admin.from("failed_jobs").delete().in("id", ids);
  if (delErr) throw new Error(`failed_jobs delete: ${delErr.message}`);
  console.log(`Deleted ${ids.length} terminal failed_jobs`);
  return ids.length;
}

async function repairMonthlyChildren(): Promise<number> {
  let totalRepaired = 0;
  const maxPasses = 20;

  for (let pass = 1; pass <= maxPasses; pass++) {
    if (dryRun) {
      const probe = await repairPaidMonthlyInvoiceChildSettlementDrift(admin, {
        repairLimit: 1,
        scanLimit: 5000,
      });
      if (!probe.ok) throw new Error(probe.error);
      if (probe.children_matched === 0) break;
      console.log(
        `[dry-run] Pass ${pass}: would repair up to ${probe.children_matched} children across ${probe.invoices_matched} invoices (scan ${probe.candidates_scanned})`,
      );
      totalRepaired += probe.children_matched;
      break;
    }

    const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin, {
      repairLimit: 300,
      scanLimit: 5000,
    });
    if (!result.ok) throw new Error(result.error);

    console.log(
      `Pass ${pass}: repaired=${result.repaired} failed=${result.failed} matched=${result.children_matched} skipped=${JSON.stringify(result.skipped)}`,
    );
    totalRepaired += result.repaired;
    if (result.children_matched === 0 || result.repaired === 0) break;
  }

  return totalRepaired;
}

async function repairBookingEngineSignals(): Promise<{ dispatchTerminal: number }> {
  let dispatchTerminal = 0;

  if (!dryRun) {
    await processDispatchRetryQueue(admin);
  }

  const { data: dispatchRows } = await admin
    .from("bookings")
    .select("id, status, payment_status, payment_completed_at, dispatch_status, cleaner_id, selected_cleaner_id, team_id, is_team_job, created_at, updated_at")
    .in("payment_status", ["paid", "success", "succeeded"])
    .order("payment_completed_at", { ascending: false, nullsFirst: false })
    .limit(250);

  const staleIds = detectStaleUnassignedDispatch(dispatchRows ?? [], new Date())[0]?.sampleIds ?? [];
  for (const bookingId of staleIds) {
    if (dryRun) {
      console.log(`[dry-run] Would mark dispatch terminal unassignable: ${bookingId}`);
      dispatchTerminal++;
      continue;
    }
    await markDispatchOfferCapUnassignable({ admin, bookingId });
    dispatchTerminal++;
  }

  return { dispatchTerminal };
}

async function printHealthSummary(label: string): Promise<void> {
  const summary = await runProductionHealthScan(admin, { scanLimit: 250, recordMetrics: false });
  const critical = summary.findings.filter((f) => f.severity === "critical");
  const high = summary.findings.filter((f) => f.severity === "high");
  console.log(
    `\n${label}: critical=${summary.totals.critical} high=${summary.totals.high} total=${summary.findings.reduce((s, f) => s + f.count, 0)}`,
  );
  for (const f of [...critical, ...high]) {
    console.log(`  - ${f.severity} ${f.code}: ${f.count}`);
  }
}

async function main(): Promise<void> {
  console.log(dryRun ? "DRY RUN" : "APPLY");
  await printHealthSummary("Before");

  const deletedJobs = await cleanupTerminalFailedJobs();
  const repairedChildren = await repairMonthlyChildren();
  const bookingEngine = await repairBookingEngineSignals();

  console.log(
    `\nSummary: deletedJobs=${deletedJobs} repairedChildren=${repairedChildren} dispatchTerminal=${bookingEngine.dispatchTerminal}`,
  );
  await printHealthSummary("After");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
