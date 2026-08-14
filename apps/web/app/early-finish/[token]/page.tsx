"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function EarlyFinishConfirmationPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [booking, setBooking] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!token) return;
    void fetch(`/api/early-finish/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Could not load confirmation.");
        setStatus(body.request?.status ?? null);
        setBooking(body.request?.booking ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load confirmation."))
      .finally(() => setLoading(false));
  }, [token]);

  async function decide(decision: "approve" | "reject") {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/early-finish/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save your response.");
      setStatus(body.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your response.");
    } finally {
      setSending(false);
    }
  }

  const resolved = status === "customer_approved" || status === "admin_approved" || status === "customer_rejected";
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-blue-600">Shalean Cleaning Services</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Confirm early completion</h1>
        {loading ? <p className="mt-4 text-slate-600">Loading your booking…</p> : null}
        {booking ? (
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Your cleaner says the booked cleaning has been completed earlier than the estimated time. Please confirm only if you are satisfied that the agreed cleaning work is complete.
          </p>
        ) : null}
        {status === "customer_approved" || status === "admin_approved" ? (
          <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800">Thank you. You confirmed that the cleaning is complete.</div>
        ) : null}
        {status === "customer_rejected" ? (
          <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm font-medium text-amber-800">Thank you. You indicated that more cleaning is needed. The job will remain in progress.</div>
        ) : null}
        {!loading && !resolved && booking ? (
          <div className="mt-6 grid gap-3">
            <button type="button" disabled={sending} onClick={() => void decide("approve")} className="h-12 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Yes, the cleaning is complete
            </button>
            <button type="button" disabled={sending} onClick={() => void decide("reject")} className="h-12 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60">
              No, more cleaning is needed
            </button>
          </div>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  );
}
