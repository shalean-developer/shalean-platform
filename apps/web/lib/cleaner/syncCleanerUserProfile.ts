import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

export type CleanerProfileSyncInput = {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
};

const PROFILE_DEFAULTS = {
  tier: "regular",
  billing_type: "per_booking",
  schedule_type: "on_demand",
  booking_count: 0,
  total_spent_cents: 0,
} as const;

function buildCleanerProfilePatch(input: CleanerProfileSyncInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    role: "cleaner",
    updated_at: new Date().toISOString(),
  };

  const fullName = String(input.full_name ?? "").trim();
  if (fullName.length >= 2) patch.full_name = fullName;

  const phoneRaw = String(input.phone ?? "").trim();
  if (phoneRaw) {
    const e164 = normalizeSouthAfricaPhone(phoneRaw);
    patch.phone = e164 ?? phoneRaw;
    if (e164) patch.phone_e164 = e164;
  }

  const billingEmail = normalizeBillingEmail(input.email);
  if (billingEmail) patch.billing_email = billingEmail;

  return patch;
}

/** Mirror `cleaners` roster fields onto the linked auth user's `user_profiles` row. */
export async function syncCleanerUserProfile(
  admin: SupabaseClient,
  authUserId: string,
  cleaner: CleanerProfileSyncInput,
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  const userId = String(authUserId ?? "").trim();
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return { ok: false, error: "invalid_auth_user_id" };
  }

  const patch = buildCleanerProfilePatch(cleaner);

  const { data: existing, error: readErr } = await admin
    .from("user_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  if (existing?.id) {
    const { error: upErr } = await admin.from("user_profiles").update(patch).eq("id", userId);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: insErr } = await admin.from("user_profiles").insert({
      id: userId,
      ...PROFILE_DEFAULTS,
      ...patch,
    });
    if (insErr) return { ok: false, error: insErr.message };

    const fullName = String(patch.full_name ?? cleaner.full_name ?? "").trim();
    if (fullName.length >= 2) {
      const { data: authData } = await admin.auth.admin.getUserById(userId);
      const meta =
        authData?.user?.user_metadata && typeof authData.user.user_metadata === "object"
          ? (authData.user.user_metadata as Record<string, unknown>)
          : {};
      await admin.auth.admin.updateUserById(userId, {
        user_metadata: {
          ...meta,
          role: "cleaner",
          full_name: fullName,
          name: fullName,
        },
      });
    }

    return { ok: true, created: true };
  }

  const fullName = String(patch.full_name ?? cleaner.full_name ?? "").trim();
  if (fullName.length >= 2) {
    const { data: authData } = await admin.auth.admin.getUserById(userId);
    const meta =
      authData?.user?.user_metadata && typeof authData.user.user_metadata === "object"
        ? (authData.user.user_metadata as Record<string, unknown>)
        : {};
    await admin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...meta,
        role: "cleaner",
        full_name: fullName,
        name: fullName,
      },
    });
  }

  return { ok: true, created: false };
}

/** Load a cleaners row and sync its linked auth user's profile. */
export async function syncCleanerUserProfileForCleanerRow(
  admin: SupabaseClient,
  cleanerRowId: string,
): Promise<{ ok: true; authUserId: string; created: boolean } | { ok: false; error: string }> {
  const { data: row, error } = await admin
    .from("cleaners")
    .select("auth_user_id, full_name, phone, phone_number, email")
    .eq("id", cleanerRowId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!row?.auth_user_id) return { ok: false, error: "cleaner_not_linked_to_auth" };

  const authUserId = String((row as { auth_user_id: string }).auth_user_id);
  const synced = await syncCleanerUserProfile(admin, authUserId, {
    full_name: (row as { full_name?: string | null }).full_name,
    phone:
      (row as { phone?: string | null }).phone ??
      (row as { phone_number?: string | null }).phone_number,
    email: (row as { email?: string | null }).email,
  });
  if (!synced.ok) return synced;
  return { ok: true, authUserId, created: synced.created };
}

export type BackfillCleanerUserProfilesResult = {
  scanned: number;
  synced: number;
  created: number;
  failed: number;
  failures: Array<{ cleanerId: string; authUserId: string; error: string }>;
};

/** Sync every cleaners row with auth_user_id → user_profiles. */
export async function backfillAllCleanerUserProfiles(
  admin: SupabaseClient,
): Promise<BackfillCleanerUserProfilesResult> {
  const { data: rows, error } = await admin
    .from("cleaners")
    .select("id, auth_user_id, full_name, phone, phone_number, email")
    .not("auth_user_id", "is", null)
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);

  const list = rows ?? [];
  let synced = 0;
  let created = 0;
  const failures: BackfillCleanerUserProfilesResult["failures"] = [];

  for (const row of list) {
    const cleanerId = String((row as { id: string }).id);
    const authUserId = String((row as { auth_user_id: string }).auth_user_id);
    const result = await syncCleanerUserProfile(admin, authUserId, {
      full_name: (row as { full_name?: string | null }).full_name,
      phone:
        (row as { phone?: string | null }).phone ??
        (row as { phone_number?: string | null }).phone_number,
      email: (row as { email?: string | null }).email,
    });
    if (!result.ok) {
      failures.push({ cleanerId, authUserId, error: result.error });
      continue;
    }
    synced += 1;
    if (result.created) created += 1;
  }

  return {
    scanned: list.length,
    synced,
    created,
    failed: failures.length,
    failures,
  };
}
