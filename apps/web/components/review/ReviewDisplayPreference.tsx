"use client";
import { useState } from "react";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";
import { ReviewDisplayOptions, type ReviewDisplayChoices } from "./ReviewDisplayOptions";

export function ReviewDisplayPreference({ bookingId, allowed, nameAllowed = false, areaAllowed = false, serviceAllowed = false, onSaved }: { bookingId: string; allowed: boolean; nameAllowed?: boolean; areaAllowed?: boolean; serviceAllowed?: boolean; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function changePermission(choices: ReviewDisplayChoices) {
    setBusy(true);
    setError(null);
    try {
      const result = await dashboardFetchJson("/api/bookings/review", { method: "PATCH", json: { bookingId, ...choices } });
      if (!result.ok) { setError(result.error); return; }
      await onSaved();
    } catch { setError("Could not save your display preferences. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 border-t border-gray-100 pt-4">
    <ReviewDisplayOptions value={{ publicDisplayConsent: allowed, publicNameConsent: nameAllowed, publicAreaConsent: areaAllowed, publicServiceConsent: serviceAllowed }} disabled={busy} onChange={(value) => void changePermission(value)} />
    {busy ? <p role="status" className="mt-2 text-xs text-gray-500">Saving preferences…</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
  </div>;
}
