/**
 * Bulk-send monthly invoicing announcement (Resend).
 *
 * Usage (from apps/web):
 *   npm run announce:monthly-invoicing                    # dry-run, monthly customers
 *   npm run announce:monthly-invoicing -- --apply         # send to monthly customers
 *   npm run announce:monthly-invoicing -- --all-customers # include per-booking customers too
 *   npm run announce:monthly-invoicing -- --test-to=you@example.com --apply
 *   npm run announce:monthly-invoicing -- --limit=5 --apply
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sendMonthlyInvoicingAnnouncementEmail } from "../lib/email/monthlyInvoicingAnnouncementEmail";
import { billingEmailFromLoginEmail } from "../lib/customer/customerProfileContactFields";
import { pickBillingEmail } from "../lib/zoho/shaleanBillingContactEmail";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");
const allCustomers = process.argv.includes("--all-customers");
const testToArg = process.argv.find((a) => a.startsWith("--test-to="));
const testTo = testToArg?.slice("--test-to=".length).trim().toLowerCase() || null;
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.slice("--limit=".length)) || 0) : null;

const THROTTLE_MS = 600;

type Recipient = {
  userId: string;
  email: string;
  firstName: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function firstNameFromFull(fullName: string | null | undefined): string | null {
  const n = String(fullName ?? "").trim();
  if (!n) return null;
  return n.split(/\s+/)[0] ?? n;
}

async function resolveAuthEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email) return null;
  return pickBillingEmail([billingEmailFromLoginEmail(data.user.email), data.user.email]);
}

async function loadRecipients(admin: SupabaseClient): Promise<Recipient[]> {
  let query = admin.from("user_profiles").select("id, full_name, billing_email, billing_type");
  if (!allCustomers) {
    query = query.eq("billing_type", "monthly");
  }

  const { data: profiles, error } = await query;
  if (error) throw new Error(error.message);

  const byEmail = new Map<string, Recipient>();

  for (const raw of profiles ?? []) {
    const row = raw as {
      id: string;
      full_name: string | null;
      billing_email: string | null;
    };
    const authEmail = await resolveAuthEmail(admin, row.id);
    const email = pickBillingEmail([row.billing_email, authEmail]);
    if (!email) continue;

    const existing = byEmail.get(email);
    const firstName = firstNameFromFull(row.full_name);
    if (!existing) {
      byEmail.set(email, { userId: row.id, email, firstName });
      continue;
    }
    if (!existing.firstName && firstName) {
      byEmail.set(email, { ...existing, firstName });
    }
  }

  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY) {
    console.error("Missing RESEND_API_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  if (testTo) {
    console.log(apply ? `Sending test to ${testTo}` : `[dry-run] would send test to ${testTo}`);
    if (!apply) process.exit(0);
    const res = await sendMonthlyInvoicingAnnouncementEmail({ to: testTo, firstName: "Test" });
    if (!res.sent) {
      console.error("Test send failed:", res.error);
      process.exit(1);
    }
    console.log("Test sent OK.");
    process.exit(0);
  }

  const recipients = await loadRecipients(admin);
  const batch = limit ? recipients.slice(0, limit) : recipients;

  console.log(apply ? "Mode: APPLY (sending via Resend)" : "Mode: DRY-RUN");
  console.log(
    `Audience: ${allCustomers ? "all customers with email" : "monthly billing customers only"} — ${batch.length} recipient(s)`,
  );

  let sent = 0;
  let failed = 0;

  for (const r of batch) {
    if (!apply) {
      console.log(`[dry-run] ${r.email} — Hi ${r.firstName ?? "there"}`);
      continue;
    }

    const res = await sendMonthlyInvoicingAnnouncementEmail({
      to: r.email,
      firstName: r.firstName,
    });

    if (res.sent) {
      sent += 1;
      console.log(`sent ${r.email}`);
    } else if (res.classification === "permanent_config") {
      console.error("Aborting — Resend config error:", res.error);
      process.exit(1);
    } else {
      failed += 1;
      console.error(`failed ${r.email}: ${res.error}`);
    }

    await sleep(THROTTLE_MS);
  }

  if (!apply) {
    console.log(`Dry-run complete. Re-run with --apply to send ${batch.length} email(s).`);
    process.exit(0);
  }

  console.log({ sent, failed, total: batch.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
