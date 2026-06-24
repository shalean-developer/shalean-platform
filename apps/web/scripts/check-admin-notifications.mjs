/**
 * Admin notification delivery diagnostics.
 * Usage: node scripts/check-admin-notifications.mjs
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
  process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const emails = (process.env.ADMIN_NOTIFICATION_EMAIL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.log("=== Local env ===\n");
console.log("ADMIN_NOTIFICATION_EMAIL:", emails.length ? emails.join(", ") : "MISSING");
console.log("RESEND_API_KEY:", process.env.RESEND_API_KEY?.trim() ? "set" : "MISSING");

const eventTypes = [
  "customer_quote_request",
  "customer_booking_request",
  "payment_confirmed",
  "sales_quote_accepted",
];

console.log("\n=== notification_logs by event type ===\n");
for (const eventType of eventTypes) {
  const { data } = await admin
    .from("notification_logs")
    .select("status,recipient,error,created_at")
    .eq("event_type", eventType)
    .order("created_at", { ascending: false })
    .limit(5);
  console.log(eventType + ":", data?.length ? data : "none");
}

const { data: recent } = await admin
  .from("notification_logs")
  .select("event_type,status,recipient,error,created_at")
  .eq("role", "admin")
  .order("created_at", { ascending: false })
  .limit(15);

console.log("\n=== Last 15 admin notification_logs ===\n");
for (const r of recent ?? []) {
  console.log(`${r.created_at} | ${r.event_type} | ${r.status} | ${r.recipient} | ${r.error ?? ""}`);
}

const { data: claims } = await admin
  .from("notification_idempotency_claims")
  .select("reference,event_type,created_at")
  .in("event_type", ["customer_quote_request", "customer_booking_request"])
  .order("created_at", { ascending: false })
  .limit(10);

console.log("\n=== Quote/booking idempotency claims ===\n", claims?.length ? claims : "none");

const { data: quotes } = await admin
  .from("sales_documents")
  .select("id,created_at,customer_email,status")
  .eq("source", "customer_request")
  .order("created_at", { ascending: false })
  .limit(5);

console.log("\n=== Recent customer quote requests ===\n", quotes);
