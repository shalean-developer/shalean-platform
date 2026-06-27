/**
 * Sync CRON_SECRET from apps/web/.env.local → public.cron_http_targets (production Supabase).
 * Usage: node scripts/sync-cron-secret-to-supabase.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  if (!process.env[k]) process.env[k] = v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.CRON_SECRET?.trim();

if (!url || !key) {
  console.error("Missing Supabase env in .env.local");
  process.exit(1);
}
if (!secret) {
  console.error("CRON_SECRET missing from .env.local");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data: before } = await admin
  .from("cron_http_targets")
  .select("app_base_url,cron_secret,updated_at")
  .eq("singleton", true)
  .maybeSingle();

if (!before) {
  console.error("cron_http_targets row missing — apply migration 20261005 first");
  process.exit(1);
}

const wasPlaceholder =
  before.cron_secret === "YOUR_CRON_SECRET" ||
  before.cron_secret.includes("same value as Vercel");

console.log("Before:", before.app_base_url, wasPlaceholder ? "(PLACEHOLDER SECRET)" : "(custom secret)");

const { data, error } = await admin
  .from("cron_http_targets")
  .update({ cron_secret: secret, updated_at: new Date().toISOString() })
  .eq("singleton", true)
  .select("app_base_url,updated_at")
  .maybeSingle();

if (error) {
  console.error("Update failed:", error.message);
  process.exit(1);
}

console.log("Updated cron_http_targets at", data?.updated_at);

const { data: after } = await admin
  .from("cron_http_targets")
  .select("cron_secret")
  .eq("singleton", true)
  .maybeSingle();

console.log("Secret matches local .env.local:", after?.cron_secret === secret);
