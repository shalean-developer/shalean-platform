#!/usr/bin/env node
/**
 * Execute a multi-statement SQL file against the local Supabase Postgres
 * container only. This avoids Supabase CLI prepared-statement limitations for
 * seed files containing BEGIN/COMMIT and multiple SQL statements.
 *
 * Safety:
 * - requires Docker
 * - selects only a Supabase DB container whose host port maps 54322 -> 5432
 * - never reads or accepts a hosted database URL or credential
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const sqlFileArg = process.argv[2];
if (!sqlFileArg) {
  console.error("[local-sql] Usage: node scripts/run-local-supabase-sql.mjs <sql-file>");
  process.exit(1);
}

const sqlPath = resolve(process.cwd(), sqlFileArg);
if (!existsSync(sqlPath)) {
  console.error(`[local-sql] SQL file not found: ${sqlPath}`);
  process.exit(1);
}

const dockerPs = spawnSync(
  "docker",
  ["ps", "--format", "{{.Names}}\t{{.Ports}}"],
  { encoding: "utf8" },
);

if (dockerPs.error || dockerPs.status !== 0) {
  console.error("[local-sql] Docker is unavailable or not running.");
  if (dockerPs.stderr) process.stderr.write(dockerPs.stderr);
  process.exit(1);
}

const candidates = dockerPs.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [name, ...portsParts] = line.split("\t");
    return { name, ports: portsParts.join("\t") };
  })
  .filter(
    ({ name, ports }) =>
      name.startsWith("supabase_db_") &&
      /(?:^|[,\s])(?:0\.0\.0\.0:|127\.0\.0\.1:|\[::\]:)?54322->5432\/tcp/.test(ports),
  );

if (candidates.length !== 1) {
  console.error(
    `[local-sql] Expected exactly one local Supabase DB container mapped to port 54322; found ${candidates.length}.`,
  );
  if (candidates.length > 0) {
    for (const candidate of candidates) {
      console.error(`  - ${candidate.name}: ${candidate.ports}`);
    }
  }
  console.error("[local-sql] Run `npm run dev:local:status` and stop other local Supabase projects if needed.");
  process.exit(1);
}

const [{ name: containerName }] = candidates;
const sql = readFileSync(sqlPath, "utf8");

console.log(`[local-sql] Target verified: ${containerName} via local Postgres port 54322`);
console.log(`[local-sql] Executing: ${sqlFileArg}`);

const child = spawn(
  "docker",
  [
    "exec",
    "-i",
    containerName,
    "psql",
    "--set",
    "ON_ERROR_STOP=1",
    "--username",
    "postgres",
    "--dbname",
    "postgres",
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

child.stdin.end(sql);

child.on("error", (error) => {
  console.error(`[local-sql] Failed to start psql: ${error.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`[local-sql] SQL execution failed with exit code ${code}.`);
    process.exit(code ?? 1);
  }
  console.log("[local-sql] SQL execution completed successfully.");
});
