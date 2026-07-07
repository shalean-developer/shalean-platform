/**
 * Backfill user_profiles.billing_email / phone / full_name from auth + latest bookings.
 *
 * From `apps/web`:
 *   npm run backfill:customer-profile-contacts           # dry-run
 *   npm run backfill:customer-profile-contacts -- --apply
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { readCustomerEmailFromBookingSnapshot } from "@/lib/admin/adminBookingCustomerContact";
import {
  billingEmailFromLoginEmail,
  normalizeCustomerProfileContactFields,
} from "@/lib/customer/customerProfileContactFields";
import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");

type ProfileRow = {
  id: string;
  full_name: string | null;
  billing_email: string | null;
  phone: string | null;
  phone_e164: string | null;
};

function readMeta(meta: unknown): { fullName: string | null; phone: string | null } {
  if (!meta || typeof meta !== "object") return { fullName: null, phone: null };
  const m = meta as Record<string, unknown>;
  const fullName =
    (typeof m.full_name === "string" && m.full_name.trim()) ||
    (typeof m.name === "string" && m.name.trim()) ||
    null;
  const phone =
    (typeof m.phone === "string" && m.phone.trim()) ||
    (typeof m.whatsapp === "string" && m.whatsapp.trim()) ||
    null;
  return { fullName, phone };
}

async function latestBookingHints(
  admin: SupabaseClient,
  userId: string,
): Promise<{ email: string | null; name: string | null; phone: string | null }> {
  const { data } = await admin
    .from("bookings")
    .select("customer_email, customer_name, customer_phone, booking_snapshot")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(5);

  for (const row of data ?? []) {
    const b = row as {
      customer_email?: string | null;
      customer_name?: string | null;
      customer_phone?: string | null;
      booking_snapshot?: unknown;
    };
    const email = pickBillingEmail([
      b.customer_email,
      readCustomerEmailFromBookingSnapshot(b.booking_snapshot),
    ]);
    const name = String(b.customer_name ?? "").trim() || null;
    const phone = String(b.customer_phone ?? "").trim() || null;
    if (email || name || phone) return { email, name, phone };
  }
  return { email: null, name: null, phone: null };
}

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN");

  const { data: profiles, error } = await admin
    .from("user_profiles")
    .select("id, full_name, billing_email, phone, phone_e164")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;

  for (const raw of profiles ?? []) {
    scanned += 1;
    const row = raw as ProfileRow;
    const needsBilling = !row.billing_email;
    const needsPhone = !row.phone_e164 && !row.phone;
    const needsName = !String(row.full_name ?? "").trim();
    if (!needsBilling && !needsPhone && !needsName) continue;

    const { data: authData } = await admin.auth.admin.getUserById(row.id);
    const authUser = authData?.user ?? null;
    const meta = readMeta(authUser?.user_metadata);
    const booking = await latestBookingHints(admin, row.id);

    const billingEmail =
      pickBillingEmail([
        row.billing_email,
        booking.email,
        billingEmailFromLoginEmail(authUser?.email ? normalizeEmail(authUser.email) : null),
      ]) ?? null;

    const fullName = String(row.full_name ?? "").trim() || booking.name || meta.fullName || null;
    const phoneRaw = row.phone || row.phone_e164 || booking.phone || meta.phone;

    const normalized = normalizeCustomerProfileContactFields({
      fullName,
      billingEmail,
      phone: phoneRaw,
    });

    const patch: Record<string, unknown> = {};
    if (needsName && normalized.full_name) patch.full_name = normalized.full_name;
    if (needsBilling && normalized.billing_email) patch.billing_email = normalized.billing_email;
    if (needsPhone && normalized.phone) patch.phone = normalized.phone;
    if (needsPhone && normalized.phone_e164) patch.phone_e164 = normalized.phone_e164;

    if (Object.keys(patch).length === 0) continue;
    wouldUpdate += 1;

    if (!apply) {
      console.log(
        `[dry-run] ${row.id.slice(0, 8)} patch=${JSON.stringify(patch)}`,
      );
      continue;
    }

    const { error: upErr } = await admin
      .from("user_profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (upErr) {
      console.error(`${row.id.slice(0, 8)}: ${upErr.message}`);
      continue;
    }
    updated += 1;
    console.log(`${row.id.slice(0, 8)}: updated ${Object.keys(patch).join(", ")}`);
  }

  console.log(`Done. scanned=${scanned} wouldUpdate=${wouldUpdate} updated=${updated}`);
}

void main();
