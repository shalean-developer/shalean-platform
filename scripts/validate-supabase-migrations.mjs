#!/usr/bin/env node
/**
 * Validates active Supabase migration filenames under supabase/migrations.
 *
 * Rules:
 * - Filenames must match ^\d{14}_[a-z0-9_]+\.sql$
 * - 14-digit timestamps must be unique
 * - Non-SQL or invalid-named files in the active directory are rejected
 *
 * supabase/migrations-legacy is intentionally ignored (archive only; not replayed).
 *
 * Usage: node scripts/validate-supabase-migrations.mjs
 * Exit 0 on success, 1 on failure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const ACTIVE_DIR = path.join(REPO_ROOT, "supabase", "migrations");
const LEGACY_DIR = path.join(REPO_ROOT, "supabase", "migrations-legacy");

/** Official Supabase CLI migration name: YYYYMMDDHHmmss_snake_case.sql */
const ACTIVE_NAME_RE = /^\d{14}_[a-z0-9_]+\.sql$/;

function main() {
  const errors = [];
  const warnings = [];

  if (!fs.existsSync(ACTIVE_DIR)) {
    errors.push(`Active migrations directory missing: ${path.relative(REPO_ROOT, ACTIVE_DIR)}`);
    printReport({ errors, warnings, files: [] });
    process.exit(1);
  }

  if (fs.existsSync(LEGACY_DIR)) {
    warnings.push(
      `Ignoring archive directory ${path.relative(REPO_ROOT, LEGACY_DIR)} (not used for active replay).`,
    );
  }

  const entries = fs.readdirSync(ACTIVE_DIR, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();

  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  for (const d of dirs) {
    errors.push(
      `Unexpected subdirectory in active migrations (flatten required): supabase/migrations/${d}/`,
    );
  }

  if (files.length === 0) {
    errors.push("Active migrations directory is empty; expected at least the production baseline.");
  }

  const byTimestamp = new Map();

  for (const name of files) {
    if (!name.endsWith(".sql")) {
      errors.push(`Non-SQL file in active migrations: ${name}`);
      continue;
    }

    if (!ACTIVE_NAME_RE.test(name)) {
      errors.push(
        `Invalid migration filename (must match ^\\d{14}_[a-z0-9_]+\\.sql$): ${name}`,
      );
      continue;
    }

    const ts = name.slice(0, 14);
    if (!byTimestamp.has(ts)) byTimestamp.set(ts, []);
    byTimestamp.get(ts).push(name);
  }

  for (const [ts, names] of [...byTimestamp.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (names.length > 1) {
      errors.push(
        `Duplicate migration timestamp ${ts}:\n  - ${names.join("\n  - ")}`,
      );
    }
  }

  printReport({ errors, warnings, files, byTimestamp });

  if (errors.length > 0) {
    process.exit(1);
  }

  console.log("db:migrations:validate PASS");
  process.exit(0);
}

function printReport({ errors, warnings, files, byTimestamp }) {
  console.log("Supabase active migration filename governance");
  console.log(`Active dir: ${path.relative(REPO_ROOT, ACTIVE_DIR)}`);
  console.log(`SQL files:  ${files.length}`);
  if (byTimestamp) {
    console.log(`Timestamps: ${byTimestamp.size} unique`);
  }
  console.log("");

  for (const w of warnings) {
    console.log(`WARN  ${w}`);
  }
  if (warnings.length) console.log("");

  if (errors.length === 0) {
    for (const f of files) {
      console.log(`OK    ${f}`);
    }
    return;
  }

  console.log(`FAIL  ${errors.length} issue(s):\n`);
  for (const e of errors) {
    console.log(`  • ${e}`);
  }
  console.log("");
}

main();
