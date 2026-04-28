"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import type { CleanerPayoutSummary, CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";
import { normalizeCleanerPayoutSummaryRow } from "@/lib/cleaner/normalizeCleanerPayoutSummaryRow";

type ApiResponse = {
  summary?: {
    pending_cents: number;
    eligible_cents: number;
    paid_cents: number;
    invalid_cents?: number;
    today_cents?: number;
    week_cents?: number;
    month_cents?: number;
  };
  rows?: unknown[];
  paymentDetails?: { readyForPayout?: boolean; missingBankDetails?: boolean };
  error?: string;
};

const POLL_MS = 90_000;
const STALE_MS = 30_000;

export type CleanerEarningsDataContextValue = {
  loading: boolean;
  error: string | null;
  summary: CleanerPayoutSummary | null;
  rows: CleanerPayoutSummaryRow[];
  missingBankDetails: boolean;
  /** Resolves with the summary just fetched (or null on failure / signed out). */
  refresh: () => Promise<CleanerPayoutSummary | null>;
};

export const CleanerEarningsDataContext = createContext<CleanerEarningsDataContextValue | null>(null);

function mapRows(list: unknown[]): CleanerPayoutSummaryRow[] {
  return list.map((r) => {
    const row = r as Record<string, unknown>;
    return normalizeCleanerPayoutSummaryRow(
      {
        booking_id: String(row.booking_id),
        date: (row.date as string | null | undefined) ?? null,
        service: String(row.service ?? "Cleaning"),
        location: String(row.location ?? "—"),
        payout_status: row.payout_status,
        payout_paid_at: row.payout_paid_at,
        payout_run_id: row.payout_run_id,
        payout_frozen_cents: row.payout_frozen_cents,
        amount_cents: Math.max(0, Math.round(Number(row.amount_cents) || 0)),
      },
      {},
    );
  });
}

export function CleanerEarningsDataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CleanerPayoutSummary | null>(null);
  const [rows, setRows] = useState<CleanerPayoutSummaryRow[]>([]);
  const [missingBankDetails, setMissingBankDetails] = useState(false);
  const lastFetchedAtRef = useRef(0);

  const load = useCallback(async (): Promise<CleanerPayoutSummary | null> => {
    try {
      const headers = await getCleanerAuthHeaders();
      if (!headers) {
        setError("Not signed in.");
        setSummary(null);
        setRows([]);
        return null;
      }
      const res = await cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers });
      const json = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(json.error ?? "Could not load payout summary.");
        setSummary(null);
        setRows([]);
        return null;
      }
      setError(null);
      const s = json.summary;
      const nextSummary: CleanerPayoutSummary =
        s && typeof s.pending_cents === "number"
          ? {
              pending_cents: s.pending_cents,
              eligible_cents: s.eligible_cents ?? 0,
              paid_cents: s.paid_cents ?? 0,
              invalid_cents: typeof s.invalid_cents === "number" ? s.invalid_cents : 0,
              today_cents: typeof s.today_cents === "number" ? s.today_cents : 0,
              week_cents: typeof s.week_cents === "number" ? s.week_cents : 0,
              month_cents: typeof s.month_cents === "number" ? s.month_cents : 0,
            }
          : {
              pending_cents: 0,
              eligible_cents: 0,
              paid_cents: 0,
              invalid_cents: 0,
              today_cents: 0,
              week_cents: 0,
              month_cents: 0,
            };
      setSummary(nextSummary);
      const list = Array.isArray(json.rows) ? json.rows : [];
      setRows(mapRows(list));
      setMissingBankDetails(json.paymentDetails?.missingBankDetails === true);
      lastFetchedAtRef.current = Date.now();
      return nextSummary;
    } catch {
      setError("Network error.");
      setSummary(null);
      setRows([]);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastFetchedAtRef.current;
      if (last > 0 && Date.now() - last > STALE_MS) void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const value = useMemo(
    () => ({
      loading,
      error,
      summary,
      rows,
      missingBankDetails,
      refresh: load,
    }),
    [loading, error, summary, rows, missingBankDetails, load],
  );

  return <CleanerEarningsDataContext.Provider value={value}>{children}</CleanerEarningsDataContext.Provider>;
}

export function useCleanerEarningsData(): CleanerEarningsDataContextValue {
  const ctx = useContext(CleanerEarningsDataContext);
  if (!ctx) {
    throw new Error("useCleanerEarningsData must be used within CleanerEarningsDataProvider.");
  }
  return ctx;
}
