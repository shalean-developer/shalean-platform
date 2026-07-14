/**
 * Dry-run / apply script: zero collected-cash columns on unpaid pending bookings
 * that incorrectly stored payable amounts as cash (BK-001 anomaly).
 *
 * Usage (from apps/web):
 *   npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts
 *   npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/repairPendingCollectedCashAnomaly.ts --apply --confirm-apply-to-database
 *
 * Production-looking Supabase URLs additionally require:
 *   --i-understand-this-is-production
 *
 * Does NOT auto-apply in CI. Never run --apply against production without review.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  evaluatePendingCollectedCashAnomalyCandidate,
  looksLikeProductionSupabaseUrl,
  type PendingCashAnomalyCandidate,
} from "../lib/booking/pendingCollectedCashAnomalyRepair";

type CandidateRow = PendingCashAnomalyCandidate & {
  paystack_reference: string | null;
};

function parseArgs(argv: string[]) {
  const limitIdx = argv.indexOf("--limit");
  const batchIdx = argv.indexOf("--batch-size");
  return {
    dryRun: !argv.includes("--apply"),
    apply: argv.includes("--apply"),
    confirmApply: argv.includes("--confirm-apply-to-database"),
    confirmProduction: argv.includes("--i-understand-this-is-production"),
    limit: (() => {
      if (limitIdx < 0) return 500;
      const n = Number(argv[limitIdx + 1]);
      return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 5000) : 500;
    })(),
    batchSize: (() => {
      if (batchIdx < 0) return 50;
      const n = Number(argv[batchIdx + 1]);
      return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 200) : 50;
    })(),
  };
}

async function loadLedgerFlags(
  admin: SupabaseClient,
  bookingIds: string[],
): Promise<Map<string, { hasSettledGatewayLedger: boolean; hasR0CoverLedger: boolean }>> {
  const map = new Map<string, { hasSettledGatewayLedger: boolean; hasR0CoverLedger: boolean }>();
  for (const id of bookingIds) {
    map.set(id, { hasSettledGatewayLedger: false, hasR0CoverLedger: false });
  }
  if (bookingIds.length === 0) return map;

  const { data, error } = await admin
    .from("payment_transactions")
    .select("booking_id, gateway, payment_channel, settlement_status, gateway_reference, amount_cents")
    .in("booking_id", bookingIds);

  if (error) {
    throw new Error(`payment_transactions lookup failed: ${error.message}`);
  }

  for (const row of data ?? []) {
    const id = String((row as { booking_id?: string }).booking_id ?? "");
    const flags = map.get(id);
    if (!flags) continue;
    const gateway = String((row as { gateway?: string }).gateway ?? "").toLowerCase();
    const channel = String((row as { payment_channel?: string }).payment_channel ?? "").toLowerCase();
    const settlement = String((row as { settlement_status?: string }).settlement_status ?? "").toLowerCase();
    const ref = String((row as { gateway_reference?: string }).gateway_reference ?? "");
    if (channel === "promo_credit_cover" || ref === `r0:${id}`) {
      flags.hasR0CoverLedger = true;
    }
    if (gateway !== "other" && (settlement === "settled" || settlement === "pending")) {
      flags.hasSettledGatewayLedger = true;
    }
    if (gateway === "paystack" && Number((row as { amount_cents?: number }).amount_cents ?? 0) > 0) {
      flags.hasSettledGatewayLedger = true;
    }
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE URL or SERVICE_ROLE_KEY — aborting.");
    process.exit(1);
  }

  const productionLike = looksLikeProductionSupabaseUrl(url);
  let hostHint = "unknown-host";
  try {
    hostHint = new URL(url).host;
  } catch {
    hostHint = "invalid-url";
  }

  if (args.apply && !args.confirmApply) {
    console.error(
      "Apply refused: pass --confirm-apply-to-database together with --apply after reviewing dry-run output.",
    );
    process.exit(1);
  }
  if (args.apply && productionLike && !args.confirmProduction) {
    console.error(
      "Apply refused: target looks like a hosted Supabase project. Re-run with --i-understand-this-is-production after ops review.",
    );
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, status, payment_status, amount_paid_cents, total_paid_cents, total_paid_zar, total_price, paystack_reference, payment_completed_at, payment_transaction_id, marked_paid_by_admin_id",
    )
    .in("status", ["pending_payment", "payment_expired"])
    .or("amount_paid_cents.gt.0,total_paid_zar.gt.0,total_paid_cents.gt.0")
    .order("id", { ascending: true })
    .limit(args.limit);

  if (error) {
    console.error("Query failed:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as CandidateRow[];
  const ledgerFlags = await loadLedgerFlags(
    admin,
    rows.map((r) => r.id),
  );

  const included: CandidateRow[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];

  for (const row of rows) {
    const flags = ledgerFlags.get(row.id) ?? {
      hasSettledGatewayLedger: false,
      hasR0CoverLedger: false,
    };
    const gate = evaluatePendingCollectedCashAnomalyCandidate({
      ...row,
      hasSettledGatewayLedger: flags.hasSettledGatewayLedger,
      hasR0CoverLedger: flags.hasR0CoverLedger,
    });
    if (gate.ok) included.push(row);
    else excluded.push({ id: row.id, reason: gate.reason });
  }

  const report = {
    mode: args.apply ? "apply" : "dry-run",
    target_host: hostHint,
    production_like_host: productionLike,
    scanned: rows.length,
    candidates: included.length,
    excluded: excluded.length,
    limit: args.limit,
    batch_size: args.batchSize,
    exclusions_sample: excluded.slice(0, 50),
    candidates_sample: included.slice(0, 20).map((r) => ({
      id: r.id,
      status: r.status,
      payment_status: r.payment_status,
      amount_paid_cents: r.amount_paid_cents,
      total_price: r.total_price,
    })),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!args.apply) {
    console.log("Dry-run only. Re-run with --apply --confirm-apply-to-database after review.");
    return;
  }

  let updated = 0;
  for (let i = 0; i < included.length; i += args.batchSize) {
    const batch = included.slice(i, i + args.batchSize);
    for (const row of batch) {
      const { data: touched, error: updErr } = await admin
        .from("bookings")
        .update({
          amount_paid_cents: 0,
          total_paid_cents: 0,
          total_paid_zar: 0,
        })
        .eq("id", row.id)
        .in("status", ["pending_payment", "payment_expired"])
        .is("payment_completed_at", null)
        .is("payment_transaction_id", null)
        .neq("payment_status", "success")
        .select("id");

      if (updErr) {
        console.error(JSON.stringify({ event: "repair_update_failed", booking_id: row.id, error: updErr.message }));
        continue;
      }
      if (touched && touched.length > 0) updated += 1;
    }
  }

  console.log(
    JSON.stringify({
      event: "repair_pending_collected_cash_applied",
      applied: updated,
      candidate_count: included.length,
      mode: "apply",
      target_host: hostHint,
    }),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
