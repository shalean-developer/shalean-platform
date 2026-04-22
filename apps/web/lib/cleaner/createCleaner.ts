import type { SupabaseClient } from "@supabase/supabase-js";

import { cleanerGeneratedLoginEmailFromE164 } from "@/lib/cleaner/cleanerIdentity";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

type CreateCleanerInput = {
  admin: SupabaseClient;
  email?: string | null;
  password: string;
  fullName: string;
  phone: string;
  cityId?: string | null;
  location?: string | null;
  availabilityStart?: string | null;
  availabilityEnd?: string | null;
  isAvailable?: boolean;
};

/**
 * Creates Supabase Auth user first, then a cleaners row with a surrogate id.
 * Passwords live only in Auth; `auth_user_id` is the sole link to auth.users.
 */
export async function createCleaner(params: CreateCleanerInput): Promise<{
  cleanerId: string;
  phoneNumber: string;
  email: string;
}> {
  const phoneNorm = normalizeSouthAfricaPhone(params.phone);
  if (!phoneNorm) {
    throw new Error("Invalid South Africa phone number. Use 0… or +27… format.");
  }

  const authEmail = (params.email?.trim() || cleanerGeneratedLoginEmailFromE164(phoneNorm)).toLowerCase();
  const fullName = params.fullName.trim();
  if (!authEmail || !fullName || params.password.length < 6) {
    throw new Error("Invalid cleaner payload.");
  }

  const authRes = await params.admin.auth.admin.createUser({
    email: authEmail,
    password: params.password,
    email_confirm: true,
    user_metadata: { role: "cleaner", source: "admin_create_cleaner", phone_e164: phoneNorm },
  });
  if (authRes.error || !authRes.data.user?.id) {
    throw new Error(authRes.error?.message ?? "Could not create cleaner auth user.");
  }

  const authUserId = authRes.data.user.id;

  const isAvailable = params.isAvailable ?? true;
  const status = isAvailable ? "available" : "offline";

  const { data: row, error: insertErr } = await params.admin
    .from("cleaners")
    .insert({
      auth_user_id: authUserId,
      full_name: fullName,
      phone: phoneNorm,
      phone_number: phoneNorm,
      status,
      rating: 5,
      jobs_completed: 0,
      is_available: isAvailable,
      city_id: params.cityId ?? null,
      location: params.location?.trim() || null,
      availability_start: params.availabilityStart ?? null,
      availability_end: params.availabilityEnd ?? null,
      email: authEmail,
    })
    .select("id, auth_user_id")
    .single();

  if (insertErr || !row?.id || !row.auth_user_id) {
    await params.admin.auth.admin.deleteUser(authUserId).catch(() => {});
    if (row?.id) {
      try {
        await params.admin.from("cleaners").delete().eq("id", row.id);
      } catch {
        /* best-effort rollback */
      }
    }
    throw new Error(insertErr?.message ?? "Could not create cleaner row.");
  }

  return { cleanerId: row.id as string, phoneNumber: phoneNorm, email: authEmail };
}
