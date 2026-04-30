"use client";

import { useEffect, useMemo, useState } from "react";
import AreasChips, { type ProfileAreaChip } from "@/components/cleaner/AreasChips";
import AvailabilityCard from "@/components/cleaner/AvailabilityCard";
import LogoutButton from "@/components/cleaner/LogoutButton";
import PayoutCTA from "@/components/cleaner/PayoutCTA";
import AvailabilityDaysCard from "@/components/cleaner/AvailabilityDaysCard";
import ProfileHeader from "@/components/cleaner/ProfileHeader";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { bankDisplayNameFromCode } from "@/lib/cleaner/southAfricanPaystackBanks";
import type { CleanerMobileProfile, CleanerRosterSnapshot } from "@/lib/cleaner/cleanerProfileTypes";

export type { CleanerMobileProfile, CleanerRosterSnapshot } from "@/lib/cleaner/cleanerProfileTypes";

export function CleanerProfileTab({
  profile,
  roster,
  onSetAvailability,
}: {
  profile: CleanerMobileProfile | null;
  roster?: CleanerRosterSnapshot | null;
  onSetAvailability: (next: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payout, setPayout] = useState<{ has: boolean; line: string | null } | null>(null);

  const areaItems: ProfileAreaChip[] = useMemo(() => {
    if (roster && roster.workingAreas.length > 0) {
      return roster.workingAreas.map((a) => ({ id: a.id, label: a.name }));
    }
    if (!profile) return [];
    return profile.areas.map((label, i) => ({ id: `loc-${i}`, label }));
  }, [roster, profile]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers || cancelled) return;
      try {
        const res = await cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers });
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as {
          details?: {
            bankCode?: string | null;
            accountNumberMasked?: string | null;
            hasRecipientCode?: boolean;
          } | null;
        };
        const d = json.details;
        const has = Boolean(d?.hasRecipientCode);
        let line: string | null = null;
        if (d?.accountNumberMasked || d?.bankCode) {
          const bank = bankDisplayNameFromCode(d?.bankCode ?? null);
          const mask = d?.accountNumberMasked?.trim() || "";
          line = mask ? `${bank} · ${mask}` : bank;
        }
        if (!cancelled) setPayout({ has, line });
      } catch {
        if (!cancelled) setPayout({ has: false, line: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    setErr(null);
    const r = await onSetAvailability(next);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not update availability.");
    }
  }

  if (!profile) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400" role="status">
        Loading profile…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-2">
      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </p>
      ) : null}

      <ProfileHeader profile={profile} />
      <AreasChips items={areaItems} />
      <AvailabilityDaysCard activeDays={profile.availabilityWeekdays} />
      <AvailabilityCard
        isAvailable={profile.isAvailable}
        busy={busy}
        onSetOn={() => void toggle(true)}
        onSetOff={() => void toggle(false)}
      />
      <PayoutCTA hasPayoutMethod={payout?.has ?? false} summaryLine={payout?.line ?? null} />
      <LogoutButton />
    </div>
  );
}
