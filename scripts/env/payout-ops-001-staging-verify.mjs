/**
 * PAYOUT-OPS-001 — staging service-role harness (opt-in).
 * Requires STAGING_VERIFY=1 + staging Supabase URL/service role.
 * Applies claim/reject RPCs must already be migrated.
 *
 * Usage (from repo root, with staging env loaded):
 *   $env:STAGING_VERIFY=1; node scripts/env/payout-ops-001-staging-verify.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const STAGING_REF = "gbgnemlpyykyhpqqbgru";
const PROPOSER = "11111111-1111-4111-8111-111111111199";
const CHECKER = "22222222-2222-4222-8222-222222222299";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));
loadEnvFile(resolve(process.cwd(), "apps/web/.env.local"));

if (process.env.STAGING_VERIFY !== "1") {
  console.error("Set STAGING_VERIFY=1 to run.");
  process.exit(2);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url.includes(STAGING_REF)) throw new Error(`Refusing non-staging url=${url}`);
if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const evidence = { at: new Date().toISOString(), stagingRef: STAGING_REF, checks: {} };

async function main() {
  // Confirm RPCs exist
  const { data: claimProbe, error: claimProbeErr } = await admin.rpc("claim_admin_money_action_proposal", {
    p_proposal_id: "00000000-0000-4000-8000-000000000000",
    p_actor_id: CHECKER,
    p_allow_self: false,
  });
  evidence.checks.rpc_claim_exists = !claimProbeErr || !/could not find|function/i.test(claimProbeErr?.message ?? "");
  evidence.checks.rpc_claim_probe = { data: claimProbe, error: claimProbeErr?.message ?? null };

  if (!evidence.checks.rpc_claim_exists) {
    evidence.outcome = "NO-GO — migration not applied on staging";
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }

  // Find a recent adjustable booking with a cleaner (read-only probe first)
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, cleaner_id, cleaner_payout_cents, display_earnings_cents, payout_status")
    .not("cleaner_id", "is", null)
    .order("date", { ascending: false })
    .limit(5);

  evidence.sample_bookings = (bookings ?? []).map((b) => b.id);
  console.log(JSON.stringify(evidence, null, 2));
  console.log("Harness ready. Full mutate cycle requires controlled fixture — see evidence docs.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
