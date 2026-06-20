/**
 * Audit outbound customer email queues before rotating RESEND_API_KEY.
 * Usage: node scripts/audit-email-queue.mjs
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
  if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase env");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });
const now = new Date();
const nowIso = now.toISOString();
const todayStart = new Date(now);
todayStart.setUTCHours(0, 0, 0, 0);

function fmt(d) {
  return d ? String(d).slice(0, 19).replace("T", " ") : "—";
}

console.log("=== Customer email queue audit ===");
console.log(`Now (UTC): ${nowIso}\n`);

// --- booking_lifecycle_jobs (reminder / review / rebook emails) ---
const { data: lifecycleAll, error: lcErr } = await admin
  .from("booking_lifecycle_jobs")
  .select("id, job_type, status, scheduled_for, sent_at, attempts, last_error, customer_email, booking_id, created_at")
  .in("status", ["pending", "failed"])
  .order("scheduled_for", { ascending: true })
  .limit(5000);

if (lcErr) {
  console.error("booking_lifecycle_jobs error:", lcErr.message);
} else {
  const rows = lifecycleAll ?? [];
  const dueNow = rows.filter((r) => r.status === "pending" && r.scheduled_for && r.scheduled_for <= nowIso);
  const pendingFuture = rows.filter((r) => r.status === "pending" && (!r.scheduled_for || r.scheduled_for > nowIso));
  const failedRetryable = rows.filter((r) => r.status === "failed" && (r.attempts ?? 0) < 5);
  const failedTerminal = rows.filter((r) => r.status === "failed" && (r.attempts ?? 0) >= 5);

  const byType = (list) => {
    const m = {};
    for (const r of list) m[r.job_type] = (m[r.job_type] ?? 0) + 1;
    return m;
  };

  console.log("--- booking_lifecycle_jobs (lifecycle emails) ---");
  console.log(`Due now (pending, scheduled_for <= now): ${dueNow.length}`);
  console.log("  by type:", byType(dueNow));
  console.log(`Pending future (not yet due): ${pendingFuture.length}`);
  console.log("  by type:", byType(pendingFuture));
  console.log(`Failed but retryable (attempts < 5): ${failedRetryable.length}`);
  console.log("  by type:", byType(failedRetryable));
  console.log(`Failed terminal (attempts >= 5, will NOT auto-send): ${failedTerminal.length}`);

  const dueTodayOrPast = rows.filter(
    (r) =>
      (r.status === "pending" || r.status === "failed") &&
      r.scheduled_for &&
      r.scheduled_for <= nowIso,
  );
  console.log(`\nTotal backlog (due today or earlier, not sent): ${dueTodayOrPast.length}`);

  if (dueTodayOrPast.length > 0) {
    console.log("\nOldest 15 due backlog rows:");
    for (const r of dueTodayOrPast.slice(0, 15)) {
      console.log(
        `  ${fmt(r.scheduled_for)} | ${r.job_type} | ${r.status} | attempts=${r.attempts ?? 0} | ${r.customer_email} | booking=${String(r.booking_id ?? "").slice(0, 8)}…`,
      );
      if (r.last_error) console.log(`    last_error: ${String(r.last_error).slice(0, 80)}`);
    }
  }

  const sampleErrors = {};
  for (const r of [...dueNow, ...failedRetryable]) {
    const e = String(r.last_error ?? "none").slice(0, 60);
    sampleErrors[e] = (sampleErrors[e] ?? 0) + 1;
  }
  if (Object.keys(sampleErrors).length) {
    console.log("\nTop last_error in due/retryable queue:");
    for (const [e, n] of Object.entries(sampleErrors).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
      console.log(`  ${n}× ${e}`);
    }
  }
}

// --- deferred payment link emails ---
const { data: deferred, error: defErr } = await admin
  .from("conversion_deferred_payment_link_emails")
  .select("id, booking_id, scheduled_for, sent_at, attempts, last_error, created_at")
  .is("sent_at", null)
  .order("scheduled_for", { ascending: true })
  .limit(500);

if (defErr) {
  console.log("\n--- conversion_deferred_payment_link_emails ---");
  console.log("(table unavailable or error:", defErr.message + ")");
} else {
  const due = (deferred ?? []).filter((r) => !r.scheduled_for || r.scheduled_for <= nowIso);
  console.log(`\n--- conversion_deferred_payment_link_emails ---`);
  console.log(`Unsent total: ${deferred?.length ?? 0}`);
  console.log(`Due now: ${due.length}`);
  if (due.length > 0) {
    for (const r of due.slice(0, 10)) {
      console.log(`  ${fmt(r.scheduled_for)} | booking=${String(r.booking_id ?? "").slice(0, 8)}… | attempts=${r.attempts ?? 0}`);
    }
  }
}

// --- recent failed notification_logs (email channel, not yet lifecycle) ---
const since7d = new Date(now.getTime() - 7 * 86400000).toISOString();
const { count: failedEmailLogs } = await admin
  .from("notification_logs")
  .select("id", { count: "exact", head: true })
  .eq("channel", "email")
  .eq("status", "failed")
  .gte("created_at", since7d);

console.log(`\n--- notification_logs (email failures, last 7d) ---`);
console.log(`Failed email log rows: ${failedEmailLogs ?? 0} (already attempted; not a send queue)`);

console.log("\n=== Summary ===");
const backlog =
  (lifecycleAll ?? []).filter(
    (r) =>
      (r.status === "pending" || (r.status === "failed" && (r.attempts ?? 0) < 5)) &&
      r.scheduled_for &&
      r.scheduled_for <= nowIso,
  ).length + ((deferred ?? []).filter((r) => !r.scheduled_for || r.scheduled_for <= nowIso).length ?? 0);

console.log(
  backlog > 0
    ? `⚠ ${backlog} customer email(s) will attempt to send once RESEND_API_KEY is fixed (lifecycle + deferred queues).`
    : "✓ No due email backlog in lifecycle/deferred queues.",
);
console.log(
  "Note: fixing the key will NOT bulk-resend terminal failed jobs (attempts >= 5); those need manual review.",
);
