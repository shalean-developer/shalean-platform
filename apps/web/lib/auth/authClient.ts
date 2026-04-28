import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { linkBookingsToUserAfterAuth } from "@/lib/booking/clientLinkBookings";

function client() {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase is not configured.");
  return sb;
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
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

export async function signUp(email: string, password: string, fullName: string) {
  const sb = client();
  const { data, error } = await sb.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
      },
    },
  });

  if (error) return { user: null as User | null, session: null as Session | null, error };

  const user = data.user;
  if (user?.id) {
    const { error: profileErr } = await sb.from("user_profiles").upsert(
      {
        id: user.id,
        tier: "regular",
        booking_count: 0,
        total_spent_cents: 0,
        updated_at: new Date().toISOString(),
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
  const { error } = await sb.auth.signOut();
  return { error: error ? new Error(error.message) : null };
}
