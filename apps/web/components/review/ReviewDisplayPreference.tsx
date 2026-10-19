"use client";
import { useState } from "react";
import { dashboardFetchJson } from "@/lib/dashboard/dashboardFetch";

export function ReviewDisplayPreference({ bookingId, allowed, onSaved }: { bookingId: string; allowed: boolean; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function changePermission(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await dashboardFetchJson("/api/bookings/review", { method: "PATCH", json: { bookingId, publicDisplayConsent: next } });
      if (!result.ok) { setError(result.error); return; }
      await onSaved();
    } catch { setError("Could not save your display preference. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 border-t border-gray-100 pt-4">
    <label className="flex items-start gap-3 text-sm text-gray-600">
      <input type="checkbox" checked={allowed} disabled={busy} onChange={(e) => void changePermission(e.target.checked)} className="mt-1 h-4 w-4" />
      <span>Allow Shalean to display my written review anonymously on its website. You can turn this off at any time. Your star rating still contributes to overall ratings.</span>
    </label>
    {busy ? <p role="status" className="mt-2 text-xs text-gray-500">Saving preference…</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
  </div>;
}
