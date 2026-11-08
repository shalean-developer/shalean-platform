"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { ownedCustomerAvatarPath, providerAvatarUrl } from "@/lib/customer/customerAvatar";

export function useCustomerAvatar(user: User | null): string | undefined {
  const userId = user?.id ?? "";
  const path = ownedCustomerAvatarPath(userId, user?.user_metadata?.customer_avatar_path);
  const key = `${userId}:${path ?? ""}`;
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;
    void (async () => {
      try {
        const client = getSupabaseClient();
        const session = await client?.auth.getSession();
        const token = session?.data.session?.access_token;
        if (!token || controller.signal.aborted) return;
        const response = await fetch("/api/customer/avatar", {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) return;
        const blob = await response.blob();
        if (controller.signal.aborted || blob.type !== "image/webp") return;
        objectUrl = URL.createObjectURL(blob);
        setPhoto({ key, url: objectUrl });
      } catch { /* A missing or unavailable photo leaves the initials visible. */ }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, key]);

  if (path) return photo?.key === key ? photo.url : undefined;
  return providerAvatarUrl(user?.user_metadata);
}
