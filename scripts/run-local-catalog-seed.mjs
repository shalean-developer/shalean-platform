#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = process.cwd();
const node = process.execPath;
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const envCheck = resolve(root, "scripts/check-local-dev-env.mjs");
const seedPath = resolve(root, "supabase/seeds/nonprod/env03_catalog_and_fixtures.sql");

function fail(message) {
  console.error(`[local-catalog-seed] ERROR: ${message}`);
  process.exit(1);
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1] ?? "";

    if (lineComment) {
      current += ch;
      if (ch === "\n") lineComment = false;
      i += 1;
      continue;
    }

    if (blockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 2;
        blockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }

    if (singleQuoted) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") singleQuoted = false;
      i += 1;
      continue;
    }

    if (doubleQuoted) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') doubleQuoted = false;
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") {
      current += ch + next;
      i += 2;
      lineComment = true;
      continue;
    }

    if (ch === "/" && next === "*") {
      current += ch + next;
      i += 2;
      blockComment = true;
      continue;
    }

    if (ch === "'") {
      singleQuoted = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      doubleQuoted = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === "$") {
      const match = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  return statements;
}

function runLocalQueryFile(filePath) {
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec || process.env.COMSPEC || "cmd.exe";
    // SQL is passed through a temporary file, not interpolated into the shell command.
    // Double quotes around the path are sufficient for the generated temp path.
    const command = `npx supabase db query --local -f "${filePath}"`;
    execFileSync(comspec, ["/d", "/s", "/c", command], {
      cwd: root,
      stdio: "inherit",
    });
    return;
  }

  execFileSync(npx, ["supabase", "db", "query", "--local", "-f", filePath], {
    cwd: root,
    stdio: "inherit",
  });
}

try {
  execFileSync(node, [envCheck], { cwd: root, stdio: "inherit" });
} catch {
  fail("local environment validation failed; start/configure local Supabase first.");
}

let sql;
try {
  sql = readFileSync(seedPath, "utf8");
} catch (error) {
  fail(`unable to read ${seedPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const statements = splitSqlStatements(sql).filter((statement) => {
  const normalized = statement
    .replace(/--[^\n]*(?:\n|$)/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  return normalized !== "BEGIN" && normalized !== "COMMIT";
});

if (statements.length === 0) fail("seed file contained no executable statements.");

const tempRoot = mkdtempSync(join(tmpdir(), "shalean-local-catalog-"));
console.log(`[local-catalog-seed] Applying ${statements.length} statements to local Supabase...`);

try {
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    const preview = statement
      .replace(/--[^\n]*(?:\n|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90);

    console.log(`[local-catalog-seed] ${index + 1}/${statements.length}: ${preview}${preview.length === 90 ? "..." : ""}`);

    const statementPath = join(tempRoot, `statement-${String(index + 1).padStart(2, "0")}.sql`);
    writeFileSync(statementPath, `${statement};\n`, "utf8");

    try {
      runLocalQueryFile(statementPath);
    } catch {
      fail(`statement ${index + 1} failed. The seed is idempotent; fix the error and rerun this command.`);
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log("[local-catalog-seed] OK: local catalogue seed applied successfully.");
