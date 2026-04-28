"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CleanerHeader } from "@/components/cleaner/mobile/dashboard/CleanerHeader";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";

type MeCleaner = {
  full_name?: string | null;
  is_available?: boolean | null;
};

type MeJson = {
  cleaner?: MeCleaner | null;
  error?: string;
};

export function CleanerLayoutWorkspaceHeader() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isAvailable, setIsAvailable] = useState(true);
  const [hasOffer, setHasOffer] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setLoading(false);
      return;
    }
    try {
      const [meRes, offRes] = await Promise.all([
        cleanerAuthenticatedFetch("/api/cleaner/me", { headers }),
        cleanerAuthenticatedFetch("/api/cleaner/offers", { headers }),
      ]);
      const json = (await meRes.json().catch(() => ({}))) as MeJson;
      const c = json.cleaner;
      const name = typeof c?.full_name === "string" && c.full_name.trim() ? c.full_name.trim() : "Cleaner";
      setDisplayName(name);
      setIsAvailable(c?.is_available !== false);

      const offJson = (await offRes.json().catch(() => ({}))) as { offers?: unknown[] };
      const offers = Array.isArray(offJson.offers) ? offJson.offers : [];
      setHasOffer(offers.length > 0);
    } catch {
      setDisplayName("Cleaner");
      setHasOffer(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="border-b border-zinc-200/90 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <header className="shrink-0 border-b border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <CleanerHeader
        profile={{
          displayName: displayName ?? "Cleaner",
          isAvailable,
          showNotificationDot: hasOffer,
          availabilityMicrocopy: isAvailable ? "You're visible to customers." : "You won't receive new jobs.",
        }}
        srTitle="Cleaner"
        onBellClick={() => router.push("/cleaner")}
      />
    </header>
  );
}
