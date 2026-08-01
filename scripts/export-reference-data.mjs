#!/usr/bin/env node
/**
 * export-reference-data.mjs — READ-ONLY export of non-sensitive reference/config data.
 *
 * DEFAULT target: the DEVELOPMENT project (reads NEXT_PUBLIC_SUPABASE_URL from env).
 * This script does NOT export from production unless --prod is passed explicitly.
 *
 * Safety controls:
 *   - Operates in strict read-only mode (SELECT only — no INSERT/UPDATE/DELETE on any project).
 *   - Uses an explicit ALLOWLIST of tables and columns. Only those exact columns are
 *     fetched and written. Any table or column not in the allowlist is never touched.
 *   - Will not export any table containing personal, authentication, payment, banking,
 *     or customer-specific information; those tables are not in the allowlist.
 *   - Aborts if any exported row contains a value matching a known-sensitive column name
 *     (defence-in-depth on top of the allowlist).
 *   - Requires --prod flag to read from production; without it defaults to the dev project.
 *   - When targeting production: requires PROD_SUPABASE_URL and PROD_SERVICE_KEY env vars
 *     (separate from dev creds) so production and dev credentials stay isolated.
 *   - Never prints secret values.
 *   - Does NOT alter any project in any way.
 *
 * Usage:
 *   node scripts/export-reference-data.mjs               # export from dev DB (safe default)
 *   node scripts/export-reference-data.mjs --prod        # export from production (needs PROD_SERVICE_KEY)
 *   node scripts/export-reference-data.mjs --dry-run     # print SQL to stdout without writing
 *
 * Output: supabase/seed/reference/pricing_export.sql
 *
 * NOTE: The static reference fixture at supabase/seed/reference/pricing.sql is derived
 * from the @shalean/pricing static config and is safe to use without running this script.
 * Run this script when you want to snapshot live DB pricing into a reproducible SQL fixture.
 */

import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const { createClient } = require("@supabase/supabase-js");

// Production project ref is sourced from SUPABASE_PROD_REF env var (never hardcoded)
// so that scanning tools see no credential-adjacent identifiers in committed code.
const PROD_REF = (process.env.SUPABASE_PROD_REF || "").trim();

// ──────────────────────────────────────────────────────────────────────────────
// EXPLICIT ALLOWLIST — only these tables and these exact columns are fetched.
// Any table or column not listed here is never accessed by this script.
// ──────────────────────────────────────────────────────────────────────────────

