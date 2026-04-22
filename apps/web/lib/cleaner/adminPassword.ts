import "server-only";

import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCleanerLinkedToAuth } from "@/lib/cleaner/linkCleanerAuth";

/**
 * Admin password reset: ensures Auth link, then updates password via Supabase Auth only.
 * Never writes passwords or hashes to `public.cleaners`.
 */
export async function resetCleanerPasswordForAdmin(
  admin: SupabaseClient,
  cleanerRowId: string,
  newPassword: string,
): Promise<void> {
  const { data: row, error: fetchErr } = await admin
    .from("cleaners")
    .select("id")
    .eq("id", cleanerRowId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row?.id) throw new Error("Cleaner not found.");

  const authUserId = await ensureCleanerLinkedToAuth(admin, cleanerRowId, { passwordForNewUser: newPassword });

  const authUpdate = await admin.auth.admin.updateUserById(authUserId, { password: newPassword });
  if (authUpdate.error) {
    throw new Error(authUpdate.error.message || "Could not update auth password.");
  }
}

/**
 * Generates a password recovery action link for the cleaner's auth email (admin copies / shares).
 */
export async function generateCleanerRecoveryLinkForAdmin(
  admin: SupabaseClient,
  cleanerRowId: string,
): Promise<{ actionLink: string }> {
  const { data: row, error: fetchErr } = await admin
    .from("cleaners")
    .select("id, email, auth_user_id")
    .eq("id", cleanerRowId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);
  if (!row?.id) throw new Error("Cleaner not found.");

  let needBootstrap = !row.auth_user_id;
  if (row.auth_user_id) {
    const check = await admin.auth.admin.getUserById(String(row.auth_user_id));
    if (check.error || !check.data.user) needBootstrap = true;
  }
  if (needBootstrap) {
    const tempBootstrap = crypto.randomBytes(18).toString("base64url") + "Aa1!";
    await ensureCleanerLinkedToAuth(admin, cleanerRowId, { passwordForNewUser: tempBootstrap });
  }

  const { data: linked, error: refetchErr } = await admin
    .from("cleaners")
    .select("email, auth_user_id")
    .eq("id", cleanerRowId)
    .maybeSingle();
  if (refetchErr) throw new Error(refetchErr.message);

  const email = String(linked?.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Cleaner has no email on file; add an email before generating a recovery link.");
  }

  if (!linked?.auth_user_id) {
    throw new Error("Could not link cleaner to Supabase Auth.");
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  if (error) throw new Error(error.message);
  const actionLink = data?.properties?.action_link ?? "";
  if (!actionLink) throw new Error("Auth did not return a recovery link.");

  return { actionLink };
}
