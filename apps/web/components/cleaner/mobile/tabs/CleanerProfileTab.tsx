"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, LogOut, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0);
  if (parts.length >= 2) {
    const a = parts[0]![0] ?? "";
    const b = parts[parts.length - 1]![0] ?? "";
    return `${a}${b}`.toUpperCase();
  }
  if (parts.length === 1 && parts[0]!.length >= 2) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export type CleanerRosterSnapshot = {
  availability: Array<{ date: string; start_time: string; end_time: string; is_available: boolean }>;
  workingAreas: Array<{ id: string; name: string }>;
};

export type CleanerMobileProfile = {
  name: string;
  phone: string;
  areas: string[];
  rating: number;
  isAvailable: boolean;
  jobsCompleted?: number;
};

export function CleanerProfileTab({
  profile,
  roster,
  onSetAvailability,
}: {
  profile: CleanerMobileProfile | null;
  roster?: CleanerRosterSnapshot | null;
  onSetAvailability: (next: boolean) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setErr(null);
    const r = await onSetAvailability(next);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? "Could not update availability.");
      return;
    }
  }

  function logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("cleaner_id");
    }
    router.replace("/cleaner/login");
    router.refresh();
  }

  if (!profile) {
    return (
      <p className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400" role="status">
        Loading profile…
      </p>
    );
  }

  const tel = profile.phone.replace(/\s/g, "");
  const available = profile.isAvailable;
  const initials = initialsFromName(profile.name);

  return (
    <div className="flex flex-col gap-8 pb-2">
      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </p>
      ) : null}

      <section className="flex gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-bold tracking-tight text-white shadow-md shadow-blue-900/15 dark:bg-blue-500"
          aria-hidden
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{profile.name}</h1>
          {tel ? (
            <a
              href={`tel:${tel}`}
              className="mt-1 block text-base font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
            >
              {profile.phone}
            </a>
          ) : (
            <p className="mt-1 text-base text-zinc-500">—</p>
          )}
          <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {profile.rating.toFixed(1)}
            </span>
            <span>rating</span>
          </p>
        </div>
      </section>

      {roster && roster.workingAreas.length > 0 ? (
        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Working areas</p>
          <ul className="mt-2 list-inside list-disc text-sm text-zinc-700 dark:text-zinc-200">
            {roster.workingAreas.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {roster && roster.availability.length > 0 ? (
        <section>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Upcoming roster</p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Next 14 days (read-only)</p>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm text-zinc-700 dark:text-zinc-200">
            {roster.availability.slice(0, 40).map((row, i) => (
              <li key={`${row.date}-${i}`} className="flex justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
                <span className="text-zinc-500">{row.date}</span>
                <span>
                  {String(row.start_time).slice(0, 5)}–{String(row.end_time).slice(0, 5)}
                  {!row.is_available ? " (off)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Availability</p>
        <div className="mt-2 flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              available ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]" : "bg-zinc-400 dark:bg-zinc-500",
            )}
            aria-hidden
          />
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{available ? "On" : "Off"}</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {available ? "You're receiving job requests" : "You're not receiving jobs"}
        </p>
        <div className="mt-3 flex rounded-xl border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-600 dark:bg-zinc-900/60">
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggle(true)}
            className={cn(
              "h-11 flex-1 rounded-lg text-sm font-semibold transition-colors",
              available ? "bg-emerald-600 text-white shadow-sm dark:bg-emerald-600" : "text-zinc-600 dark:text-zinc-400",
            )}
          >
            On
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggle(false)}
            className={cn(
              "h-11 flex-1 rounded-lg text-sm font-semibold transition-colors",
              !available
                ? "bg-zinc-700 text-white shadow-sm dark:bg-zinc-600"
                : "text-zinc-600 dark:text-zinc-400",
            )}
          >
            Off
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Add your bank account so we can pay you weekly.</p>
        <Button
          type="button"
          size="lg"
          className="h-12 w-full rounded-xl bg-zinc-900 text-base font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          onClick={() => router.push("/cleaner/settings/payment")}
        >
          <CreditCard className="h-4 w-4" aria-hidden />
          Set up payouts
        </Button>
      </section>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 w-full rounded-xl border-zinc-200 bg-transparent text-base font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
        onClick={logout}
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Log out
      </Button>
    </div>
  );
}
