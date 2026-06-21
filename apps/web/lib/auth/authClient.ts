import type { Session, User } from "@supabase/supabase-js";
import { clearAuthIntent } from "@/lib/auth/authRoleIntent";
import { clearCachedUserRole } from "@/lib/auth/userRole";
import { getSupabaseBrowser, getSupabaseSession } from "@/lib/supabase/browser";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";
import {
  billingEmailFromLoginEmail,
  normalizeCustomerProfileContactFields,
} from "@/lib/customer/customerProfileContactFields";
import { normalizeSouthAfricaPhone } from "@/lib/utils/phone";

function client() {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase is not configured.");
  return sb;
}

export async function getSession(): Promise<Session | null> {
  return getSupabaseSession();
}

export async function getUser(): Promise<User | null> {
  const s = await getSession();
  return s?.user ?? null;
}

export async function signIn(email: string, password: string) {
  const sb = client();
  const { data, error } = await sb.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return { user: null as User | null, session: null as Session | null, error };

  const u = data.user;
  if (u?.id) {
    const { data: row } = await sb.from("user_profiles").select("id").eq("id", u.id).maybeSingle();
    if (!row) {
      /** Omit `full_name`: older DBs (pre-20260423) only have id, counts, tier, updated_at. */
      const { error: insErr } = await sb.from("user_profiles").insert({
        id: u.id,
        tier: "regular",
        role: "customer",
        booking_count: 0,
        total_spent_cents: 0,
        updated_at: new Date().toISOString(),
      });
      if (insErr) console.warn("[signIn] user_profiles insert:", insErr.message);
    }
  }

  if (data.session?.access_token && data.user) {
    await linkBookingsToUserAfterAuth(data.session.access_token, data.user);
  }

  return { user: data.user, session: data.session, error: null };
}

export async function signUp(email: string, password: string, fullName: string, phone?: string) {
  const sb = client();
  const phoneNorm = typeof phone === "string" ? phone.trim() : "";
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        ...(phoneNorm ? { phone: phoneNorm, book_auth_type: "register" } : {}),
      },
    },
  });

  if (error) return { user: null as User | null, session: null as Session | null, error };

  const user = data.user;
  if (user?.id) {
    const phoneE164 = phoneNorm ? normalizeSouthAfricaPhone(phoneNorm) : null;
    const contact = normalizeCustomerProfileContactFields({
      fullName: fullName.trim(),
      billingEmail: billingEmailFromLoginEmail(email.trim()),
      phone: phoneE164 ?? phoneNorm ?? null,
    });
    const { error: profileErr } = await sb.from("user_profiles").upsert(
      {
        id: user.id,
        tier: "regular",
        role: "customer",
        booking_count: 0,
        total_spent_cents: 0,
        updated_at: new Date().toISOString(),
        ...(contact.full_name ? { full_name: contact.full_name } : {}),
        ...(contact.billing_email ? { billing_email: contact.billing_email } : {}),
        ...(contact.phone ? { phone: contact.phone } : {}),
        ...(contact.phone_e164 ? { phone_e164: contact.phone_e164 } : {}),
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      console.warn("[signUp] user_profiles upsert:", profileErr.message);
    }
  }

  if (data.session?.access_token && data.user) {
    await linkBookingsToUserAfterAuth(data.session.access_token, data.user);
  }

  return { user: data.user, session: data.session, error: null };
}

export async function signOut(): Promise<{ error: Error | null }> {
  const sb = getSupabaseBrowser();
  if (!sb) return { error: new Error("Supabase is not configured.") };
  clearAuthIntent();
  clearCachedUserRole();
  const { error } = await sb.auth.signOut();
  return { error: error ? new Error(error.message) : null };
}

export type RequestPasswordResetResult =
  | { ok: true }
  | { ok: false; noAccount: true }
  | { ok: false; error: Error };

/** Sends a password recovery email via `/api/auth/forgot-password` (Resend in production). */
export async function requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim() }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    sent?: boolean;
    code?: string;
    error?: string;
  };
  if (res.ok && json.code === "no_account") {
    return { ok: false, noAccount: true };
  }
  if (!res.ok) {
    return { ok: false, error: new Error(json.error ?? "Could not send reset email. Try again.") };
  }
  if (json.sent) {
    return { ok: true };
  }
  return { ok: false, error: new Error("Could not send reset email. Try again.") };
}

export async function updatePassword(password: string) {
  const sb = client();
  const { error } = await sb.auth.updateUser({ password });
  return { error: error ? new Error(error.message) : null };
}
