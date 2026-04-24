"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, LogOut, MapPin, Phone, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type CleanerMobileProfile = {
  name: string;
  phone: string;
  areas: string[];
  rating: number;
  isAvailable: boolean;
};

export function CleanerProfileTab({
  profile,
  onSetAvailability,
}: {
  profile: CleanerMobileProfile | null;
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
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">Loading profile…</CardContent>
      </Card>
    );
  }

  const tel = profile.phone.replace(/\s/g, "");
  const available = profile.isAvailable;

  return (
    <div className="space-y-4">
      {err ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {err}
        </p>
      ) : null}
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="space-y-4 p-4">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{profile.name}</h2>
            <div className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <Phone className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              {tel ? (
                <a
                  href={`tel:${tel}`}
                  className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                >
                  {profile.phone}
                </a>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              <span className="font-semibold">{profile.rating.toFixed(1)}</span>
              <span className="text-zinc-500 dark:text-zinc-400">rating</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Areas</p>
            <ul className="mt-2 space-y-2">
              {profile.areas.map((area) => (
                <li key={area} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
                  <MapPin className="h-4 w-4 shrink-0 text-blue-600/80 dark:text-blue-400/90" aria-hidden />
                  {area}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Availability</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">When off, you will not be matched for new jobs.</p>
            <div className="mt-3 flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-zinc-600 dark:bg-zinc-900">
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(true)}
                className={`h-12 flex-1 rounded-lg text-base font-semibold transition-colors ${
                  available ? "bg-blue-600 text-white shadow-sm" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                On
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void toggle(false)}
                className={`h-12 flex-1 rounded-lg text-base font-semibold transition-colors ${
                  !available ? "bg-zinc-800 text-white shadow-sm dark:bg-zinc-200 dark:text-zinc-900" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                Off
              </button>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="h-12 w-full rounded-xl text-base"
            onClick={() => router.push("/cleaner/settings/payment")}
          >
            <CreditCard className="h-4 w-4" aria-hidden />
            Payment details
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-12 w-full rounded-xl border-zinc-300 text-base dark:border-zinc-600"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
