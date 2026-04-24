"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OpsSnapshot } from "@/lib/admin/opsSnapshot";

type OpsSnapshotState =
  | { status: "loading"; data: null; error: null }
  | { status: "ok"; data: OpsSnapshot; error: null }
  | { status: "error"; data: OpsSnapshot | null; error: string };

const POLL_MS = 25_000;

function normalizeSnapshot(json: OpsSnapshot): OpsSnapshot {
  return {
    unassignable: json.unassignable,
    slaBreaches: json.slaBreaches,
    oldestBreachMinutes: typeof json.oldestBreachMinutes === "number" ? json.oldestBreachMinutes : 0,
    slaBreachesOverdueGt30: typeof json.slaBreachesOverdueGt30 === "number" ? json.slaBreachesOverdueGt30 : 0,
    slaBreachesOverdueGt10Le30: typeof json.slaBreachesOverdueGt10Le30 === "number" ? json.slaBreachesOverdueGt10Le30 : 0,
    slaWorstBreachPendingSinceIso:
      typeof json.slaWorstBreachPendingSinceIso === "string" ? json.slaWorstBreachPendingSinceIso : null,
    unassigned: json.unassigned,
    startingSoon: json.startingSoon,
    startingSoonNextMinutes:
      typeof json.startingSoonNextMinutes === "number" && Number.isFinite(json.startingSoonNextMinutes)
        ? json.startingSoonNextMinutes
        : null,
  };
}

/** Avoid ±1 poll flicker in UI — only show arrow when |Δ| ≥ 2. */
function trendHintFromDelta(prev: number, next: number): string | null {
  const d = next - prev;
  if (d === 0) return null;
  if (Math.abs(d) < 2) return null;
  return d > 0 ? `(↑ from ${prev})` : `(↓ from ${prev})`;
}

export type OpsQueueTrendHints = {
  sla: string | null;
  unassignable: string | null;
  unassigned: string | null;
  startingSoon: string | null;
};

const emptyHints: OpsQueueTrendHints = {
  sla: null,
  unassignable: null,
  unassigned: null,
  startingSoon: null,
};

export function useOpsSnapshot(getAccessToken: () => Promise<string | null>) {
  const [state, setState] = useState<OpsSnapshotState>({ status: "loading", data: null, error: null });
  const [lastUpdatedMs, setLastUpdatedMs] = useState<number | null>(null);
  const [trendHints, setTrendHints] = useState<OpsQueueTrendHints>(emptyHints);
  const [lastSlaWorseningAt, setLastSlaWorseningAt] = useState<number | null>(null);
  const [slaPulseSignal, setSlaPulseSignal] = useState(0);

  const prevSnapRef = useRef<OpsSnapshot | null>(null);

  const fetchSnapshot = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setState({ status: "error", data: null, error: "Not signed in." });
      return;
    }
    const res = await fetch("/api/admin/ops-snapshot", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as OpsSnapshot & { error?: string };
    if (!res.ok) {
      setState({ status: "error", data: null, error: json.error ?? "Failed to load ops snapshot." });
      prevSnapRef.current = null;
      return;
    }
    const next = normalizeSnapshot(json);
    const prev = prevSnapRef.current;

    if (prev) {
      setTrendHints({
        sla: trendHintFromDelta(prev.slaBreaches, next.slaBreaches),
        unassignable: trendHintFromDelta(prev.unassignable, next.unassignable),
        unassigned: trendHintFromDelta(prev.unassigned, next.unassigned),
        startingSoon: trendHintFromDelta(prev.startingSoon, next.startingSoon),
      });

      if (next.slaBreaches > prev.slaBreaches) {
        setLastSlaWorseningAt(Date.now());
        setSlaPulseSignal((v) => v + 1);
      }
    } else {
      setTrendHints(emptyHints);
      if (next.slaBreaches > 0) {
        setSlaPulseSignal((v) => v + 1);
      }
    }

    prevSnapRef.current = next;
    setLastUpdatedMs(Date.now());
    setState({
      status: "ok",
      data: next,
      error: null,
    });
  }, [getAccessToken]);

  useEffect(() => {
    void fetchSnapshot();
    const id = window.setInterval(() => {
      void fetchSnapshot();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [fetchSnapshot]);

  return {
    ...state,
    lastUpdatedMs,
    refetch: fetchSnapshot,
    trendHints,
    lastSlaWorseningAt,
    slaPulseSignal,
  };
}
