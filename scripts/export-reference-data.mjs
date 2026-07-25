#!/usr/bin/env node
/**
 * export-reference-data.mjs — READ-ONLY production reference export.
 *
 * Exports only safe, non-sensitive reference/configuration records from
 * production and writes sanitised SQL fixtures to supabase/seed/reference/.
 *
 * Safety controls:
 *   - Operates in strict read-only mode (SELECT only; no writes to production).
 *   - Stops with a non-zero exit if any exported row contains personal,
 *     authentication, payment, banking, or customer-specific data.
 *   - Requires explicit --prod flag to read from production; without it,
 *     uses the development project as the export source.
 *   - Never prints secret values.
 *   - Does not alter production in any way.
 *
 * Usage:
 *   node scripts/export-reference-data.mjs             # read from dev (safe default)
 *   node scripts/export-reference-data.mjs --prod      # read from production (requires PROD_SERVICE_KEY)
 *   node scripts/export-reference-data.mjs --dry-run   # print SQL without writing
 *
 * Output: supabase/seed/reference/pricing_export.sql
 *
 * NOTE: The static reference fixture at supabase/seed/reference/pricing.sql is
 * derived from the @shalean/pricing static config and does NOT require a live
 * production export. This script supplements that with live DB pricing rows
 * when production credentials are available.
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

const PROD_REF = "tchayecuvzssixyxlvfu";
const DEV_REF  = "mbvixuzfvzbooiurvxwz";

// ──────────────────────────────────────────────────────────────
// Safety: tables that must NEVER be exported
// ──────────────────────────────────────────────────────────────
const FORBIDDEN_TABLES = new Set([
  "auth.users",
  "bookings",
  "cleaners",
  "cleaner_payment_details",
  "cleaner_earnings",
  "cleaner_payouts",
  "cleaner_payout_runs",
  "cleaner_earnings_disbursements",
  "monthly_invoices",
  "user_profiles",
  "customer_saved_addresses",
  "notification_logs",
  "notification_idempotency_claims",
  "dispatch_logs",
  "dispatch_offers",
  "reviews",
  "payment_transactions",
  "payout_transfers",
  "payout_transfer_outbox",
  "payout_audit_events",
  "admin_money_action_proposals",
  "sales_documents",
  "whatsapp_logs",
  "whatsapp_queue",
  "cleaner_applications",
  "referral_submissions",
  "system_logs",
]);

// Columns that must never appear in exported rows
const FORBIDDEN_COLUMNS = [
  "email", "phone", "auth_user_id", "customer_email", "customer_phone",
  "customer_name", "paystack_reference", "paystack_authorization_code",
  "account_number", "bank_code", "recipient_code", "access_token",
  "refresh_token", "zoho_invoice_id", "zoho_invoice_number",
];

function containsPersonalData(rows) {
  for (const row of rows) {
    for (const col of FORBIDDEN_COLUMNS) {
      if (col in row && row[col] != null && String(row[col]).length > 0) {
        return col;
      }
    }
  }
  return null;
}

function escapeString(s) {
  if (s == null) return "NULL";
  return `'${String(s).replace(/'/g, "''")}'`;
}

function buildInsertSQL(table, rows) {
  if (!rows || rows.length === 0) return `-- ${table}: 0 rows\n`;
  const cols = Object.keys(rows[0]);
  const lines = rows.map((row) => {
    const vals = cols.map((c) => {
      const v = row[c];
      if (v == null) return "NULL";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return String(v);
      if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return escapeString(v);
    });
    return `  (${vals.join(", ")})`;
  });
  return (
    `-- ${table}: ${rows.length} rows\n` +
    `INSERT INTO public.${table} (\n  ${cols.join(", ")}\n) VALUES\n` +
    lines.join(",\n") +
    "\nON CONFLICT DO NOTHING;\n\n"
  );
}

async function exportTable(client, table, columns, filter = null) {
  if (FORBIDDEN_TABLES.has(table)) {
    throw new Error(`SAFETY VIOLATION: attempted export of forbidden table '${table}'`);
  }
  let query = client.from(table).select(columns ?? "*");
  if (filter) query = query.eq(filter.col, filter.val);
  const { data, error } = await query.limit(500);
  if (error) {
    console.warn(`  [skip] ${table}: ${error.message}`);
    return [];
  }
  const personalCol = containsPersonalData(data ?? []);
  if (personalCol) {
    throw new Error(
      `SAFETY VIOLATION: table '${table}' contains personal data in column '${personalCol}'. Export aborted.`,
    );
  }
  return data ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const useProd  = args.includes("--prod");
  const dryRun   = args.includes("--dry-run");

  if (useProd) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (!url.includes(PROD_REF)) {
      console.error("ERROR: --prod requires NEXT_PUBLIC_SUPABASE_URL to point at the production project.");
      console.error("       Set PROD_SUPABASE_URL and PROD_SERVICE_KEY to use production creds without");
      console.error("       modifying your local .env.local.");
      process.exit(1);
    }
  }

  const url = useProd
    ? (process.env.PROD_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const serviceKey = useProd
    ? (process.env.PROD_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "")
    : (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

  if (!url || !serviceKey) {
    console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const ref = url.match(/https:\/\/([^.]+)\.supabase/)?.[1] ?? "unknown";
  if (ref === PROD_REF && !useProd) {
    console.error(`ERROR: URL points at production (${PROD_REF}) but --prod flag was not passed.`);
    console.error("       Pass --prod explicitly to export from production, or use a dev/staging URL.");
    process.exit(1);
  }

  console.log(`[export-reference-data] source=${ref} ${useProd ? "(PRODUCTION — read-only)" : "(dev)"}`);
  console.log("[export-reference-data] Exporting ONLY non-sensitive reference/config tables.");

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parts = [
    `-- =============================================================================\n`,
    `-- Reference data export — generated by scripts/export-reference-data.mjs\n`,
    `-- Source project: ${ref}${useProd ? " (PRODUCTION — read-only; no personal data)" : " (dev)"}\n`,
    `-- Generated: ${new Date().toISOString()}\n`,
    `-- SAFE TO COMMIT: no personal, auth, payment, or banking data.\n`,
    `-- =============================================================================\n\nBEGIN;\n\n`,
  ];

  // ── pricing_services ──────────────────────────────────────────
  const pricingServices = await exportTable(
    client, "pricing_services",
    "slug, name, base_price, price_per_bedroom, price_per_bathroom, price_per_extra_room, min_hours, max_hours, duration_base, duration_per_bedroom, duration_per_bathroom, duration_per_extra_room, is_active, sort_order",
  );
  parts.push(buildInsertSQL("pricing_services", pricingServices));
  console.log(`  pricing_services: ${pricingServices.length} rows`);

  // ── pricing_extras ────────────────────────────────────────────
  const pricingExtras = await exportTable(
    client, "pricing_extras",
    "slug, name, description, price, service_type, is_popular, is_active, sort_order",
  );
  parts.push(buildInsertSQL("pricing_extras", pricingExtras));
  console.log(`  pricing_extras: ${pricingExtras.length} rows`);

  // ── pricing_booking_config ────────────────────────────────────
  const bookingConfig = await exportTable(
    client, "pricing_booking_config", "id, config",
    { col: "id", val: "default" },
  );
  parts.push(buildInsertSQL("pricing_booking_config", bookingConfig));
  console.log(`  pricing_booking_config: ${bookingConfig.length} rows`);

  // ── services (marketing) ──────────────────────────────────────
  const services = await exportTable(
    client, "services",
    "id, slug, title, description, starting_price, features, sort_order, is_active",
  );
  parts.push(buildInsertSQL("services", services));
  console.log(`  services: ${services.length} rows`);

  parts.push("COMMIT;\n");

  const sql = parts.join("");

  if (dryRun) {
    console.log("\n[dry-run] SQL output:\n");
    console.log(sql.slice(0, 3000) + (sql.length > 3000 ? "\n... (truncated)" : ""));
  } else {
    const outDir = resolve(root, "supabase/seed/reference");
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, "pricing_export.sql");
    writeFileSync(outPath, sql, "utf8");
    console.log(`\n[export-reference-data] Written: ${outPath}`);
  }

  console.log("[export-reference-data] DONE — no production mutations performed.");
  console.log("[export-reference-data] Confirm: NO personal, auth, payment, or banking data exported.");
}

main().catch((err) => {
  console.error("[export-reference-data] FAILED:", err.message || err);
  process.exit(1);
});
