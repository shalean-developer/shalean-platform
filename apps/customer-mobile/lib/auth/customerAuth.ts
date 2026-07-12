import {
  billingEmailFromLoginEmail,
  normalizeCustomerProfileContactFields,
  normalizeSouthAfricaPhone,
} from "@shalean/utils";
import { getSupabaseAuthClient } from "@/lib/auth/supabaseAuthClient";

export type AuthSessionTokens = {
  access_token: string;
  refresh_token: string;
};

export type SignInResult =
  | { ok: true; session: AuthSessionTokens; userId: string; email: string | null }
  | { ok: false; error: string };

export type SignUpResult =
  | {
      ok: true;
      session: AuthSessionTokens | null;
      userId: string;
      email: string | null;
      needsEmailConfirmation: boolean;
    }
  | { ok: false; error: string };

type ProfileSeed = {
  userId: string;
  email: string;
  fullName?: string;
  phone?: string;
  access_token: string;
  refresh_token: string;
};

/**
 * Ensure `user_profiles` has a customer row (mirrors web authClient sign-in/sign-up).
 * Uses the user JWT via setSession — same RLS path as apps/web.
 */
export async function ensureCustomerProfile(seed: ProfileSeed): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = getSupabaseAuthClient();
  const { error: sessionErr } = await sb.auth.setSession({
    access_token: seed.access_token,
    refresh_token: seed.refresh_token,
  });
  if (sessionErr) {
    return { ok: false, error: sessionErr.message };
  }

  const phoneNorm = typeof seed.phone === "string" ? seed.phone.trim() : "";
  const phoneE164 = phoneNorm ? normalizeSouthAfricaPhone(phoneNorm) : null;
  const contact = normalizeCustomerProfileContactFields({
    fullName: seed.fullName?.trim() || null,
    billingEmail: billingEmailFromLoginEmail(seed.email),
    phone: phoneE164 ?? phoneNorm ?? null,
  });

  const { data: existing, error: readErr } = await sb
    .from("user_profiles")
    .select("id, role")
    .eq("id", seed.userId)
    .maybeSingle();

  if (readErr) {
    console.warn("[customer-mobile] user_profiles read:", readErr.message);
  }

  if (!existing) {
    const { error: insertErr } = await sb.from("user_profiles").insert({
      id: seed.userId,
      tier: "regular",
      role: "customer",
      booking_count: 0,
      total_spent_cents: 0,
      updated_at: new Date().toISOString(),
      ...(contact.full_name ? { full_name: contact.full_name } : {}),
      ...(contact.billing_email ? { billing_email: contact.billing_email } : {}),
      ...(contact.phone ? { phone: contact.phone } : {}),
      ...(contact.phone_e164 ? { phone_e164: contact.phone_e164 } : {}),
    });
    if (insertErr) {
      console.warn("[customer-mobile] user_profiles insert:", insertErr.message);
      return { ok: false, error: insertErr.message };
    }
    return { ok: true };
  }

  const storedRole = String((existing as { role?: string | null }).role ?? "").trim().toLowerCase();
  // Only fill blank role — never overwrite cleaner/admin.
  if (!storedRole) {
    const { error: updateErr } = await sb
      .from("user_profiles")
      .update({
        role: "customer",
        updated_at: new Date().toISOString(),
        ...(contact.full_name ? { full_name: contact.full_name } : {}),
        ...(contact.billing_email ? { billing_email: contact.billing_email } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        ...(contact.phone_e164 ? { phone_e164: contact.phone_e164 } : {}),
      })
      .eq("id", seed.userId);
    if (updateErr) {
      console.warn("[customer-mobile] user_profiles role backfill:", updateErr.message);
    }
  }

  return { ok: true };
}

/** Email/password sign-in via Supabase Auth (same as web customer). */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const sb = getSupabaseAuthClient();
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  const session = data.session;
  if (!session?.access_token || !session.refresh_token || !data.user?.id) {
    return { ok: false, error: "Sign in succeeded but the session was incomplete." };
  }

  await ensureCustomerProfile({
    userId: data.user.id,
    email: data.user.email ?? email,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  return {
    ok: true,
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
    userId: data.user.id,
    email: data.user.email ?? null,
  };
}

/**
 * Customer sign-up — mirrors web `authClient.signUp` profile rules.
 * Role is always seeded as `customer`.
 */
export async function signUpWithPassword(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}): Promise<SignUpResult> {
  const sb = getSupabaseAuthClient();
  const phoneNorm = typeof input.phone === "string" ? input.phone.trim() : "";
  const { data, error } = await sb.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        ...(phoneNorm ? { phone: phoneNorm, book_auth_type: "register" } : {}),
      },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const user = data.user;
  if (!user?.id) {
    return { ok: false, error: "Sign up succeeded but no user was returned." };
  }

  const session = data.session;
  const tokens =
    session?.access_token && session.refresh_token
      ? { access_token: session.access_token, refresh_token: session.refresh_token }
      : null;

  if (tokens) {
    await ensureCustomerProfile({
      userId: user.id,
      email: user.email ?? input.email,
      fullName: input.fullName,
      phone: phoneNorm || undefined,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
    });
  }

  return {
    ok: true,
    session: tokens,
    userId: user.id,
    email: user.email ?? null,
    needsEmailConfirmation: !tokens,
  };
}
