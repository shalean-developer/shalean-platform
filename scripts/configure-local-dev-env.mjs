#!/usr/bin/env node
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const targetPath = resolve(root, "apps/web/.env.local");
const examplePath = resolve(root, "apps/web/.env.local.example");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function setEnvLine(text, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}=.*$`, "m");
  const line = `${key}=${value}`;
  return pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
}

let statusText;
try {
  statusText = execFileSync(npx, ["supabase", "status", "-o", "env"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
} catch {
  console.error("[local-dev-env] ERROR: unable to read local Supabase status. Run `npm run dev:local:start` first.");
  process.exit(1);
}

const local = parseEnv(statusText);
const apiUrl = local.API_URL || local.SUPABASE_URL || "";
const anonKey = local.ANON_KEY || "";
const serviceRoleKey = local.SERVICE_ROLE_KEY || "";

let parsed;
try {
  parsed = new URL(apiUrl);
} catch {
  console.error("[local-dev-env] ERROR: local Supabase API URL was not returned by the CLI.");
  process.exit(1);
}

if (!["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.port !== "54321") {
  console.error("[local-dev-env] ERROR: Supabase CLI did not return the expected local API endpoint.");
  process.exit(1);
}

if (!anonKey || !serviceRoleKey) {
  console.error("[local-dev-env] ERROR: Supabase CLI did not return required local keys.");
  process.exit(1);
}

let text = existsSync(targetPath)
  ? readFileSync(targetPath, "utf8")
  : readFileSync(examplePath, "utf8");

const replacements = {
  SHALEAN_APP_ENV: "local",
  NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  SUPABASE_URL: apiUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  SUPABASE_SERVICE_KEY: serviceRoleKey,
};

for (const [key, value] of Object.entries(replacements)) {
  text = setEnvLine(text, key, value);
}

writeFileSync(targetPath, text, { encoding: "utf8", mode: 0o600 });
try {
  if (process.platform !== "win32") chmodSync(targetPath, 0o600);
} catch {
  // Best-effort hardening; file remains gitignored even if chmod is unsupported.
}

console.log("[local-dev-env] OK: wrote local Supabase configuration to apps/web/.env.local without printing secrets.");
