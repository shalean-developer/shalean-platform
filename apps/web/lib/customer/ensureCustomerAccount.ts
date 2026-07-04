import "server-only";

import crypto from "crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureUserProfileForAuthUser } from "@/lib/admin/ensureUserProfileForAuthUser";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { findAuthUserIdByEmail } from "@/lib/cleaner/linkCleanerAuth";
import { customerGeneratedLoginEmailFromAnyPhone } from "@/lib/customer/customerIdentity";
import { upsertCustomerProfileContact } from "@/lib/customer/upsertCustomerProfileContact";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EnsureCustomerAccountInput = {
  fullName: string;
  phone: string;
  email?: string | null;
  /** Stored on auth user_metadata.source when creating a new account. */
  source?: string;
};

export type EnsureCustomerAccountResult =
  | {
      ok: true;
      userId: string;
      loginEmail: string;
      reused: boolean;
      match?: "phone" | "email" | "race";
    }
  | { ok: false; error: string };

/**
 * Find or create a customer auth account + `user_profiles` row.
 * Dedupes by normalised SA phone (synthetic `@walkin.shalean.com` login) or by supplied email.
 */
export async function ensureCustomerAccount(
  admin: SupabaseClient,
  input: EnsureCustomerAccountInput,
): Promise<EnsureCustomerAccountResult> {
  const fullName = input.fullName.trim();
  const phoneRaw = input.phone.trim();
  const emailRaw = input.email?.trim() ?? "";

  if (fullName.length < 2) return { ok: false, error: "name_required" };
  if (phoneRaw.length < 5) return { ok: false, error: "phone_required" };

  const phoneNorm = normalizeSouthAfricaPhone(phoneRaw);
  if (!phoneNorm) return { ok: false, error: "invalid_phone" };

  const genEmail = customerGeneratedLoginEmailFromAnyPhone(phoneNorm);
  if (!genEmail) return { ok: false, error: "phone_login_unavailable" };

  const emailNorm = emailRaw ? normalizeEmail(emailRaw) : "";
  if (emailRaw && !EMAIL_RE.test(emailNorm)) {
    return { ok: false, error: "invalid_email" };
  }

  const uidByPhone = await findAuthUserIdByEmail(admin, genEmail);
  const uidByEmail = emailNorm ? await findAuthUserIdByEmail(admin, emailNorm) : null;

  if (uidByPhone && uidByEmail && uidByPhone !== uidByEmail) {
    return {
      ok: false,
      error: "phone_email_account_conflict",
    };
  }

  if (uidByPhone) {
    await ensureUserProfileForAuthUser(admin, uidByPhone);
    await upsertCustomerProfileContact(admin, {
      userId: uidByPhone,
      contact: { fullName, billingEmail: emailNorm || null, phone: phoneNorm },
    });
    return { ok: true, userId: uidByPhone, loginEmail: genEmail, reused: true, match: "phone" };
  }

  if (uidByEmail) {
    await ensureUserProfileForAuthUser(admin, uidByEmail);
    await upsertCustomerProfileContact(admin, {
      userId: uidByEmail,
      contact: { fullName, billingEmail: emailNorm, phone: phoneNorm },
    });
    return { ok: true, userId: uidByEmail, loginEmail: emailNorm, reused: true, match: "email" };
  }

  const loginEmail = emailNorm || genEmail;
  const tempPassword = `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
  const metadataSource = input.source?.trim() || "ensure_customer_account";

  const created = await admin.auth.admin.createUser({
    email: loginEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      phone: phoneNorm,
      source: metadataSource,
    },
  });

  if (created.error || !created.data.user?.id) {
    const msg = created.error?.message ?? "createUser failed";
    if (msg.toLowerCase().includes("already")) {
      const uid = await findAuthUserIdByEmail(admin, loginEmail);
      if (uid) {
        await ensureUserProfileForAuthUser(admin, uid);
        return { ok: true, userId: uid, loginEmail, reused: true, match: "race" };
      }
    }
    return { ok: false, error: msg };
  }

  const userId = created.data.user.id;
  const contactResult = await upsertCustomerProfileContact(admin, {
    userId,
    contact: {
      fullName,
      billingEmail: emailNorm || null,
      phone: phoneNorm,
    },
    role: "customer",
  });

  if (!contactResult.ok) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return { ok: false, error: contactResult.error };
  }

  return { ok: true, userId, loginEmail, reused: false };
}
