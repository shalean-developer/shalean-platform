"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { applyRebookSnapshot, BOOKING_REBOOK_SNAPSHOT_LS_KEY } from "@/lib/booking/rebookApply";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { BookingTimeline } from "@/components/booking/BookingTimeline";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type BookingRow = {
  id: string;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  currency: string | null;
  status: string | null;
  booking_snapshot: unknown;
  created_at: string;
  paystack_reference: string;
  cleaner_id?: string | null;
  assigned_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

function formatWhen(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return time ? `${label} · ${time}` : label;
}

function priceZar(row: BookingRow): number {
  if (typeof row.total_paid_zar === "number") return row.total_paid_zar;
  return Math.round((row.amount_paid_cents ?? 0) / 100);
}

function ReviewForm({ bookingId, onDone }: { bookingId: string; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const sb = getSupabaseBrowser();
    const { data: sessionData } = await sb?.auth.getSession() ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setErr("Please sign in.");
      setBusy(false);
      return;
    }
    const res = await fetch("/api/bookings/review", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, rating, comment }),
    });
    const j = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(j.error ?? "Could not save review.");
      setBusy(false);
      return;
    }
    setDone(true);
    onDone();
    setBusy(false);
  }

  if (done) {
    return <p className="text-sm text-emerald-700 dark:text-emerald-400">Thanks — your review was saved.</p>;
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Rate your clean</p>
      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs text-zinc-500">Stars</label>
        <select
          value={rating}
          onChange={(e) => setRating(Number(e.target.value))}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Optional comment"
        rows={2}
        className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
      />
      <button
        type="submit"
        disabled={busy}
        className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Saving…" : "Submit review"}
      </button>
      {err ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{err}</p> : null}
    </form>
  );
}

export default function AccountBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [referral, setReferral] = useState<{
    referralCode: string;
    totalEarned: number;
    referralsCount: number;
    creditBalance: number;
  } | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Sign-in is not available.");
      setLoading(false);
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Please sign in to see your bookings.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/bookings/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const refRes = await fetch("/api/referrals/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { bookings?: BookingRow[]; error?: string };
    const refJson = (await refRes.json()) as {
      referralCode?: string;
      totalEarned?: number;
      referralsCount?: number;
      creditBalance?: number;
    };
    if (!res.ok) {
      setError(json.error ?? "Could not load bookings.");
      setBookings([]);
      setLoading(false);
      return;
    }
    setBookings(json.bookings ?? []);
    if (refRes.ok && refJson.referralCode) {
      setReferral({
        referralCode: refJson.referralCode,
        totalEarned: Number(refJson.totalEarned ?? 0),
        referralsCount: Number(refJson.referralsCount ?? 0),
        creditBalance: Number(refJson.creditBalance ?? 0),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function handleRebook(row: BookingRow) {
    const snap = row.booking_snapshot as BookingSnapshotV1 | null;
    if (!applyRebookSnapshot(snap)) {
      try {
        localStorage.setItem(BOOKING_REBOOK_SNAPSHOT_LS_KEY, JSON.stringify(snap ?? {}));
      } catch {
        /* ignore */
      }
      router.push(bookingFlowHref("entry"));
      return;
    }
    router.push(bookingFlowHref("when"));
  }

  if (loading) {
    return (
      <div className="min-h-dvh bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">Loading your bookings…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
        <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-700 dark:text-zinc-200">{error}</p>
          <Link
            href="/booking"
            className="mt-4 inline-flex text-sm font-semibold text-emerald-700 dark:text-emerald-400"
          >
            Book a clean
          </Link>
        </div>
      </div>
    );
  }

  const list = bookings ?? [];

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200/90 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Account</p>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">My bookings</h1>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            Home
          </Link>
          <Link
            href="/account/subscriptions"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Subscriptions
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {referral ? (
          <section className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Refer &amp; Earn</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Invite friends and earn R50 credit each.</p>
            <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-zinc-800/60">
              <p className="break-all">/?ref={referral.referralCode}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatPill label="Total earned" value={`R ${referral.totalEarned.toLocaleString("en-ZA")}`} />
              <StatPill label="Referrals" value={String(referral.referralsCount)} />
              <StatPill label="Credit balance" value={`R ${referral.creditBalance.toLocaleString("en-ZA")}`} />
            </div>
            <button
              type="button"
              className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                const link = `${window.location.origin}/?ref=${referral.referralCode}`;
                void navigator.clipboard.writeText(link);
              }}
            >
              Copy link
            </button>
          </section>
        ) : null}

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">No bookings yet</p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              When you book a clean, your history will show up here.
            </p>
            <Link
              href="/booking"
              className="mt-6 inline-flex rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm"
            >
              Book a clean
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {list.map((row, index) => {
              const open = detailId === row.id;
              const isLatest = index === 0;
              return (
                <li
                  key={row.id}
                  className={[
                    "overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900",
                    isLatest
                      ? "border-emerald-400/90 ring-2 ring-emerald-500/25 dark:border-emerald-700 dark:ring-emerald-500/20"
                      : "border-zinc-200 dark:border-zinc-800",
                  ].join(" ")}
                >
                  <div className="p-4 sm:p-5">
                    {isLatest ? (
                      <p className="mb-3 inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-200">
                        Latest
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-zinc-900 dark:text-zinc-50">
                          {row.service ?? "Cleaning service"}
                        </p>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                          {formatWhen(row.date, row.time)}
                        </p>
                        {row.location ? (
                          <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{row.location}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          R {priceZar(row).toLocaleString("en-ZA")}
                        </p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                          {row.status ?? "confirmed"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRebook(row)}
                        className="inline-flex flex-1 min-w-[120px] items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white sm:flex-none"
                      >
                        Rebook
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailId(open ? null : row.id)}
                        className="inline-flex flex-1 min-w-[120px] items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 sm:flex-none"
                      >
                        {open ? "Hide details" : "View details"}
                      </button>
                    </div>

                    {open ? (
                      <div className="mt-4 space-y-4 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
                        <BookingTimeline
                          fields={{
                            status: row.status,
                            assigned_at: row.assigned_at,
                            en_route_at: row.en_route_at,
                            started_at: row.started_at,
                            completed_at: row.completed_at,
                          }}
                        />
                        <p>
                          <span className="text-zinc-400">Reference</span>{" "}
                          <span className="font-mono text-xs">{row.paystack_reference}</span>
                        </p>
                        <p>
                          <span className="text-zinc-400">Booked</span>{" "}
                          {new Date(row.created_at).toLocaleString("en-ZA")}
                        </p>
                        {(row.status ?? "").toLowerCase() === "completed" ? (
                          <ReviewForm bookingId={row.id} onDone={() => void load()} />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-xs dark:bg-zinc-800">
      {label}: {value}
    </span>
  );
}
