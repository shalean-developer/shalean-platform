import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidCleanerAuthEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/**
 * Updates `auth.users.email` then `public.cleaners.email` so login and UI stay aligned.
 * Rolls back Auth email if the DB update fails.
 */
export async function syncCleanerEmailForAdmin(
  admin: SupabaseClient,
  cleanerRowId: string,
  newEmailRaw: string,
): Promise<void> {
  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!newEmail) {
    throw new Error("Email is required.");
  }
  if (!isValidCleanerAuthEmail(newEmail)) {
    throw new Error("Invalid email address.");
  }

  const { data: row, error: fetchErr } = await admin
    .from("cleaners")
    .select("id, email, auth_user_id")
    .eq("id", cleanerRowId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row?.id) throw new Error("Cleaner not found.");

  const oldEmail = String(row.email ?? "").trim().toLowerCase();
  if (newEmail === oldEmail) return;

  const authUid = row.auth_user_id as string | null | undefined;
  if (!authUid) {
    throw new Error("Cleaner is not linked to Supabase Auth. Use “Fix Missing Auth Accounts” first.");
  }

  const beforeAuth = await admin.auth.admin.getUserById(authUid);
  const previousAuthEmail = String(beforeAuth.data.user?.email ?? "")
    .trim()
    .toLowerCase();

  const { error: authErr } = await admin.auth.admin.updateUserById(authUid, { email: newEmail });
  if (authErr) {
    throw new Error(authErr.message || "Could not update auth email.");
  }

  const { error: dbErr } = await admin.from("cleaners").update({ email: newEmail }).eq("id", cleanerRowId);
  if (dbErr) {
    const rollbackEmail = previousAuthEmail || oldEmail;
    if (rollbackEmail) {
      await admin.auth.admin.updateUserById(authUid, { email: rollbackEmail }).catch(() => {});
    }
    throw new Error(dbErr.message);
  }
}
