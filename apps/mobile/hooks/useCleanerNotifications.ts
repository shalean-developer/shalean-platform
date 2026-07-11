import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useState } from "react";
import { johannesburgCalendarYmd } from "@shalean/utils";
import { deriveCleanerJobActions } from "@/lib/jobs/deriveCleanerJobActions";
import { formatJobTime, isJobCompleted, jobStatusLabel, pickNextJob } from "@/lib/jobs/jobDisplay";
import { useCleanerEarnings } from "@/hooks/useCleanerDashboard";
import { useCleanerJobsCard } from "@/hooks/useCleanerJobs";
import type { CleanerEarningsResponse, CleanerJobWire, CleanerNotificationItem } from "@/services/types/cleanerJobs";

const READ_IDS_KEY = "shalean.notifications.read_ids.v1";

async function loadReadIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(READ_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

async function saveReadIds(ids: Set<string>): Promise<void> {
  const list = [...ids].slice(-200);
  await AsyncStorage.setItem(READ_IDS_KEY, JSON.stringify(list));
}

/** Build an in-app feed from jobs + earnings (no dedicated notifications API yet). */
export function buildCleanerNotifications(input: {
  jobs: CleanerJobWire[] | undefined;
  earnings: CleanerEarningsResponse | undefined;
  now?: Date;
}): CleanerNotificationItem[] {
  const items: CleanerNotificationItem[] = [];
  const now = input.now ?? new Date();
  const today = johannesburgCalendarYmd(now);
  const jobs = input.jobs ?? [];

  for (const job of jobs) {
    const actions = deriveCleanerJobActions(job);
    if (actions.accept) {
      items.push({
        id: `assign:${job.id}`,
        kind: "booking_assigned",
        title: "New job assigned",
        body: `${formatJobTime(job.time)} · ${String(job.customer_name ?? "Customer").trim() || "Customer"}`,
        createdAt: String(job.assigned_at ?? job.date ?? now.toISOString()),
        href: `/(cleaner)/job/${job.id}`,
        bookingId: job.id,
      });
    }
  }

  const next = pickNextJob(jobs.filter((j) => String(j.date ?? "").trim() === today));
  if (next && !isJobCompleted(next)) {
    const label = jobStatusLabel(next);
    if (label !== "Assigned") {
      items.push({
        id: `reminder:${next.id}:${today}`,
        kind: "reminder",
        title: "Today's next job",
        body: `${formatJobTime(next.time)} · ${String(next.customer_name ?? "Customer").trim() || "Customer"} · ${label}`,
        createdAt: now.toISOString(),
        href: `/(cleaner)/job/${next.id}`,
        bookingId: next.id,
      });
    }
  }

  const summary = input.earnings?.summary;
  if (summary) {
    const pending = Number(summary.pending_cents ?? 0) + Number(summary.eligible_cents ?? 0);
    if (pending > 0) {
      items.push({
        id: `payment:pending:${today}`,
        kind: "payment",
        title: "Earnings awaiting payout",
        body: "Open Earnings to see pending and eligible amounts.",
        createdAt: now.toISOString(),
        href: "/(cleaner)/(tabs)/earnings",
      });
    }
    const recentPaid = (input.earnings?.rows ?? [])
      .filter((r) => String(r.payout_status).toLowerCase() === "paid")
      .slice(0, 3);
    for (const row of recentPaid) {
      items.push({
        id: `payment:paid:${row.booking_id}`,
        kind: "payment",
        title: "Payment recorded",
        body: `${row.service || "Cleaning"} · ${row.date ?? "Recent"}`,
        createdAt: row.payout_paid_at ?? row.date ?? now.toISOString(),
        href: "/(cleaner)/(tabs)/earnings",
        bookingId: row.booking_id,
      });
    }
  }

  items.push({
    id: "announcement:workforce-v1",
    kind: "announcement",
    title: "Welcome to your workforce hub",
    body: "Today, Schedule, and Earnings keep your workday in one place.",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function useCleanerNotifications() {
  const jobsQuery = useCleanerJobsCard();
  const earningsQuery = useCleanerEarnings();
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [readReady, setReadReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadReadIds().then((ids) => {
      if (!cancelled) {
        setReadIds(ids);
        setReadReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () =>
      buildCleanerNotifications({
        jobs: jobsQuery.data,
        earnings: earningsQuery.data,
      }),
    [jobsQuery.data, earningsQuery.data],
  );

  const unreadCount = useMemo(
    () => items.filter((i) => !readIds.has(i.id)).length,
    [items, readIds],
  );

  const markRead = useCallback(async (id: string) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      void saveReadIds(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(async () => {
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const item of items) next.add(item.id);
      void saveReadIds(next);
      return next;
    });
  }, [items]);

  return {
    data: items,
    isLoading: (!jobsQuery.data && jobsQuery.isLoading) || !readReady,
    isError: jobsQuery.isError && !jobsQuery.data,
    error: jobsQuery.error,
    isRefetching: jobsQuery.isRefetching || earningsQuery.isRefetching,
    refetch: async () => {
      await Promise.all([jobsQuery.refetch(), earningsQuery.refetch()]);
    },
    readIds,
    unreadCount,
    markRead,
    markAllRead,
    isRead: (id: string) => readIds.has(id),
  };
}
