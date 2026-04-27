"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublicDispatchOfferView } from "@/lib/dispatch/offerByToken";

type Props = {
  token: string;
  initial: PublicDispatchOfferView;
};

export function OfferTokenPageClient({ token, initial }: Props) {
  const [view, setView] = useState(initial);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const [banner, setBanner] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  const expired = useMemo(() => {
    const ms = new Date(view.expiresAtIso).getTime();
    return Number.isFinite(ms) && Date.now() >= ms;
  }, [view.expiresAtIso]);

  const pending = view.status === "pending" && !expired;

  async function postAction(path: "accept" | "decline") {
    setBusy(path);
    setBanner(null);
    try {
      const res = await fetch(`/api/offers/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; status?: string };
      if (!res.ok) {
        setBanner({ kind: "err", text: json.error ?? `Request failed (${res.status})` });
        return;
      }
      if (path === "accept") {
        setView((v) => ({ ...v, status: "accepted" }));
        setBanner({ kind: "ok", text: "You are assigned to this job. Open the cleaner app under My Jobs to see full details." });
      } else {
        setView((v) => ({ ...v, status: "rejected" }));
        setBanner({ kind: "ok", text: "You declined this offer. Thank you — we will offer the job to another cleaner." });
      }
    } catch (e) {
      setBanner({ kind: "err", text: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Job offer</h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Shalean Cleaning</p>

      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <dl className="space-y-3 text-sm">
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

        {expired && view.status === "pending" && (
          <p className="mt-6 text-sm text-amber-700 dark:text-amber-400">This offer has expired.</p>
        )}
        {!expired && view.status !== "pending" && (
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