/** Each entry is { table, columns: string[], filter? } */
const EXPORT_ALLOWLIST = [
  {
    table: "pricing_services",
    columns: [
      "slug", "name", "base_price",
      "price_per_bedroom", "price_per_bathroom", "price_per_extra_room",
      "min_hours", "max_hours",
      "duration_base", "duration_per_bedroom", "duration_per_bathroom", "duration_per_extra_room",
      "is_active", "sort_order",
    ],
    conflictKey: "slug",
  },
  {
    table: "pricing_extras",
    columns: [
      "slug", "name", "description", "price",
      "service_type", "is_popular", "is_active", "sort_order",
    ],
    conflictKey: "slug",
  },
  {
    table: "pricing_booking_config",
    columns: ["id", "config"],
    filter: { col: "id", val: "default" },
    conflictKey: "id",
  },
  {
    table: "services",
    columns: [
      "id", "slug", "title", "description",
      "starting_price", "features", "sort_order", "is_active",
    ],
    conflictKey: "id",
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// DEFENCE-IN-DEPTH: columns that must never appear in any exported row,
// even if (somehow) they slip through the allowlist above.
// ──────────────────────────────────────────────────────────────────────────────

// Defence-in-depth: column names that are unmistakably personal/sensitive and
// must never appear in any export row. Uses precise identifiers (not "name",
// which is shared by config tables like pricing_services.name = "Regular Cleaning").
const SENSITIVE_COLUMN_NAMES = new Set([
  "email", "phone", "phone_number", "phone_e164",
  "auth_user_id", "user_id", "customer_id",
  "customer_email", "customer_phone", "customer_name",
  "billing_email",
  "paystack_reference", "paystack_authorization_code",
  "account_number", "bank_code", "bank_name", "recipient_code",
  "access_token", "refresh_token", "service_role_key", "anon_key",
  "zoho_invoice_id", "zoho_invoice_number", "zoho_integration_id",
  "full_name",
]);

function checkForSensitiveColumns(table, rows) {
  for (const row of rows) {
    for (const col of Object.keys(row)) {
      if (SENSITIVE_COLUMN_NAMES.has(col.toLowerCase())) {
        throw new Error(
          `SAFETY VIOLATION: exported column '${col}' from '${table}' matches a sensitive column name. ` +
          `Remove '${col}' from the allowlist or verify it is safe.`,
        );
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// SQL generation
// ──────────────────────────────────────────────────────────────────────────────

function escapeValue(v) {
  if (v == null) return "NULL";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `ARRAY[${v.map((e) => escapeValue(e)).join(", ")}]::text[]`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

function buildUpsertSQL(entry, rows) {
  if (!rows || rows.length === 0) return `-- ${entry.table}: 0 rows\n\n`;
  const exportedCols = entry.columns.filter((c) => c in rows[0]);
  const valueLines = rows.map((row) => {
    const vals = exportedCols.map((c) => escapeValue(row[c]));
    return `  (${vals.join(", ")})`;
  });
  return (
    `-- ${entry.table}: ${rows.length} rows (columns: ${exportedCols.join(", ")})\n` +
    `INSERT INTO public.${entry.table} (\n  ${exportedCols.join(", ")}\n) VALUES\n` +
    valueLines.join(",\n") + "\n" +
    `ON CONFLICT (${entry.conflictKey}) DO UPDATE SET\n` +
    exportedCols
      .filter((c) => c !== entry.conflictKey)
      .map((c) => `  ${c} = EXCLUDED.${c}`)
      .join(",\n") +
    ";\n\n"
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const useProd = args.includes("--prod");
  const dryRun  = args.includes("--dry-run");

  // When --prod is passed, use separate PROD_* env vars to keep creds isolated
  const url = useProd
    ? (process.env.PROD_SUPABASE_URL ?? "")
    : (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const serviceKey = useProd
    ? (process.env.PROD_SERVICE_KEY ?? "")
    : (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");

  if (!url || !serviceKey) {
    if (useProd) {
      console.error("ERROR: --prod requires PROD_SUPABASE_URL and PROD_SERVICE_KEY env vars.");
      console.error("       Do NOT reuse dev creds for production access.");
    } else {
      console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    }
    process.exit(1);
  }

  const ref = url.match(/https:\/\/([^.]+)\.supabase/)?.[1] ?? "unknown";

  // Safety: if not passing --prod but URL matches the declared production ref, refuse.
  // PROD_REF is read from SUPABASE_PROD_REF env var (never hardcoded in source).
  if (PROD_REF && ref === PROD_REF && !useProd) {
    console.error(`ERROR: NEXT_PUBLIC_SUPABASE_URL points at the declared production project.`);
    console.error("       Pass --prod (with separate PROD_SUPABASE_URL / PROD_SERVICE_KEY) to export from production.");
    console.error("       Or update NEXT_PUBLIC_SUPABASE_URL to point at a non-production project.");
    process.exit(1);
  }

  const source = useProd ? `PRODUCTION (${ref}) — READ-ONLY` : `dev/staging (${ref})`;
  console.log(`[export-reference-data] source=${source}`);
  console.log("[export-reference-data] Allowlisted tables:", EXPORT_ALLOWLIST.map((e) => e.table).join(", "));

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const parts = [
    `-- =============================================================================\n`,
    `-- Reference data export — generated by scripts/export-reference-data.mjs\n`,
    `-- Source project: ${ref}${useProd ? " (PRODUCTION — read-only)" : " (dev/staging)"}\n`,
    `-- Generated: ${new Date().toISOString()}\n`,
    `-- Tables: ${EXPORT_ALLOWLIST.map((e) => e.table).join(", ")}\n`,
    `-- SAFE TO COMMIT: no personal, auth, payment, or banking data.\n`,
    `-- Columns exported per table are explicit (allowlist); no wildcard SELECT used.\n`,
    `-- =============================================================================\n\nBEGIN;\n\n`,
  ];

  for (const entry of EXPORT_ALLOWLIST) {
    let query = client
      .from(entry.table)
      .select(entry.columns.join(", "))  // only the allowlisted columns — no SELECT *
      .limit(500);

    if (entry.filter) {
      query = query.eq(entry.filter.col, entry.filter.val);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`  [skip] ${entry.table}: ${error.message}`);
      parts.push(`-- ${entry.table}: skipped (${error.message})\n\n`);
      continue;
    }

    const rows = data ?? [];
    // Defence-in-depth: verify no sensitive columns slipped through
    checkForSensitiveColumns(entry.table, rows);

    console.log(`  ${entry.table}: ${rows.length} rows`);
    parts.push(buildUpsertSQL(entry, rows));
  }

  parts.push("COMMIT;\n");
  const sql = parts.join("");

  if (dryRun) {
    console.log("\n[dry-run] SQL preview (first 2000 chars):\n");
    console.log(sql.slice(0, 2000) + (sql.length > 2000 ? "\n... (truncated)" : ""));
  } else {
    const outDir = resolve(root, "supabase/seed/reference");
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, "pricing_export.sql");
    writeFileSync(outPath, sql, "utf8");
    console.log(`\n[export-reference-data] Written: ${outPath}`);
  }

  console.log(`\n[export-reference-data] DONE.`);
  console.log("  No production mutations performed.");
  console.log("  No personal, auth, payment, or banking data exported.");
  console.log(`  All exports were: ${EXPORT_ALLOWLIST.map((e) => e.table).join(", ")}`);
}

main().catch((err) => {
  console.error("[export-reference-data] FAILED:", err.message || err);
  process.exit(1);
});
