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

  console.log("LOGIN DATA:", data);
  console.log("LOGIN ERROR:", error);

  if (error) return { user: null as User | null, session: null as Session | null, error };

  const u = data.user;
  if (u?.id) {
    const { data: row } = await sb.from("user_profiles").select("id").eq("id", u.id).maybeSingle();
    if (!row) {
      const meta = u.user_metadata as { full_name?: string; name?: string };
      const fn =
        (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
        (typeof meta?.name === "string" && meta.name.trim()) ||
        null;
      const { error: insErr } = await sb.from("user_profiles").insert({
        id: u.id,
        full_name: fn,
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

  console.log("SIGNUP DATA:", data);
  console.log("SIGNUP ERROR:", error);

  if (error) return { user: null as User | null, session: null as Session | null, error };

  const name = fullName.trim();
  const user = data.user;
  if (user?.id) {
    const { error: profileErr } = await sb.from("user_profiles").upsert(
      {
        id: user.id,
        full_name: name,
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
