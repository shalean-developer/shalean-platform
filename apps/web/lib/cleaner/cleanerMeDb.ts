import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

/** Columns always present on `public.cleaners` for cleaner session APIs. */
export const CLEANER_ME_SELECT_BASE =
  "id, full_name, phone, phone_number, email, status, is_available, rating, jobs_completed, created_at, location";

export const CLEANER_ME_SELECT_WITH_WEEKDAYS = `${CLEANER_ME_SELECT_BASE}, availability_weekdays`;

export function isUnknownColumnError(error: PostgrestError | null, column: string): boolean {
  if (!error?.message) return false;
  const m = error.message.toLowerCase();
  const c = column.toLowerCase();
  if (!m.includes(c)) return false;
  return (
    m.includes("does not exist") ||
    m.includes("could not find") ||
    m.includes("schema cache") ||
    (m.includes("column") && m.includes("not found"))
  );
}

type CleanerMeRow = Record<string, unknown>;

export async function fetchCleanerMeRow(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<{ data: CleanerMeRow | null; error: PostgrestError | null }> {
  let res = await admin.from("cleaners").select(CLEANER_ME_SELECT_WITH_WEEKDAYS).eq("id", cleanerId).maybeSingle();
  if (res.error && isUnknownColumnError(res.error, "availability_weekdays")) {
    res = await admin.from("cleaners").select(CLEANER_ME_SELECT_BASE).eq("id", cleanerId).maybeSingle();
  }
  return { data: res.data as CleanerMeRow | null, error: res.error };
}

export async function updateCleanerMeAvailabilityAndFetch(
  admin: SupabaseClient,
  cleanerId: string,
  isAvailable: boolean,
  status: string,
): Promise<{ data: CleanerMeRow | null; error: PostgrestError | null }> {
  let res = await admin
    .from("cleaners")
    .update({ is_available: isAvailable, status })
    .eq("id", cleanerId)
    .select(CLEANER_ME_SELECT_WITH_WEEKDAYS)
    .maybeSingle();
  if (res.error && isUnknownColumnError(res.error, "availability_weekdays")) {
    res = await admin
      .from("cleaners")
      .update({ is_available: isAvailable, status })
      .eq("id", cleanerId)
      .select(CLEANER_ME_SELECT_BASE)
      .maybeSingle();
  }
  return { data: res.data as CleanerMeRow | null, error: res.error };
}
