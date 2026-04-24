import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findAuthUserIdByEmail } from "@/lib/cleaner/linkCleanerAuth";

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

  const existingForNewEmail = await findAuthUserIdByEmail(admin, newEmail);
  if (existingForNewEmail && existingForNewEmail !== authUid) {
    throw new Error(
      "That email is already registered to another account. Use a different address, or unlink that user in Supabase Auth first.",
    );
  }

  const beforeAuth = await admin.auth.admin.getUserById(authUid);
  const previousAuthEmail = String(beforeAuth.data.user?.email ?? "")
    .trim()
    .toLowerCase();

  const { error: authErr } = await admin.auth.admin.updateUserById(authUid, {
    email: newEmail,
    email_confirm: true,
  });
  if (authErr) {
    const raw = (authErr.message || "").trim();
    const lower = raw.toLowerCase();
    if (
      raw === "Error updating user" ||
      lower.includes("error updating user") ||
      lower.includes("database error") ||
      lower.includes("already been registered") ||
      lower.includes("already registered") ||
      lower.includes("duplicate")
    ) {
      throw new Error(
        "Could not set this email in Supabase Auth. It is often already in use by another user, or blocked by your Auth settings. Try a different address or check the Auth user in the Supabase dashboard.",
      );
    }
    throw new Error(raw || "Could not update auth email.");
  }

  const { error: dbErr } = await admin.from("cleaners").update({ email: newEmail }).eq("id", cleanerRowId);
  if (dbErr) {
    const rollbackEmail = previousAuthEmail || oldEmail;
    if (rollbackEmail) {
      await admin.auth.admin
        .updateUserById(authUid, { email: rollbackEmail, email_confirm: true })
        .catch(() => {});
    }
    throw new Error(dbErr.message);
  }
}
