"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { persistLastSlaTierFilter, readLastSlaTierFilter, type SlaTierFilterKey } from "@/lib/admin/lastSlaTierFilter";
import { emitAdminToast } from "@/lib/admin/toastBus";
import BookingDetailsSheet from "@/components/admin/BookingDetailsSheet";
import { SlaBreachQueueTable, SlaWorstBreachPinned, type SlaBreachRow } from "@/components/admin/SlaBreachQueueTable";
import type { CleanerOption } from "@/components/admin/AdminAssignForm";

const POLL_MS = 25_000;

type TierFilter = SlaTierFilterKey;

function sortSlaQueue(list: SlaBreachRow[]): SlaBreachRow[] {
  return [...list].sort((a, b) => {
    if (b.slaBreachMinutes !== a.slaBreachMinutes) return b.slaBreachMinutes - a.slaBreachMinutes;
    const ta = new Date(a.became_pending_at ?? a.created_at).getTime();
    const tb = new Date(b.became_pending_at ?? b.created_at).getTime();
    return ta - tb;
  });
}

export default function AdminSlaBreachesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<SlaBreachRow[]>([]);
  const [slaThresholdMinutes, setSlaThresholdMinutes] = useState<number>(10);
  const [cleaners, setCleaners] = useState<CleanerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [assignBookingId, setAssignBookingId] = useState<string | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [escalatingId, setEscalatingId] = useState<string | null>(null);
  const [retryCooldownUntilById, setRetryCooldownUntilById] = useState<Record<string, number>>({});
  const [escalateCooldownUntilById, setEscalateCooldownUntilById] = useState<Record<string, number>>({});
  const [bulkRetryBusy, setBulkRetryBusy] = useState(false);
  const openAssignHandledRef = useRef<string | null>(null);
  const tierRestoredRef = useRef(false);
  const RETRY_COOLDOWN_MS = 4000;
  const ESCALATE_COOLDOWN_MS = 5000;
  const BULK_RETRY_CAP = 40;
  const BULK_RETRY_STAGGER_MS = 75;

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Please sign in as admin.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/admin/bookings?filter=sla", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as {
      bookings?: SlaBreachRow[];
      metrics?: { slaBreachMinutes?: number };
      error?: string;
    };

    if (!res.ok) {
      setError(json.error ?? "Could not load SLA breaches.");
      setRows([]);
      setLoading(false);
      return;
    }

    setError(null);
    const list = (json.bookings ?? []).map((r) => {
      const raw = r as SlaBreachRow & { lastActionMinutesAgo?: unknown };
      const lam =
        typeof raw.lastActionMinutesAgo === "number" && Number.isFinite(raw.lastActionMinutesAgo)
          ? raw.lastActionMinutesAgo
          : null;
      return {
        ...r,
        slaBreachMinutes: typeof r.slaBreachMinutes === "number" ? r.slaBreachMinutes : 0,
        lastActionMinutesAgo: lam,
      };
    });
    setRows(list);
    const th = json.metrics?.slaBreachMinutes;
    setSlaThresholdMinutes(typeof th === "number" && th > 0 ? th : 10);
    setLoading(false);

    const cr = await fetch("/api/admin/cleaners", { headers: { Authorization: `Bearer ${token}` } });
    if (cr.ok) {
      const cj = (await cr.json()) as { cleaners?: CleanerOption[] };
      setCleaners(cj.cleaners ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tierRestoredRef.current) return;
    tierRestoredRef.current = true;
    const stored = readLastSlaTierFilter();
    if (stored) setTierFilter(stored);
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const ch = sb
      .channel("admin-sla-breaches-bookings")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [load]);

  const visibleRows = useMemo(() => {
    let v = rows;
    if (tierFilter === "gt30") v = v.filter((r) => r.slaBreachMinutes > 30);
    else if (tierFilter === "gt10") v = v.filter((r) => r.slaBreachMinutes > 10);
    return sortSlaQueue(v);
  }, [rows, tierFilter]);

  const liveHeader = useMemo(() => {
    const n = visibleRows.length;
    const gt30 = visibleRows.filter((r) => r.slaBreachMinutes > 30).length;
    const oldest = n === 0 ? 0 : Math.max(...visibleRows.map((r) => r.slaBreachMinutes));
    return { n, gt30, oldest };
  }, [visibleRows]);

  const showPinnedWorst = visibleRows.length > 1;
  const worstRow = visibleRows[0];
  const tableRows = showPinnedWorst ? visibleRows.slice(1) : visibleRows;

  const stripOpenAssign = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    if (!p.has("openAssign")) return;
    p.delete("openAssign");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (searchParams.get("openAssign") !== "1") {
      openAssignHandledRef.current = null;
      return;
    }
    if (loading) return;
    const first = visibleRows[0]?.id;
    if (!first) {
      stripOpenAssign();
      return;
    }
    const dedupeKey = `${first}:openAssign`;
    if (openAssignHandledRef.current === dedupeKey) return;
    openAssignHandledRef.current = dedupeKey;
    emitAdminToast("Opening assign…", "info");
    setAssignBookingId(first);
    stripOpenAssign();
  }, [loading, searchParams, visibleRows, stripOpenAssign]);

  const retryDispatchRequest = useCallback(async (bookingId: string): Promise<{ ok: boolean; message?: string }> => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return { ok: false, message: "Session expired." };
    const res = await fetch("/api/dispatch/assign", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    if (!res.ok) {
      const j = (await res.json()) as { error?: string; message?: string };
      return { ok: false, message: j.message ?? j.error ?? "Retry dispatch failed" };
    }
    return { ok: true };
  }, []);

  const handleRetryOne = useCallback(
    async (bookingId: string) => {
      setRetryingId(bookingId);
      try {
        const r = await retryDispatchRequest(bookingId);
        if (!r.ok) emitAdminToast(r.message ?? "Retry dispatch failed", "error");
        else {
          emitAdminToast("Dispatch retry triggered", "success");
          await load();
        }
      } finally {
        setRetryingId(null);
        const until = Date.now() + RETRY_COOLDOWN_MS;
        setRetryCooldownUntilById((m) => ({ ...m, [bookingId]: until }));
      }
    },
    [load, retryDispatchRequest],
  );

  const handleEscalate = useCallback(async (row: SlaBreachRow) => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      emitAdminToast("Session expired.", "error");
      return;
    }
    setEscalatingId(row.id);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(row.id)}/sla-escalate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          slaBreachMinutes: row.slaBreachMinutes,
          lastActionMinutesAgo: row.lastActionMinutesAgo ?? null,
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        emitAdminToast(j.error ?? "Escalation failed", "error");
        return;
      }
      emitAdminToast("Escalated ✓ (sent to Slack)", "success");
      const until = Date.now() + ESCALATE_COOLDOWN_MS;
      setEscalateCooldownUntilById((m) => ({ ...m, [row.id]: until }));
    } finally {
      setEscalatingId(null);
    }
  }, []);

  const handleBulkRetry = useCallback(async () => {
    if (visibleRows.length === 0) return;
    setBulkRetryBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      const capped = visibleRows.length > BULK_RETRY_CAP;
      const list = capped ? visibleRows.slice(0, BULK_RETRY_CAP) : visibleRows;
      if (capped) {
        emitAdminToast(`Retry all capped at ${BULK_RETRY_CAP} (staggered)`, "info");
      }
      for (let i = 0; i < list.length; i++) {
        if (i > 0) {
          await new Promise((r) => setTimeout(r, BULK_RETRY_STAGGER_MS));
        }
        const row = list[i]!;
        const res = await retryDispatchRequest(row.id);
        if (res.ok) ok++;
        else fail++;
        const until = Date.now() + RETRY_COOLDOWN_MS;
        setRetryCooldownUntilById((m) => ({ ...m, [row.id]: until }));
      }
      emitAdminToast(`Retry all: ${ok} ok${fail ? `, ${fail} failed` : ""}`, fail ? "info" : "success");
      await load();
    } finally {
      setBulkRetryBusy(false);
    }
  }, [load, retryDispatchRequest, visibleRows]);

  const handleAssignSuccess = useCallback(
    (id: string) => {
      setAssignBookingId(null);
      setRows((cur) => cur.filter((r) => r.id !== id));
      emitAdminToast("Offer sent ✓", "success");
      void load();
    },
    [load],
  );

  const closeDetails = useCallback(() => {
    setSelectedBookingId(null);
  }, []);

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Operations</p>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">SLA breach queue</h2>
          {!loading && visibleRows.length > 0 ? (
            <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
              <span className="tabular-nums">{liveHeader.n} breaches</span>
              <span className="text-zinc-400">·</span>
              <span className="tabular-nums">{liveHeader.gt30} &gt;30m</span>
              <span className="text-zinc-400">·</span>
              <span>
                oldest <span className="font-bold tabular-nums text-red-700 dark:text-red-300">{liveHeader.oldest}m</span>
              </span>
            </p>
          ) : null}
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Paid pending bookings past the dispatch SLA clock (currently{" "}
            <span className="font-medium tabular-nums">{slaThresholdMinutes} min</span> from pending clock). Sorted by
            worst overdue first, then longest in queue.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            <Link href="/admin/bookings?filter=sla" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Open in bookings table
            </Link>
            {" · "}
            <Link href="/admin" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Dashboard
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Filter</span>
          {(
            [
              ["all", "All"],
              ["gt30", ">30m"],
              ["gt10", ">10m"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTierFilter(key);
                persistLastSlaTierFilter(key);
              }}
              className={[
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                tierFilter === key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            disabled={bulkRetryBusy || visibleRows.length === 0}
            onClick={() => void handleBulkRetry()}
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
          >
            {bulkRetryBusy ? "Retrying…" : "Retry all (visible)"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">
          {error}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
          Loading SLA breaches…
        </div>
      ) : !loading && rows.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-6 py-12 text-center text-base font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          ✅ No SLA breaches — system is healthy
        </div>
      ) : !loading && visibleRows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white px-6 py-10 text-center text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          No bookings match this severity filter. Try <span className="font-medium">All</span>.
        </div>
      ) : (
        <div className="space-y-0">
          {showPinnedWorst && worstRow ? (
            <SlaWorstBreachPinned
              row={worstRow}
              cleaners={cleaners}
              assignBookingId={assignBookingId}
              onToggleAssign={(id) => setAssignBookingId((cur) => (cur === id ? null : id))}
              onAssignSuccess={handleAssignSuccess}
              onAssignError={(msg) => emitAdminToast(msg || "Assignment failed", "error")}
              onAssignCascadeExhausted={(row) =>
                emitAdminToast(
                  `Smart assign exhausted (${row.slaBreachMinutes}m breach) — try Escalate or Retry dispatch.`,
                  "info",
                )
              }
              onViewDetails={(id) => setSelectedBookingId(id)}
              onRetryDispatch={(id) => void handleRetryOne(id)}
              onEscalate={(r) => void handleEscalate(r)}
              retryingId={retryingId}
              escalatingId={escalatingId}
              cooldownUntilById={retryCooldownUntilById}
              escalateCooldownUntilById={escalateCooldownUntilById}
            />
          ) : null}
          <SlaBreachQueueTable
            rows={tableRows}
            cleaners={cleaners}
            assignBookingId={assignBookingId}
            onToggleAssign={(id) => setAssignBookingId((cur) => (cur === id ? null : id))}
            onAssignSuccess={handleAssignSuccess}
            onAssignError={(msg) => emitAdminToast(msg || "Assignment failed", "error")}
            onAssignCascadeExhausted={(row) =>
              emitAdminToast(
                `Smart assign exhausted (${row.slaBreachMinutes}m breach) — try Escalate or Retry dispatch.`,
                "info",
              )
            }
            onViewDetails={(id) => setSelectedBookingId(id)}
            onRetryDispatch={(id) => void handleRetryOne(id)}
            onEscalate={(r) => void handleEscalate(r)}
            retryingId={retryingId}
            escalatingId={escalatingId}
            cooldownUntilById={retryCooldownUntilById}
            escalateCooldownUntilById={escalateCooldownUntilById}
          />
        </div>
      )}

      <BookingDetailsSheet bookingId={selectedBookingId} onClose={closeDetails} />
    </main>
  );
}
