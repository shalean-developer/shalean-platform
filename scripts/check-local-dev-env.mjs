#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const envPath = resolve(root, "apps/web/.env.local");

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

function fail(message) {
  console.error(`[local-dev-check] ERROR: ${message}`);
  process.exit(1);
}

if (!existsSync(envPath)) {
  fail("apps/web/.env.local is missing. Copy apps/web/.env.local.example and fill it with keys from `npm run dev:local:env`.");
}

const fileEnv = parseEnv(readFileSync(envPath, "utf8"));
const env = { ...fileEnv, ...process.env };
const appEnv = (env.SHALEAN_APP_ENV || "").trim().toLowerCase();
if (appEnv !== "local") {
  fail(`SHALEAN_APP_ENV must be local for the standard development workflow; got '${appEnv || "(unset)"}'.`);
}

const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").trim();
if (!supabaseUrl) fail("NEXT_PUBLIC_SUPABASE_URL is missing.");

let parsed;
try {
  parsed = new URL(supabaseUrl);
} catch {
  fail(`Supabase URL is invalid: ${supabaseUrl}`);
}

if (parsed.hostname.endsWith(".supabase.co")) {
  fail("Hosted Supabase URLs are forbidden for local development. Use the local CLI stack only.");
}

if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
  fail(`Local Supabase must use localhost/127.0.0.1; got '${parsed.hostname}'.`);
}

if (parsed.port !== "54321") {
  fail(`Expected local Supabase API port 54321; got '${parsed.port || "default"}'.`);
}

if (!(env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim()) {
  fail("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Get it from `npm run dev:local:env`.");
}

if (!(env.SUPABASE_SERVICE_ROLE_KEY || "").trim()) {
  fail("SUPABASE_SERVICE_ROLE_KEY is missing. Get it from `npm run dev:local:env`.");
}

console.log("[local-dev-check] OK: local-only Supabase configuration verified.");
