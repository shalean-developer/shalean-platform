"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";

/**
 * Current user via `supabase.auth.getUser()` (validates JWT with server).
 */
export function useUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setUser(null);
      setLoading(false);
      return;
    }

    const supabase = client;
    let cancelled = false;

    async function sync() {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(error ? null : data.user ?? null);
      setLoading(false);
    }

    void sync();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void sync();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}
