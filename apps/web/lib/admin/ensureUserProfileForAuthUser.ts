import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { inferUserProfileRole, backfillNullProfileRole } from "@/lib/admin/inferUserProfileRole";
import { upsertCustomerProfileContact } from "@/lib/customer/upsertCustomerProfileContact";
import {
  billingEmailFromLoginEmail,
  normalizeCustomerProfileContactFields,
} from "@/lib/customer/customerProfileContactFields";

export type EnsureUserProfileForAuthUserResult = {
  /** Pre-existing or newly inserted profile row. Always present on `ok`. */
  billing_type: string;
  schedule_type: string;
  /** True when the row was created by this call (orphan auth user repair). */
  created: boolean;
};

const DEFAULT_BILLING_TYPE = "per_booking";
const DEFAULT_SCHEDULE_TYPE = "on_demand";

function readMetaFullName(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  const fn = typeof m.full_name === "string" ? m.full_name.trim() : "";
  if (fn) return fn;
  const n = typeof m.name === "string" ? String(m.name).trim() : "";
  return n || null;
}

/**
 * Ensures the auth user has a `user_profiles` row before admin booking create
 * uses them as a customer. Auth users created outside the admin customer flow
 * (e.g. customer self sign-up that never reached `/api/admin/customers`,
 * cleaner accounts that have a customer-side email, or legacy seed data) can
 * be missing from `user_profiles`, which would otherwise reject the booking
 * with `"Select an existing customer."`.
 *
 * Behaviour
 *   * If a row exists, returns its `billing_type` / `schedule_type`.
 *   * If no row exists, inserts a minimal `per_booking` / `on_demand` row
 *     using auth metadata `full_name` / `name` for display, then returns it.
 *   * Never overwrites an existing profile (uses `onConflict: "id"` insert
 *     with `ignoreDuplicates: false` and only sets `updated_at` for new rows;
 *     existing rows are read first and short-circuited).
 *   * Never creates a new auth user. Only operates on the supplied `userId`.
 */
export async function ensureUserProfileForAuthUser(
  admin: SupabaseClient,
  userId: string,
): Promise<EnsureUserProfileForAuthUserResult | { error: string }> {
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return { error: "Invalid user id." };
  }

  const { data: existing, error: readErr } = await admin
    .from("user_profiles")
    .select("billing_type, schedule_type, role")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) return { error: readErr.message };

  if (existing) {
    if (!String((existing as { role?: string | null }).role ?? "").trim()) {
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      await backfillNullProfileRole(admin, userId, authData?.user?.email ?? null);
    }
    return {
      billing_type: String(
        (existing as { billing_type?: string | null }).billing_type ?? DEFAULT_BILLING_TYPE,
      ),
      schedule_type: String(
        (existing as { schedule_type?: string | null }).schedule_type ?? DEFAULT_SCHEDULE_TYPE,
      ),
      created: false,
    };
  }

  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authData?.user?.id) {
    return { error: "Auth user not found." };
  }

  const fullName = readMetaFullName(authData.user.user_metadata);
  const loginEmail = authData.user.email ? String(authData.user.email).trim().toLowerCase() : null;
  const metaPhone =
    authData.user.user_metadata && typeof authData.user.user_metadata === "object"
      ? (authData.user.user_metadata as { phone?: unknown }).phone
      : null;
  const normalized = normalizeCustomerProfileContactFields({
    fullName,
    billingEmail: billingEmailFromLoginEmail(loginEmail),
    phone: typeof metaPhone === "string" ? metaPhone : null,
  });
  const role = await inferUserProfileRole(admin, userId, loginEmail);

  const upserted = await upsertCustomerProfileContact(admin, {
    userId,
    contact: {
      fullName: normalized.full_name,
      billingEmail: normalized.billing_email,
      phone: normalized.phone,
    },
    role,
  });
  if (!upserted.ok) {
    // Concurrent insert raced us to a row. Re-read; if still missing, surface error.
    const { data: raced } = await admin
      .from("user_profiles")
      .select("billing_type, schedule_type")
      .eq("id", userId)
      .maybeSingle();
    if (raced) {
      return {
        billing_type: String(
          (raced as { billing_type?: string | null }).billing_type ?? DEFAULT_BILLING_TYPE,
        ),
        schedule_type: String(
          (raced as { schedule_type?: string | null }).schedule_type ?? DEFAULT_SCHEDULE_TYPE,
        ),
        created: false,
      };
    }
    return { error: upserted.error };
  }

  return {
    billing_type: DEFAULT_BILLING_TYPE,
    schedule_type: DEFAULT_SCHEDULE_TYPE,
    created: upserted.created,
  };
}
