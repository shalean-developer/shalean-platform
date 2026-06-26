import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type CustomerProfileContactInput,
  normalizeCustomerProfileContactFields,
} from "@/lib/customer/customerProfileContactFields";

const PROFILE_DEFAULTS = {
  tier: "regular",
  billing_type: "per_booking",
  schedule_type: "on_demand",
  booking_count: 0,
  total_spent_cents: 0,
} as const;

/**
 * Upserts canonical customer contact fields on `user_profiles`.
 * Only supplied contact fields are written; omitted fields leave existing values unchanged.
 */
export async function upsertCustomerProfileContact(
  admin: SupabaseClient,
  params: {
    userId: string;
    contact: CustomerProfileContactInput;
    role?: "customer" | "admin" | "cleaner" | null;
  },
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const userId = String(params.userId ?? "").trim();
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return { ok: false, error: "invalid_user_id" };
  }

  const normalized = normalizeCustomerProfileContactFields(params.contact);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (normalized.full_name) patch.full_name = normalized.full_name;
  if (params.contact.billingEmail !== undefined) {
    patch.billing_email =
      params.contact.billingEmail === null || String(params.contact.billingEmail).trim() === ""
        ? null
        : normalized.billing_email ?? null;
  } else if (normalized.billing_email) {
    patch.billing_email = normalized.billing_email;
  }
  if (normalized.phone) patch.phone = normalized.phone;
  if (normalized.phone_e164) patch.phone_e164 = normalized.phone_e164;
  if (normalized.preferred_notification_channel) {
    patch.preferred_notification_channel = normalized.preferred_notification_channel;
  }
  if (params.role) patch.role = params.role;

  const { data: existing, error: readErr } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (existing?.id) {
    if (Object.keys(patch).length <= 1) return { ok: true, created: false };
    const { error: upErr } = await admin.from("user_profiles").update(patch).eq("id", userId);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true, created: false };
  }

  const { error: insErr } = await admin.from("user_profiles").insert({
    id: userId,
    ...PROFILE_DEFAULTS,
    role: params.role ?? "customer",
    ...patch,
  });
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, created: true };
}
