"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AreasChips, { type ProfileAreaChip } from "@/components/cleaner/AreasChips";
import AvailabilityCard from "@/components/cleaner/AvailabilityCard";
import LogoutButton from "@/components/cleaner/LogoutButton";
import PayoutCTA from "@/components/cleaner/PayoutCTA";
import AvailabilityDaysCard from "@/components/cleaner/AvailabilityDaysCard";
import ProfileHeader from "@/components/cleaner/ProfileHeader";
import type { CleanerProfileClientData } from "@/lib/cleaner/getProfileData";
import { getProfileData } from "@/lib/cleaner/getProfileData";
import { mapCleanerMeToMobileProfile } from "@/lib/cleaner/cleanerMobileProfileFromMe";
import { setCleanerAvailability } from "@/lib/cleaner/setCleanerAvailability";

export default function CleanerProfilePage() {
  const [bundle, setBundle] = useState<CleanerProfileClientData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [availBusy, setAvailBusy] = useState(false);
  const [availErr, setAvailErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await getProfileData();
    if (!r.ok) {
      setLoadErr(r.error);
      setBundle(null);
      return;
    }
    setLoadErr(null);
    setBundle(r.data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const profile = useMemo(() => mapCleanerMeToMobileProfile(bundle?.cleaner ?? null), [bundle?.cleaner]);

  const areaItems: ProfileAreaChip[] = useMemo(() => {
    const roster = bundle?.roster;
    if (roster?.workingAreas?.length) {
      return roster.workingAreas.map((a) => ({ id: a.id, label: a.name }));
    }
    const areas = profile?.areas ?? [];
    return areas.map((label, i) => ({ id: `loc-${i}`, label }));
  }, [bundle?.roster, profile?.areas]);

  async function applyAvailability(next: boolean) {
    setAvailBusy(true);
    setAvailErr(null);
    const r = await setCleanerAvailability(next);
    setAvailBusy(false);
    if (!r.ok) {
      setAvailErr(r.error);
      return;
    }
    setBundle((b) => (b ? { ...b, cleaner: r.cleaner } : b));
  }

  if (loadErr && !bundle) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-4 py-6">
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {loadErr}
        </p>
        <Link href="/cleaner" className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
          Back to workspace
        </Link>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-4 py-10">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400" role="status">
          Loading profile…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-8 px-4 py-6 pb-16">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Profile</h1>
        <Link href="/cleaner" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          Workspace
        </Link>
      </div>

      {loadErr ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
          {loadErr}{" "}
          <button type="button" className="font-semibold underline" onClick={() => void refresh()}>
            Retry
          </button>
        </p>
      ) : null}

      {availErr ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {availErr}
        </p>
      ) : null}

      <ProfileHeader profile={profile} />
      <AreasChips items={areaItems} />
      <AvailabilityDaysCard activeDays={profile.availabilityWeekdays} />
      <AvailabilityCard
        isAvailable={profile.isAvailable}
        busy={availBusy}
        onSetOn={() => void applyAvailability(true)}
        onSetOff={() => void applyAvailability(false)}
      />
      <PayoutCTA
        hasPayoutMethod={Boolean(bundle?.hasPayoutRecipient)}
        summaryLine={bundle?.payoutSummaryLine ?? null}
      />
      <LogoutButton />
    </main>
  );
}
