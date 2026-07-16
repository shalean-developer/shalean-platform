#!/usr/bin/env node
/**
 * PRINCESS-UAT-PRD-STATUS-HOTFIX — Deployed refund status-compatibility retest.
 *
 * Reuses the PR D merge retest harness against a configurable Preview base URL.
 * Defaults to the staging branch alias. Override with STAGING_BASE_URL for the
 * hotfix PR Preview when verifying code before merge.
 *
 * Synthetic staging data + record_only / seeded webhook simulation.
 * Does NOT execute a real Paystack refund.
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const harness = resolve(__dirname, "princess-prd-staging-merge-retest.mjs");

const base =
  process.env.STAGING_BASE_URL?.trim() ||
  "https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app";

console.log(
  JSON.stringify(
    {
      ticket: "PRINCESS-UAT-PRD-STATUS-HOTFIX",
      harness,
      staging_base: base,
      real_refund_executed: false,
      model: "A_immutable_capture_payment_status",
    },
    null,
    2,
  ),
);

const result = spawnSync(process.execPath, [harness], {
  cwd: resolve(__dirname, "../.."),
  env: {
    ...process.env,
    STAGING_BASE_URL: base,
    PRINCESS_PRD_TICKET: "PRINCESS-UAT-PRD-STATUS-HOTFIX",
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
