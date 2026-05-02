"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Copy, Loader2, MapPin, MessageCircle, Navigation, Phone, Radio, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY,
  clearTtlCompleteSyncLockFromSession,
  consumeQueueTtlPruneNotice,
  enqueuePendingLifecycle,
  listPendingLifecycleForBooking,
  readTtlCompleteSyncLockFromSession,
  removePendingLifecycleByKey,
  retryFailedQueueItem,
  type PendingLifecycleAction,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";
import { isOfflineSignal } from "@/lib/cleaner/cleanerLifecycleNetworkSignal";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";
import { pickIncomingJobAvoidPhaseRegression } from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import { signalLifecycleFlushBackoffClear } from "@/lib/cleaner/cleanerLifecycleFlushBackoffSignal";
import { resetLifecycleBroadcastClientId } from "@/lib/cleaner/cleanerLifecycleQueueBroadcast";
import { subscribeTtlCompleteLockBroadcast } from "@/lib/cleaner/cleanerLifecycleTtlLockBroadcast";
import { logCleanerLifecycleClientEvent } from "@/lib/cleaner/cleanerLifecycleTelemetryClient";
import {
  useCleanerLifecycleOrchestrator,
  type UseCleanerLifecycleOrchestratorReturn,
} from "@/lib/cleaner/lifecycle/useCleanerLifecycleOrchestrator";
import type { CleanerBookingLineItemWire, CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { readCleanerJobDetailCache, writeCleanerJobDetailCache } from "@/lib/cleaner/cleanerJobDetailSessionCache";
import type { LifecycleWireLike } from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import { wireLikeFromJobDetailCacheBody } from "@/lib/cleaner/cleanerQueuedLifecycleFlushGuard";
import { buildScheduleHintModel, latenessVsSchedule } from "@/lib/cleaner/cleanerJobDetailScheduleModel";
import { buildEarningsIncludesLines, buildUnifiedJobScope } from "@/lib/cleaner/cleanerJobDetailUnifiedScope";
import {
  deriveCleanerJobLifecycleSlot,
  deriveMobilePhase,
  mobilePhaseDisplayForDashboard,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { directionsHrefFromQuery } from "@/lib/cleaner/directionsHref";
import { checkoutPriceLinesFromPersisted } from "@/lib/dashboard/bookingUtils";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { cn } from "@/lib/utils";

type CleanerJobDetailWire = {
  id?: string;
  server_now_ms?: number;
  service?: string | null;
  service_name?: string | null;
  service_slug?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  status?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  extras?: unknown[] | null;
  booking_snapshot?: unknown | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  price_breakdown?: Record<string, unknown> | null;
  total_price?: number | string | null;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  pricing_version_id?: string | null;
  lineItems?: CleanerBookingLineItemWire[] | null;
  scope_lines?: string[];
  duration_hours?: number | null;
  job_notes?: string | null;
  displayEarningsCents?: number | null;
  earnings_cents?: number | null;
  displayEarningsIsEstimate?: boolean;
  earnings_estimated?: boolean;
  is_team_job?: boolean | null;
  teamMemberCount?: number | null;
  team_roster_summary?: string | null;
  assigned_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  cleaner_response_status?: string | null;
};

function resolveWireForLifecycleFlush(
  bookingId: string,
  pageJobId: string | undefined,
  pageJob: CleanerJobDetailWire | null,
): LifecycleWireLike | null {
  const bid = bookingId.trim();
  const pid = pageJobId?.trim();
  if (pid && bid === pid && pageJob) {
    return {
      status: pageJob.status ?? null,
      en_route_at: pageJob.en_route_at ?? null,
      started_at: pageJob.started_at ?? null,
      completed_at: pageJob.completed_at ?? null,
      cleaner_response_status: pageJob.cleaner_response_status ?? null,
    };
  }
  const cached = readCleanerJobDetailCache(bid);
  return cached ? wireLikeFromJobDetailCacheBody(cached.body) : null;
}

const NOTES_PREVIEW_LEN = 240;

function readNavigatorOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function formatQueueAgeShort(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function sectionHeadingId(title: string): string {
  return `job-sec-${title
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const hid = sectionHeadingId(title);
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-4 shadow-sm", className)} aria-labelledby={hid}>
      <h2 id={hid} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, "");
}

function wireToBookingRow(j: CleanerJobDetailWire): CleanerBookingRow {
  return {
    id: String(j.id ?? ""),
    service: j.service ?? null,
    service_slug: j.service_slug ?? null,
    rooms: j.rooms ?? null,
    bathrooms: j.bathrooms ?? null,
    date: j.date ?? null,
    time: j.time ?? null,
    location: j.location ?? null,
    status: j.status ?? null,
    total_paid_zar: j.total_paid_zar ?? null,
    total_price: j.total_price ?? null,
    price_breakdown: j.price_breakdown ?? null,
    pricing_version_id: j.pricing_version_id ?? null,
    amount_paid_cents: j.amount_paid_cents ?? null,
    customer_name: j.customer_name ?? null,
    customer_phone: j.customer_phone ?? null,
    extras: j.extras ?? null,
    lineItems: j.lineItems ?? null,
    assigned_at: j.assigned_at ?? null,
    en_route_at: j.en_route_at ?? null,
    started_at: j.started_at ?? null,
    completed_at: j.completed_at ?? null,
    created_at: j.created_at ?? null,
    booking_snapshot: j.booking_snapshot ?? null,
    is_team_job: j.is_team_job ?? false,
    teamMemberCount: j.teamMemberCount ?? null,
    cleaner_response_status: j.cleaner_response_status ?? null,
    displayEarningsCents: j.displayEarningsCents ?? null,
    earnings_cents: j.earnings_cents ?? null,
    displayEarningsIsEstimate: j.displayEarningsIsEstimate,
    earnings_estimated: j.earnings_estimated,
    team_roster_summary: j.team_roster_summary ?? null,
  };
}

function lifecyclePhaseBeforeLabel(
  job: CleanerJobDetailWire | null,
  patch: Partial<CleanerJobDetailWire> | null,
): string {
  if (!job?.id) return "unknown";
  const merged = { ...job, ...patch } as CleanerJobDetailWire;
  try {
    return String(deriveMobilePhase(wireToBookingRow(merged)));
  } catch {
    return String(job.status ?? "unknown");
  }
}

function optimisticPatchForAction(action: "accept" | "en_route" | "start" | "complete"): Partial<CleanerJobDetailWire> {
  const now = new Date().toISOString();
  switch (action) {
    case "accept":
      return { cleaner_response_status: CLEANER_RESPONSE.ACCEPTED };
    case "en_route":
      return { en_route_at: now, cleaner_response_status: CLEANER_RESPONSE.ON_MY_WAY };
    case "start":
      return {
        status: "in_progress",
        started_at: now,
        cleaner_response_status: CLEANER_RESPONSE.STARTED,
      };
    case "complete":
      return { status: "completed", completed_at: now };
    default:
      return {};
  }
}

const NOTE_ALERT_RE = /\b(dog|dogs|alarm|key|keys|gate|codes?|code|pet|pets|lock)\b/i;

function formatQueuedLifecycleAction(a: PendingLifecycleAction): string {
  switch (a) {
    case "accept":
      return "Accept job";
    case "reject":
      return "Decline job";
    case "en_route":
      return "On the way";
    case "start":
      return "Start job";
    case "complete":
      return "Complete job";
    default:
      return a;
  }
}

function beforeYouStartLines(phase: ReturnType<typeof deriveMobilePhase>): string[] {
  switch (phase) {
    case "in_progress":
      return [
        "Follow the booked scope and extras — customer pricing is for reference only.",
        "Report damage, access issues, or scope mismatches as soon as you can.",
        "Finish strong: quick handover note in app if your flow supports it.",
      ];
    case "completed":
      return ["Ensure the home is left as agreed and doors/windows secured.", "Earnings may take a moment to appear after completion."];
    default:
      return [
        "Confirm access with the customer if anything is unclear.",
        "Check that booked extras (oven, fridge, etc.) match what you bring.",
        "Photos of issues help support — use Report issue from the jobs list if needed.",
      ];
  }
}

export default function CleanerJobDetailPage() {
  const params = useParams();
  const raw = params?.id;
  const id = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? String(raw[0] ?? "").trim() : "";
  const [job, setJob] = useState<CleanerJobDetailWire | null>(null);
  const [optimisticPatch, setOptimisticPatch] = useState<Partial<CleanerJobDetailWire> | null>(null);
  const [serverClockOffsetMs, setServerClockOffsetMs] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [staleBanner, setStaleBanner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [copyDone, setCopyDone] = useState(false);
  const [browserOnline, setBrowserOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [tick, setTick] = useState(0);
  const [confirmPending, setConfirmPending] = useState<null | "complete" | "reject">(null);
  const [completionSuccess, setCompletionSuccess] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [sessionJobAgeMs, setSessionJobAgeMs] = useState<number | null>(null);
  const [lifecycleWorking, setLifecycleWorking] = useState(false);
  const [needsJobRefresh, setNeedsJobRefresh] = useState(false);
  const [queueTtlBanner, setQueueTtlBanner] = useState<{ count: number; hadComplete: boolean } | null>(null);
  const [retryBusyKey, setRetryBusyKey] = useState<string | null>(null);
  const [ttlCompleteLock, setTtlCompleteLock] = useState(false);
  const jobControlRef = useRef<HTMLElement | null>(null);
  const queueDetailsWrapRef = useRef<HTMLDetailsElement | null>(null);
  const prevPendingFailedCountRef = useRef(0);
  const lifecycleGuardRef = useRef(false);
  const firstFailedQueueLiRef = useRef<HTMLLIElement | null>(null);
  const [queueAriaMessage, setQueueAriaMessage] = useState("");
  const latestJobRef = useRef<CleanerJobDetailWire | null>(null);
  const optimisticPatchRef = useRef<Partial<CleanerJobDetailWire> | null>(null);
  const flushWireResolverRef = useRef<(bookingId: string) => LifecycleWireLike | null>(() => null);
  const flushPhaseLabelRef = useRef<(bookingId: string) => string>(() => "other_booking");
  /** Populated after `useCleanerLifecycleOrchestrator` so `loadJob` can clear backoff without a circular hook dep. */
  const lifecycleOrchestratorRef = useRef<UseCleanerLifecycleOrchestratorReturn | null>(null);

  const displayJob = useMemo(() => {
    if (!job) return null;
    return { ...job, ...optimisticPatch };
  }, [job, optimisticPatch]);

  useEffect(() => {
    latestJobRef.current = job;
  }, [job]);
  useEffect(() => {
    optimisticPatchRef.current = optimisticPatch;
  }, [optimisticPatch]);

  useLayoutEffect(() => {
    flushWireResolverRef.current = (bookingId: string) =>
      resolveWireForLifecycleFlush(bookingId, id, latestJobRef.current);
    flushPhaseLabelRef.current = (bookingId: string) =>
      bookingId.trim() === id.trim()
        ? lifecyclePhaseBeforeLabel(latestJobRef.current, optimisticPatchRef.current)
        : "other_booking";
  }, [id]);

  const loadJob = useCallback(async (): Promise<boolean> => {
    if (!id) return false;
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setErr("Not signed in.");
      setJob(null);
      setLoading(false);
      return false;
    }
    const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, { headers });
    const j = (await res.json().catch(() => ({}))) as { job?: CleanerJobDetailWire; error?: string };
    if (res.status === 404) {
      const cached = readCleanerJobDetailCache(id);
      if (cached) {
        setJob(cached.body as CleanerJobDetailWire);
        setSessionJobAgeMs(cached.ageMs);
        setStaleBanner("This job is no longer on your roster — showing your last saved copy.");
        setErr(null);
      } else {
        setErr("This job is no longer assigned to you, or it was removed.");
        setJob(null);
        setStaleBanner(null);
        setSessionJobAgeMs(null);
      }
      setLoading(false);
      return false;
    }
    if (!res.ok) {
      if (res.status === 503) {
        lifecycleOrchestratorRef.current?.armFlushBackoffAfterJobFetchDegraded();
      }
      const cached = readCleanerJobDetailCache(id);
      if (cached) {
        setJob(cached.body as CleanerJobDetailWire);
        setSessionJobAgeMs(cached.ageMs);
        setStaleBanner(j.error ?? "Could not refresh — showing saved job details.");
        setErr(null);
      } else {
        setErr(j.error ?? "Could not load job.");
        setJob(null);
        setStaleBanner(null);
        setSessionJobAgeMs(null);
      }
      setLoading(false);
      return false;
    }
    setErr(null);
    setStaleBanner(null);
    setSessionJobAgeMs(null);
    const next = j.job ?? null;
    const picked = pickIncomingJobAvoidPhaseRegression(latestJobRef.current, next, optimisticPatchRef.current);
    setJob(picked);
    if (picked === next && next && typeof next.server_now_ms === "number" && Number.isFinite(next.server_now_ms)) {
      setServerClockOffsetMs(next.server_now_ms - Date.now());
    }
    if (picked === next && next) writeCleanerJobDetailCache(id, next as Record<string, unknown>);
    setLoading(false);
    lifecycleOrchestratorRef.current?.markNetworkStable();
    setTtlCompleteLock(false);
    clearTtlCompleteSyncLockFromSession();
    signalLifecycleFlushBackoffClear("job-detail-get");
    return true;
  }, [id]);

  const lifecycleOrch = useCleanerLifecycleOrchestrator({
    activeBookingId: id,
    flushWireResolverRef,
    flushPhaseLabelRef,
    loadJob,
    needsJobRefresh,
    clearNeedsJobRefresh: () => setNeedsJobRefresh(false),
  });

  useLayoutEffect(() => {
    lifecycleOrchestratorRef.current = lifecycleOrch;
  }, [lifecycleOrch]);

  useEffect(() => {
    setQueueTtlBanner(null);
    setTtlCompleteLock(false);
    const { count, hadComplete } = consumeQueueTtlPruneNotice();
    if (count > 0) {
      setQueueTtlBanner({ count, hadComplete });
      if (hadComplete) setTtlCompleteLock(true);
    }
    if (readTtlCompleteSyncLockFromSession()) setTtlCompleteLock(true);
  }, [id]);

  useEffect(() => {
    let debounce: number | null = null;
    const sync = () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        setTtlCompleteLock(readTtlCompleteSyncLockFromSession());
      }, 150);
    };
    window.addEventListener("cleaner-ttl-complete-lock", sync);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    const unsubBc = subscribeTtlCompleteLockBroadcast(() => sync());
    return () => {
      if (debounce != null) window.clearTimeout(debounce);
      window.removeEventListener("cleaner-ttl-complete-lock", sync);
      window.removeEventListener("storage", onStorage);
      unsubBc();
    };
  }, []);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) resetLifecycleBroadcastClientId();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  useEffect(() => {
    const { count, hadComplete } = consumeQueueTtlPruneNotice();
    if (count > 0) {
      setQueueTtlBanner((prev) => ({
        count: (prev?.count ?? 0) + count,
        hadComplete: Boolean(prev?.hadComplete) || hadComplete,
      }));
      if (hadComplete) setTtlCompleteLock(true);
    }
  }, [lifecycleOrch.queueUiNonce]);

  useEffect(() => {
    const up = () => setBrowserOnline(true);
    const down = () => setBrowserOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    const idTimer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(idTimer);
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setErr("Missing job.");
      return;
    }
    setStaleBanner(null);
    setActionErr(null);
    setOptimisticPatch(null);
    setConfirmPending(null);
    setCompletionSuccess(false);
    setNotesExpanded(false);
    setSessionJobAgeMs(null);
    setJob(null);
    const cached = readCleanerJobDetailCache(id);
    if (cached) {
      setJob(cached.body as CleanerJobDetailWire);
      setSessionJobAgeMs(cached.ageMs);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let cancelled = false;
    void (async () => {
      await loadJob();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadJob]);

  // queueUiNonce intentionally forces re-read of localStorage-backed queue (not a data dep of the memo body).
  const pendingForJob = useMemo(
    () => listPendingLifecycleForBooking(id).sort((a, b) => a.queuedAt - b.queuedAt),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce is a manual invalidation tick
    [id, lifecycleOrch.queueUiNonce],
  );
  const pendingSyncCount = pendingForJob.filter((x) => !x.failed).length;
  const pendingFailed = pendingForJob.filter((x) => x.failed);
  const firstFailedKey = pendingFailed[0]?.idempotencyKey;

  useEffect(() => {
    if (!firstFailedKey) return;
    window.requestAnimationFrame(() => {
      firstFailedQueueLiRef.current?.focus();
    });
  }, [firstFailedKey, pendingFailed.length]);

  const oldestPendingAgeMs = useMemo(() => {
    const pend = pendingForJob.filter((x) => !x.failed);
    if (pend.length === 0) return null;
    const oldestAt = Math.min(...pend.map((p) => p.queuedAt));
    // eslint-disable-next-line react-hooks/purity -- wall clock for “queued Xm ago”
    return Date.now() - oldestAt;
  }, [pendingForJob, lifecycleOrch.queueUiNonce, tick]);

  const pendingLastAttemptAgeLabelByKey = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- wall clock for queue row ages
    const now = Date.now();
    const m = new Map<string, string>();
    for (const row of pendingForJob) {
      if (row.lastAttemptAt == null) continue;
      m.set(row.idempotencyKey, formatQueueAgeShort(now - row.lastAttemptAt));
    }
    return m;
  }, [pendingForJob, lifecycleOrch.queueUiNonce, tick]);

  const [queueDetailsOpen, setQueueDetailsOpen] = useState(false);
  useEffect(() => {
    if (pendingForJob.length === 0) {
      setQueueDetailsOpen(false);
      return;
    }
    if (pendingFailed.length > 0) {
      setQueueDetailsOpen(true);
      return;
    }
    if (oldestPendingAgeMs != null && oldestPendingAgeMs > 12 * 60 * 1000) {
      setQueueDetailsOpen(true);
    }
  }, [pendingForJob.length, pendingFailed.length, oldestPendingAgeMs, tick]);

  useEffect(() => {
    const n = pendingFailed.length;
    const prev = prevPendingFailedCountRef.current;
    prevPendingFailedCountRef.current = n;
    if (n === 0) {
      setQueueAriaMessage("");
      return;
    }
    if (prev === 0 && n > 0) {
      setQueueAriaMessage(
        `${n} lifecycle action${n === 1 ? "" : "s"} could not sync. Open the queue below to retry.`,
      );
      window.requestAnimationFrame(() => {
        setQueueDetailsOpen(true);
        queueDetailsWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }, [pendingFailed.length]);

  useEffect(() => {
    if (!completionSuccess) return;
    const t = window.setTimeout(() => setCompletionSuccess(false), 5000);
    return () => window.clearTimeout(t);
  }, [completionSuccess]);

  useEffect(() => {
    if (!job || !optimisticPatch) return;
    const js = String(job.status ?? "").toLowerCase();
    const os = optimisticPatch.status != null ? String(optimisticPatch.status).toLowerCase() : null;
    if (js === "completed" && os != null && os !== "completed") {
      setOptimisticPatch(null);
      setCompletionSuccess(true);
    }
  }, [job?.status, optimisticPatch?.status]);

  const scopeSource = useMemo(() => {
    if (!displayJob) return null;
    return {
      rooms: displayJob.rooms,
      bathrooms: displayJob.bathrooms,
      extras: displayJob.extras,
      booking_snapshot: displayJob.booking_snapshot,
      lineItems: displayJob.lineItems ?? null,
      scope_lines: displayJob.scope_lines,
    };
  }, [displayJob]);

  const unified = useMemo(
    () => (scopeSource ? buildUnifiedJobScope(scopeSource) : { propertyLine: null as string | null, extras: [] as string[] }),
    [scopeSource],
  );

  const bookingRow = useMemo(() => (displayJob ? wireToBookingRow(displayJob) : null), [displayJob]);
  const lifecycleSlot = useMemo(() => (bookingRow?.id ? deriveCleanerJobLifecycleSlot(bookingRow) : null), [bookingRow]);
  const phaseBadge = useMemo(() => (bookingRow?.id ? mobilePhaseDisplayForDashboard(bookingRow) : "—"), [bookingRow]);
  const mobilePhase = useMemo(() => (bookingRow?.id ? deriveMobilePhase(bookingRow) : null), [bookingRow]);

  useEffect(() => {
    setConfirmPending(null);
  }, [lifecycleSlot?.kind]);

  const checkoutLines = useMemo(() => {
    if (!displayJob) return null;
    return checkoutPriceLinesFromPersisted({
      price_breakdown: displayJob.price_breakdown ?? null,
      total_price: displayJob.total_price ?? null,
      total_paid_zar: displayJob.total_paid_zar ?? null,
      amount_paid_cents: displayJob.amount_paid_cents ?? null,
      pricing_version_id: displayJob.pricing_version_id ?? null,
    });
  }, [displayJob]);

  const mapsHref = useMemo(() => {
    const loc = displayJob?.location ? String(displayJob.location).trim() : "";
    if (!loc) return null;
    const q = loc.split(/\r?\n/)[0]?.trim() ?? loc;
    return q ? directionsHrefFromQuery(q) : null;
  }, [displayJob?.location]);

  const googleMapsWebHref = useMemo(() => {
    const loc = displayJob?.location ? String(displayJob.location).trim() : "";
    if (!loc) return null;
    const q = loc.split(/\r?\n/)[0]?.trim() ?? loc;
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
  }, [displayJob?.location]);

  const title = useMemo(() => {
    if (!displayJob) return "Job";
    const a = String(displayJob.service_name ?? "").trim();
    const b = String(displayJob.service ?? "").trim();
    return a || b || "Job";
  }, [displayJob]);

  const earningsCents = displayJob?.displayEarningsCents ?? displayJob?.earnings_cents ?? null;
  const earningsEstimated = displayJob?.displayEarningsIsEstimate === true || displayJob?.earnings_estimated === true;

  const includesLines = useMemo(
    () => buildEarningsIncludesLines(title, displayJob?.lineItems ?? null, unified.extras),
    [title, displayJob?.lineItems, unified.extras],
  );

  const scheduleModel = useMemo(
    () =>
      displayJob
        ? buildScheduleHintModel({
            date: displayJob.date,
            time: displayJob.time,
            duration_hours: displayJob.duration_hours,
          })
        : null,
    [displayJob],
  );

  const nowAnchored = useMemo(() => Date.now() + serverClockOffsetMs, [serverClockOffsetMs, tick]);

  const lateness = useMemo(() => {
    if (!displayJob?.status) return { kind: "none" } as const;
    return latenessVsSchedule({
      status: displayJob.status,
      startMs: scheduleModel?.startMs ?? null,
      nowMs: nowAnchored,
    });
  }, [displayJob?.status, scheduleModel?.startMs, nowAnchored]);

  const notesAlert = useMemo(() => {
    const n = displayJob?.job_notes?.trim();
    if (!n) return false;
    return NOTE_ALERT_RE.test(n);
  }, [displayJob?.job_notes]);

  const scrollJobControlIntoView = useCallback(() => {
    window.requestAnimationFrame(() => {
      jobControlRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, []);

  const runLifecyclePost = useCallback(
    async (action: "accept" | "reject" | "en_route" | "start" | "complete", opts?: { optimistic?: boolean }) => {
      if (!id) return;
      if (lifecycleGuardRef.current) return;
      lifecycleGuardRef.current = true;
      setLifecycleWorking(true);

      /** Unique per attempt; server ties to booking+action — UUID avoids cross-action collisions across tabs. */
      const idempotencyKey = crypto.randomUUID();
      const optimistic = opts?.optimistic === true;
      const online = !isOfflineSignal(null, { navigatorOnline: readNavigatorOnline() });

      const applyOptimistic = () => {
        if (optimistic) {
          setOptimisticPatch(optimisticPatchForAction(action as "accept" | "en_route" | "start" | "complete"));
        }
      };

      try {
        setActionErr(null);

        const headersEarly = await getCleanerAuthHeaders();
        if (!headersEarly) {
          setActionErr("Not signed in.");
          setConfirmPending(null);
          return;
        }

        const phaseBefore = lifecyclePhaseBeforeLabel(latestJobRef.current, optimisticPatchRef.current);

        if (!online) {
          const enq = await enqueuePendingLifecycle({
            bookingId: id,
            action: action as PendingLifecycleAction,
            idempotencyKey,
            queuedAt: Date.now(),
          });
          if (!enq.ok) {
            setActionErr(enq.reason);
            setConfirmPending(null);
            return;
          }
          lifecycleOrchestratorRef.current?.invalidatePeekCache(id);
          void logCleanerLifecycleClientEvent({
            bookingId: id,
            action,
            status: "queued",
            finalStatus: "queued",
            networkOnline: readNavigatorOnline(),
            phaseBefore,
          });
          applyOptimistic();
          lifecycleOrchestratorRef.current?.refreshQueueFromDisk();
          setConfirmPending(null);
          return;
        }

        setActionBusy(action);
        applyOptimistic();

        const result = await postCleanerLifecycleWithRetry({
          bookingId: id,
          action,
          idempotencyKey,
          getHeaders: getCleanerAuthHeaders,
          onPostSuccess: () => lifecycleOrchestratorRef.current?.clearFlushBackoff(),
        });

        if (!result.ok) {
          if (result.status === 0 || result.status >= 500) {
            const enq = await enqueuePendingLifecycle({
              bookingId: id,
              action: action as PendingLifecycleAction,
              idempotencyKey,
              queuedAt: Date.now(),
            });
            if (!enq.ok) {
              setOptimisticPatch(null);
              setActionErr(enq.reason);
              setConfirmPending(null);
              return;
            }
            lifecycleOrchestratorRef.current?.invalidatePeekCache(id);
            void logCleanerLifecycleClientEvent({
              bookingId: id,
              action,
              status: "queued",
              finalStatus: "queued",
              networkOnline: readNavigatorOnline(),
              phaseBefore,
            });
            lifecycleOrchestratorRef.current?.armFlushBackoffAfterPostEnqueue();
            lifecycleOrchestratorRef.current?.refreshQueueFromDisk();
            setActionErr(null);
            setConfirmPending(null);
            return;
          }
          setOptimisticPatch(null);
          setActionErr(result.error ?? "Action failed.");
          setConfirmPending(null);
          return;
        }

        lifecycleOrchestratorRef.current?.clearFlushFailureStreakAndConnectionFlag();
        if (action === "complete") {
          setCompletionSuccess(true);
        }
        try {
          await loadJob();
        } catch {
          setOptimisticPatch(null);
          setNeedsJobRefresh(true);
          setActionErr(null);
          await removePendingLifecycleByKey(idempotencyKey);
          lifecycleOrchestratorRef.current?.invalidatePeekCache(id);
          lifecycleOrchestratorRef.current?.refreshQueueFromDisk();
          setConfirmPending(null);
          return;
        }
        setOptimisticPatch(null);
        setConfirmPending(null);
        await removePendingLifecycleByKey(idempotencyKey);
        lifecycleOrchestratorRef.current?.invalidatePeekCache(id);
        lifecycleOrchestratorRef.current?.refreshQueueFromDisk();
        setSessionJobAgeMs(null);
        setNeedsJobRefresh(false);
        void lifecycleOrchestratorRef.current?.flushPendingLifecycleQueue();
        scrollJobControlIntoView();
      } finally {
        setActionBusy(null);
        lifecycleGuardRef.current = false;
        setLifecycleWorking(false);
      }
    },
    [id, loadJob, scrollJobControlIntoView],
  );

  const copyAddress = useCallback(async () => {
    const t = displayJob?.location ? String(displayJob.location).trim() : "";
    if (!t || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(t);
      setCopyDone(true);
      window.setTimeout(() => setCopyDone(false), 2000);
    } catch {
      /* ignore */
    }
  }, [displayJob?.location]);

  const hasScopeContent =
    Boolean(unified.propertyLine) || unified.extras.length > 0 || (displayJob?.lineItems?.length ?? 0) > 0;
  const st = String(displayJob?.status ?? "").toLowerCase();
  const completed = st === "completed";
  const cancelled = st === "cancelled";
  const failed = st === "failed";
  const lifecycleDisabled =
    Boolean(staleBanner) || lifecycleWorking || ttlCompleteLock || retryBusyKey != null;
  const sessionDetailStale =
    typeof sessionJobAgeMs === "number" && sessionJobAgeMs >= 60 * 60 * 1000;

  const notesFull = displayJob?.job_notes?.trim() ?? "";
  const notesNeedsExpand = notesFull.length > NOTES_PREVIEW_LEN;
  const notesShown = notesExpanded || !notesNeedsExpand ? notesFull : `${notesFull.slice(0, NOTES_PREVIEW_LEN).trim()}…`;

  const checklist = mobilePhase ? beforeYouStartLines(mobilePhase) : beforeYouStartLines("pending");

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg space-y-4 bg-background p-4 pb-28">
      <div
        className="sr-only"
        aria-live={pendingFailed.length > 0 ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {queueAriaMessage}
      </div>
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 rounded-xl px-3 text-muted-foreground">
        <Link href="/cleaner/dashboard">← Dashboard</Link>
      </Button>
      {loading && !displayJob ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : err && !displayJob ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : displayJob ? (
        <div className="space-y-4">
          {pendingSyncCount > 0 || pendingFailed.length > 0 ? (
            <button
              type="button"
              className={cn(
                "flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-left text-xs font-medium text-sky-950 dark:text-sky-50",
                oldestPendingAgeMs != null && oldestPendingAgeMs > 10 * 60 * 1000 ? "animate-pulse" : null,
              )}
              role="status"
              onClick={() => setQueueDetailsOpen(true)}
            >
              <span className="tabular-nums">
                {pendingSyncCount > 0 ? (
                  <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {oldestPendingAgeMs != null && oldestPendingAgeMs > 10 * 60 * 1000 ? (
                      <Radio className="size-3.5 shrink-0 opacity-90" aria-hidden />
                    ) : null}
                    <span>
                      {`${pendingSyncCount} action${pendingSyncCount === 1 ? "" : "s"} pending`}
                      {oldestPendingAgeMs != null ? ` · queued ${formatQueueAgeShort(oldestPendingAgeMs)}` : null}
                    </span>
                  </span>
                ) : null}
                {pendingSyncCount > 0 && pendingFailed.length > 0 ? " · " : null}
                {pendingFailed.length > 0 ? (
                  <span className="text-destructive">{`${pendingFailed.length} could not sync`}</span>
                ) : null}
              </span>
            </button>
          ) : null}
          {staleBanner ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">{staleBanner}</div>
          ) : null}
          {!browserOnline ? (
            <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-950 dark:text-rose-50">
              You&apos;re offline — reconnect to sync with the server. Navigation and saved details still work.
            </div>
          ) : null}
          {lifecycleOrch.connectionUnstable ? (
            <div className="rounded-xl border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">
              Connection unstable — actions will sync later.
            </div>
          ) : null}
          {lifecycleOrch.offlineQueuedForJob ? (
            <div className="rounded-xl border border-sky-500/35 bg-sky-500/10 px-3 py-2 text-sm text-sky-950 dark:text-sky-50">
              Saved — will sync when you&apos;re back online.
            </div>
          ) : null}
          {sessionDetailStale ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">
              This job info may be outdated — reconnect to refresh from the server.
            </div>
          ) : null}
          {needsJobRefresh ? (
            <div className="rounded-xl border border-emerald-600/35 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-950 dark:text-emerald-50">
              Action saved. Updating details… Switch back to this tab and we&apos;ll refresh automatically.
            </div>
          ) : null}
          {queueTtlBanner != null && queueTtlBanner.count > 0 ? (
            <div className="relative rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 pr-10 text-sm text-amber-950 dark:text-amber-50">
              <p>Some unsynced actions expired and were removed.</p>
              {queueTtlBanner.hadComplete ? (
                <p className="mt-2 font-medium text-amber-950 dark:text-amber-100">
                  Job completion was not synced. Please confirm status.
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 size-8 shrink-0 p-0 text-amber-950 hover:bg-amber-500/20 dark:text-amber-50"
                aria-label="Dismiss notice"
                onClick={() => {
                  const had = queueTtlBanner?.hadComplete;
                  setQueueTtlBanner(null);
                  if (!had) setTtlCompleteLock(false);
                }}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          ) : null}
          {ttlCompleteLock ? (
            <div
              className="rounded-xl border-2 border-rose-600/50 bg-rose-500/15 px-3 py-4 text-sm text-rose-950 shadow-sm dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-50"
              role="alert"
            >
              <p className="text-base font-semibold">Completion wasn&apos;t synced</p>
              <p className="mt-1 text-sm opacity-95">Refresh from the server to confirm this job&apos;s status before continuing.</p>
              <Button
                type="button"
                variant="default"
                size="lg"
                className="mt-4 h-12 w-full text-base font-semibold shadow-sm sm:w-auto"
                onClick={() => void loadJob()}
              >
                Refresh details
              </Button>
            </div>
          ) : null}
          {pendingForJob.length > 0 ? (
            <details
              ref={queueDetailsWrapRef}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm"
              open={queueDetailsOpen}
              onToggle={(e) => setQueueDetailsOpen((e.target as HTMLDetailsElement).open)}
            >
              <summary className="cursor-pointer font-medium text-foreground">
                {[
                  pendingSyncCount > 0 ? `${pendingSyncCount} action${pendingSyncCount === 1 ? "" : "s"} queued` : null,
                  pendingSyncCount > 0 && oldestPendingAgeMs != null ? `queued ${formatQueueAgeShort(oldestPendingAgeMs)}` : null,
                  pendingFailed.length > 0 ? `${pendingFailed.length} could not sync` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </summary>
              <ul className="mt-2 space-y-3 text-muted-foreground">
                {pendingForJob.map((row) => (
                  <li
                    key={row.idempotencyKey}
                    ref={row.failed && row.idempotencyKey === firstFailedKey ? firstFailedQueueLiRef : undefined}
                    tabIndex={row.failed ? 0 : undefined}
                    className={cn(
                      "border-b border-border pb-2 last:border-0 last:pb-0",
                      row.failed
                        ? "rounded-md outline outline-2 outline-offset-2 outline-primary focus-visible:ring-2 focus-visible:ring-ring"
                        : null,
                    )}
                  >
                    <p className="font-medium text-foreground">{formatQueuedLifecycleAction(row.action)}</p>
                    <p className="text-xs">
                      Queued{" "}
                      {new Date(row.queuedAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                    </p>
                    {row.lastAttemptAt != null ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Last attempt: {pendingLastAttemptAgeLabelByKey.get(row.idempotencyKey) ?? "—"}
                      </p>
                    ) : null}
                    {row.failed ? (
                      <div className="mt-2 flex flex-col gap-2">
                        <p className="text-xs font-medium text-destructive">
                          Couldn&apos;t sync after multiple attempts. Check your connection or contact support.
                        </p>
                        <p className="text-xs text-muted-foreground">
                          <Link href="/cleaner/dashboard" className="font-semibold text-primary underline-offset-4 hover:underline">
                            Open jobs list
                          </Link>{" "}
                          if you need to report an issue.
                        </p>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="h-10 w-fit gap-2"
                          disabled={retryBusyKey === row.idempotencyKey}
                          onClick={async () => {
                            setRetryBusyKey(row.idempotencyKey);
                            try {
                              await retryFailedQueueItem(row.idempotencyKey);
                              lifecycleOrchestratorRef.current?.refreshQueueFromDisk();
                              await lifecycleOrchestratorRef.current?.flushPendingLifecycleQueue();
                              scrollJobControlIntoView();
                            } finally {
                              setRetryBusyKey(null);
                            }
                          }}
                        >
                          {retryBusyKey === row.idempotencyKey ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : null}
                          {retryBusyKey === row.idempotencyKey ? "Retrying…" : "Retry sync"}
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {cancelled ? (
            <div className="rounded-xl border border-muted-foreground/30 bg-muted/30 px-3 py-3 text-sm text-foreground">
              <p className="font-semibold">This job was cancelled</p>
              <p className="mt-1 text-muted-foreground">No action required.</p>
            </div>
          ) : null}
          {failed ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-50">
              <p className="font-semibold">This booking has a payment or system issue</p>
              <p className="mt-1 text-xs">Contact support if you need help.</p>
            </div>
          ) : null}

          <header className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h1 className="text-xl font-semibold leading-snug text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {[displayJob.date, displayJob.time].filter((x) => String(x ?? "").trim()).join(" · ") || "Schedule TBD"}
            </p>
            <p className="mt-2 inline-block rounded-full bg-muted px-3 py-1 text-xs font-semibold text-foreground">{phaseBadge}</p>
          </header>

          {lifecycleSlot || completed ? (
            <section
              ref={jobControlRef}
              className="rounded-2xl border-2 border-primary/25 bg-primary/5 p-4 shadow-sm"
              aria-label="Job actions"
            >
              <h2 className="text-xs font-semibold uppercase tracking-wide text-primary">Job control</h2>
              {staleBanner ? (
                <p className="mt-2 text-xs text-muted-foreground">Refresh details from the server when you can to continue updating this job.</p>
              ) : null}
              {actionErr ? <p className="mt-2 text-sm text-destructive">{actionErr}</p> : null}
              <div className="mt-3 flex flex-col gap-2">
                {lifecycleSlot?.kind === "accept_reject" ? (
                  <>
                    <Button
                      type="button"
                      className="min-h-12 w-full"
                      disabled={actionBusy != null || lifecycleDisabled || cancelled || failed}
                      onClick={() => void runLifecyclePost("accept", { optimistic: true })}
                    >
                      {actionBusy === "accept" ? <Loader2 className="size-4 animate-spin" aria-label="Loading" /> : null}
                      Accept job
                    </Button>
                    {lifecycleSlot.canReject ? (
                      confirmPending === "reject" ? (
                        <div className="rounded-lg border border-destructive/30 bg-background p-3">
                          <p className="text-sm font-medium text-foreground">Decline this job?</p>
                          <p className="mt-1 text-xs text-muted-foreground">It will go back for reassignment.</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              variant="destructive"
                              className="min-h-12 flex-1"
                              disabled={actionBusy != null || lifecycleDisabled}
                              onClick={() => void runLifecyclePost("reject")}
                            >
                              {actionBusy === "reject" ? <Loader2 className="size-4 animate-spin" /> : null}
                              Yes, decline
                            </Button>
                            <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setConfirmPending(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-12 w-full border-destructive/40 text-destructive hover:bg-destructive/5"
                          disabled={actionBusy != null || lifecycleDisabled}
                          onClick={() => setConfirmPending("reject")}
                        >
                          Decline job
                        </Button>
                      )
                    ) : null}
                  </>
                ) : null}
                {lifecycleSlot?.kind === "en_route" ? (
                  <Button
                    type="button"
                    className="min-h-12 w-full bg-primary text-primary-foreground"
                    disabled={actionBusy != null || lifecycleDisabled}
                    onClick={() => void runLifecyclePost("en_route", { optimistic: true })}
                  >
                    {actionBusy === "en_route" ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                    On the way
                  </Button>
                ) : null}
                {lifecycleSlot?.kind === "start" ? (
                  <Button
                    type="button"
                    className="min-h-12 w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
                    disabled={actionBusy != null || lifecycleDisabled}
                    onClick={() => void runLifecyclePost("start", { optimistic: true })}
                  >
                    {actionBusy === "start" ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                    I&apos;ve arrived — start job
                  </Button>
                ) : null}
                {lifecycleSlot?.kind === "complete" ? (
                  confirmPending === "complete" ? (
                    <div className="rounded-lg border border-emerald-600/35 bg-background p-3">
                      <p className="text-sm font-medium text-foreground">Complete this job?</p>
                      <p className="mt-1 text-xs text-muted-foreground">This records completion and runs payout checks.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="min-h-12 flex-1 bg-emerald-700 text-white hover:bg-emerald-700/90"
                          disabled={actionBusy != null || lifecycleDisabled}
                          onClick={() => void runLifecyclePost("complete", { optimistic: true })}
                        >
                          {actionBusy === "complete" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                          Yes, complete
                        </Button>
                        <Button type="button" variant="outline" className="min-h-12 flex-1" onClick={() => setConfirmPending(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      className="min-h-12 w-full bg-emerald-700 text-white hover:bg-emerald-700/90"
                      disabled={actionBusy != null || lifecycleDisabled}
                      onClick={() => setConfirmPending("complete")}
                    >
                      Complete job
                    </Button>
                  )
                ) : null}
                {completed ? (
                  <p className="text-sm text-muted-foreground">
                    This job is completed.{" "}
                    <Link href="/cleaner/earnings" className="font-semibold text-primary underline-offset-4 hover:underline">
                      View earnings summary
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="Navigation and contact">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Getting there</h2>
            {mapsHref ? (
              <Button type="button" asChild className="mt-3 min-h-12 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90">
                <a href={mapsHref} target="_blank" rel="noopener noreferrer">
                  <Navigation className="size-4 shrink-0" aria-hidden />
                  Start navigation
                </a>
              </Button>
            ) : null}
            <div className={cn("flex flex-wrap gap-2", mapsHref ? "mt-2" : "mt-3")}>
              {googleMapsWebHref ? (
                <Button type="button" variant="outline" size="sm" className="min-h-11 flex-1 gap-2 sm:max-w-[50%]" asChild>
                  <a href={googleMapsWebHref} target="_blank" rel="noopener noreferrer">
                    <MapPin className="size-4 shrink-0" aria-hidden />
                    Google Maps
                  </a>
                </Button>
              ) : null}
              {displayJob.location?.trim() ? (
                <Button type="button" variant="outline" size="sm" className="min-h-11 flex-1 gap-2 sm:max-w-[50%]" onClick={() => void copyAddress()}>
                  <Copy className="size-4 shrink-0" aria-hidden />
                  {copyDone ? "Copied" : "Copy address"}
                </Button>
              ) : null}
            </div>
          </section>

          {hasScopeContent ? (
            <Section title="Scope of work">
              {unified.propertyLine ? <p className="text-base font-medium text-foreground">{unified.propertyLine}</p> : null}
              {unified.extras.length > 0 ? (
                <div className={cn(unified.propertyLine ? "mt-3" : "")}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extras</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-foreground">
                    {unified.extras.map((name) => (
                      <li key={name}>
                        {name} <span className="text-muted-foreground">(+extra time)</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {displayJob.lineItems && displayJob.lineItems.length > 0 ? (
                <div className={cn(unified.propertyLine || unified.extras.length ? "mt-4 border-t border-border pt-3" : "")}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booked line items</p>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-foreground">
                    {displayJob.lineItems.map((it, idx) => (
                      <li key={`${it.slug ?? it.name}-${idx}`} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          {it.name}
                          {String(it.item_type ?? "").toLowerCase() === "extra" ? (
                            <span className="text-muted-foreground"> (+extra time)</span>
                          ) : null}
                          {it.quantity > 1 ? <span className="text-muted-foreground"> ×{it.quantity}</span> : null}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium uppercase text-muted-foreground">{it.item_type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Section>
          ) : null}

          {scheduleModel && (scheduleModel.startLabel || scheduleModel.durText || scheduleModel.endRange) ? (
            <Section title="Schedule">
              {scheduleModel.startLabel ? (
                <p className="text-sm text-foreground">
                  <span className="text-muted-foreground">Start time: </span>
                  {scheduleModel.startLabel}
                </p>
              ) : null}
              {scheduleModel.durText ? (
                <p className={cn("text-sm text-foreground", scheduleModel.startLabel ? "mt-1" : "")}>
                  <span className="text-muted-foreground">Estimated duration: </span>
                  {scheduleModel.durText}
                </p>
              ) : null}
              {scheduleModel.endRange ? (
                <p className="mt-1 text-sm text-foreground">
                  <span className="text-muted-foreground">Expected finish: </span>
                  {scheduleModel.endRange}
                </p>
              ) : null}
              {lateness.kind === "late" ? (
                <p
                  className={cn(
                    "mt-2 text-sm font-semibold",
                    lateness.severe ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-200",
                  )}
                >
                  Running late by {lateness.minutes} min
                </p>
              ) : null}
              {lateness.kind === "early" ? (
                <p className="mt-2 text-sm font-medium text-sky-800 dark:text-sky-200">Arriving ~{lateness.minutes} min early</p>
              ) : null}
              {displayJob.is_team_job && displayJob.teamMemberCount != null && displayJob.teamMemberCount > 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Team roster: {displayJob.teamMemberCount} cleaner{displayJob.teamMemberCount === 1 ? "" : "s"}
                  {displayJob.team_roster_summary ? ` — ${displayJob.team_roster_summary}` : ""}
                </p>
              ) : null}
            </Section>
          ) : null}

          <Section title="Before you start" className="border-dashed">
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {checklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Section>

          <div className="space-y-3">
            <section
              className="rounded-2xl border-2 border-emerald-500/35 bg-emerald-500/5 p-4 shadow-sm"
              aria-labelledby="job-earnings-cleaner"
            >
              <h2 id="job-earnings-cleaner" className="text-xs font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-100">
                Your earnings (this job)
              </h2>
              {completionSuccess ? (
                <div className="relative mt-3 flex gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 py-2 pl-3 pr-10 text-sm text-emerald-950 dark:text-emerald-50">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Job completed</p>
                    <p className="mt-0.5 text-xs opacity-90">Your earnings will update shortly after the server finishes processing.</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1 size-8 shrink-0 p-0 text-emerald-950 hover:bg-emerald-600/15 dark:text-emerald-50"
                    aria-label="Dismiss"
                    onClick={() => setCompletionSuccess(false)}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </div>
              ) : null}
              {earningsCents != null && earningsCents > 0 ? (
                <>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-800 dark:text-emerald-200">{formatZarFromCents(earningsCents)}</p>
                  {earningsEstimated ? (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Estimate — final amount follows roster and payout rules.</p>
                  ) : (
                    <p className="mt-1 text-xs text-emerald-900/80 dark:text-emerald-100/80">Total for your work on this booking.</p>
                  )}
                  <div className="mt-4 border-t border-emerald-500/20 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900/90 dark:text-emerald-100/90">What this pay covers</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-foreground">
                      {includesLines.map((line) => (
                        <li key={line} className="flex gap-2">
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  {completionSuccess
                    ? "Processing your earnings… refresh in a moment if the amount still shows as empty."
                    : "Your pay for this job will show here once earnings are calculated and attached to the booking."}
                </p>
              )}
            </section>

            {checkoutLines && checkoutLines.length > 0 ? (
              <section
                className="rounded-2xl border border-muted-foreground/25 bg-muted/10 p-4 shadow-sm"
                aria-labelledby="job-customer-price"
              >
                <h2 id="job-customer-price" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Customer checkout (reference only)
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">Not your payout split — for context on what the customer paid.</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {checkoutLines.map((line) => (
                    <li key={line.kind + line.label} className="flex justify-between gap-2">
                      <span className="text-foreground">{line.label}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {line.amountZar < 0 ? "−" : ""}R{Math.abs(line.amountZar).toLocaleString("en-ZA")}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {notesFull ? (
            <Section title="Notes">
              {notesAlert ? (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">Heads up</p>
                    <p className="mt-0.5 text-xs opacity-90">Contains access, pets, alarm, or gate notes — read carefully.</p>
                  </div>
                </div>
              ) : null}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{notesShown}</p>
              {notesNeedsExpand ? (
                <Button type="button" variant="ghost" size="sm" className="mt-2 h-10 px-2 text-primary" onClick={() => setNotesExpanded((e) => !e)}>
                  {notesExpanded ? "Show less" : "Show more"}
                </Button>
              ) : null}
            </Section>
          ) : null}

          <Section title="Location">
            {displayJob.location ? (
              <p className="whitespace-pre-wrap text-sm text-foreground">{String(displayJob.location).trim()}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Address on file will appear here.</p>
            )}
          </Section>

          <Section title="Customer">
            <p className="font-medium text-foreground">{displayJob.customer_name?.trim() || "—"}</p>
            {displayJob.customer_phone?.trim() ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="button" className="min-h-12 w-full gap-2" asChild>
                  <a href={`tel:${digitsOnly(displayJob.customer_phone)}`}>
                    <Phone className="size-4 shrink-0" aria-hidden />
                    Call
                  </a>
                </Button>
                {digitsOnly(displayJob.customer_phone).length >= 9 ? (
                  <Button type="button" variant="secondary" className="min-h-12 w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-600/90" asChild>
                    <a href={`https://wa.me/${digitsOnly(displayJob.customer_phone)}`} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="size-4 shrink-0" aria-hidden />
                      WhatsApp
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">No phone on file.</p>
            )}
          </Section>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to show.</p>
      )}
    </div>
  );
}
