"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicDispatchOfferClosedReason, PublicDispatchOfferView } from "@/lib/dispatch/offerByToken";

type Props = {
  token: string;
  initial: PublicDispatchOfferView;
  /** From `?stale=1` on tracked redirects for very old offer rows. */
  linkStaleHint?: boolean;
};

function formatExpiresCountdown(expiresAtIso: string, nowMs: number): string | null {
  const exp = new Date(expiresAtIso).getTime();
  if (!Number.isFinite(exp)) return null;
  const msLeft = exp - nowMs;
  if (msLeft <= 0) return "Expired";
  const totalSec = Math.ceil(msLeft / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `Expires in ${s}s`;
  return `Expires in ${m}:${String(s).padStart(2, "0")}`;
}

function closedHeadline(reason: PublicDispatchOfferClosedReason | undefined, linkStaleHint: boolean): string {
  if (linkStaleHint && (reason === "expired" || reason === "unknown")) {
    return "This link is quite old — the job may no longer be available.";
  }
  switch (reason) {
    case "expired":
      return "This job is no longer available (offer expired).";
    case "taken":
      return "This offer was already accepted.";
    case "declined":
      return "This offer was declined.";
    case "cancelled":
      return "This booking was cancelled — the job is no longer available.";
    case "payment_expired":
      return "Payment for this booking did not complete — the job is no longer available.";
    default:
      return "This offer is no longer available.";
  }
}

export function OfferTokenPageClient({ token, initial, linkStaleHint = false }: Props) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const [banner, setBanner] = useState<null | { kind: "ok" | "err"; text: string }>(null);
  const [lostRace, setLostRace] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const expired = useMemo(() => {
    if (view.offeredClosed) return true;
    const ms = new Date(view.expiresAtIso).getTime();
    return Number.isFinite(ms) && nowMs >= ms;
  }, [view.offeredClosed, view.expiresAtIso, nowMs]);

  const pending =
    view.surface === "active" && view.status === "pending" && !expired && !view.offeredClosed;

  const expiresLabel = useMemo(() => {
    if (!pending) return null;
    return formatExpiresCountdown(view.expiresAtIso, nowMs);
  }, [pending, view.expiresAtIso, nowMs]);

  async function postAction(path: "accept" | "decline") {
    setBusy(path);
    setBanner(null);
    setLostRace(false);
    try {
      const res = await fetch(`/api/offers/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        status?: string;
        failure?: string;
        machineReason?: string;
      };
      if (!res.ok) {
        const lost =
          json.machineReason === "already_taken" ||
          json.failure === "assigned_other" ||
          json.failure === "booking_taken";
        setLostRace(lost);
        setBanner({
          kind: "err",
          text: lost
            ? "This job was just taken by another cleaner."
            : (json.error ?? `Request failed (${res.status})`),
        });
        return;
      }
      if (path === "accept") {
        setView((v) => ({
          ...v,
          status: "accepted",
          surface: "closed",
          closedReason: "taken",
        }));
        setBanner({
          kind: "ok",
          text: "You are assigned to this job. Open the cleaner app under My Jobs to see full details.",
        });
      } else {
        setView((v) => ({
          ...v,
          status: "rejected",
          surface: "closed",
          closedReason: "declined",
        }));
        setBanner({
          kind: "ok",
          text: "You declined this offer. Thank you — we will offer the job to another cleaner.",
        });
      }
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  const showClosedChrome = view.surface === "closed" || lostRace;
  const closedReasonForUi = lostRace ? ("taken" as const) : view.closedReason;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Job offer</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Shalean Cleaning</p>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {showClosedChrome ? (
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
            {closedHeadline(closedReasonForUi, linkStaleHint)}
          </p>
        ) : null}

        <dl className={`space-y-3 text-sm ${showClosedChrome ? "mt-4" : ""}`}>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Where</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{view.booking.location}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">When</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">
              {view.booking.dateLabel} · {view.booking.timeLabel}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Pay</dt>
            <dd className="mt-0.5 text-zinc-900 dark:text-zinc-100">{view.booking.payLabel}</dd>
          </div>
        </dl>

        {expiresLabel ? (
          <p
            className={`mt-4 text-sm font-medium ${expiresLabel === "Expired" ? "text-amber-700 dark:text-amber-400" : "text-zinc-700 dark:text-zinc-300"}`}
          >
            {expiresLabel}
          </p>
        ) : null}

        {!showClosedChrome && expired && view.status === "pending" && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            {view.offeredClosed ? "This job is no longer available (offer expired)." : "This offer has expired."}
          </p>
        )}
        {!showClosedChrome && !expired && view.status !== "pending" && (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            {view.status === "accepted"
              ? "This offer was already accepted."
              : view.status === "rejected"
                ? "This offer was declined."
                : `This offer is closed (${view.status}).`}
          </p>
        )}

        {banner && (
          <p
            className={`mt-6 text-sm ${banner.kind === "ok" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            role="status"
          >
            {banner.text}
          </p>
        )}

        {showClosedChrome || (expired && view.status === "pending") ? (
          <div className="mt-4">
            <Button asChild variant="secondary" className="w-full sm:w-auto">
              <Link href="/cleaner/dashboard">View available jobs</Link>
            </Button>
          </div>
        ) : null}

        {pending && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              type="button"
              className="min-w-[7rem]"
              disabled={busy !== null}
              onClick={() => void postAction("accept")}
            >
              {busy === "accept" ? "Working…" : "Accept"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-w-[7rem]"
              disabled={busy !== null}
              onClick={() => void postAction("decline")}
            >
              {busy === "decline" ? "Working…" : "Decline"}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
