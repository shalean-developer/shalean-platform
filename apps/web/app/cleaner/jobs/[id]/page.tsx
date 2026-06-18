"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Calendar, CheckCircle2, Loader2, MapPin, MessageCircle, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY,
  clearTtlCompleteSyncLockFromSession,
  consumeQueueTtlPruneNotice,
  enqueuePendingLifecycle,
  readTtlCompleteSyncLockFromSession,
  removePendingLifecycleByKey,
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
import {
  describeBookingOperationalState,
  isLifecycleActionAllowedByCapabilities,
  type OperationalDisplayTone,
} from "@/lib/booking/describeBookingOperationalState";
import type { CleanerBookingLineItemWire, CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import {
  clearCleanerJobDetailCache,
  readCleanerJobDetailCache,
  writeCleanerJobDetailCache,
} from "@/lib/cleaner/cleanerJobDetailSessionCache";
import type { LifecycleWireLike } from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import { wireLikeFromJobDetailCacheBody } from "@/lib/cleaner/cleanerQueuedLifecycleFlushGuard";
import { buildScheduleHintModel, latenessVsSchedule } from "@/lib/cleaner/cleanerJobDetailScheduleModel";
import { buildUnifiedJobScope } from "@/lib/cleaner/cleanerJobDetailUnifiedScope";
import { deriveMobilePhase, isCleanerAssignmentAccepted } from "@/lib/cleaner/cleanerMobileBookingMap";
import { stripExtraTimeSuffixFromDisplayLabel } from "@/lib/cleaner/cleanerExtraDisplayLabel";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import {
  cleanerJobEarningFromCents,
  isCleanerJobEarningPositive,
  JOB_EARNING_BLOCK_COMPLETION_MESSAGE,
  JOB_EARNING_LABEL,
  JOB_EARNING_UNAVAILABLE_CONTACT_LABEL,
} from "@/lib/cleaner/cleanerJobEarning";
import { optimisticPatchForLifecycleAction } from "@/lib/cleaner/cleanerLifecycleOptimisticPatch";
import { mapsNavigationUrlFromJobLocation } from "@/lib/cleaner/mapsNavigationUrl";
import {
  clearAllCleanerDashboardSessionCaches,
  signalCleanerDashboardJobsRefresh,
} from "@/lib/cleaner/cleanerDashboardSessionCache";
import { cleanerLifecycleFailureMessage } from "@/lib/cleaner/cleanerLifecycleClientErrors";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { BookingServiceQaPanel } from "@/components/cleaner/BookingServiceQaPanel";
import type { ServiceQaCleanerWire } from "@/lib/booking/bookingServiceQa";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";
import { cn } from "@/lib/utils";
import { useCleanerRealtime } from "@/lib/realtime/useCleanerRealtime";

type CleanerJobDetailWire = {
  id?: string;
  server_now_ms?: number;
  service?: string | null;
  service_name?: string | null;
  service_slug?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
  location_display?: string | null;
  status?: string | null;
  /** From `bookings.dispatch_status` — used with status for lifecycle chips. */
  dispatch_status?: string | null;
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
  scope_lines?: string[] | null;
  service_detail_lines?: Array<{ label: string; value: string }>;
  access_detail_lines?: Array<{ label: string; value: string }>;
  selected_extras?: unknown;
  pricing_summary?: unknown;
  service_details?: unknown;
  duration_hours?: number | null;
  job_notes?: string | null;
  displayEarningsCents?: number | null;
  earnings_cents?: number | null;
  displayEarningsIsEstimate?: boolean;
  earnings_estimated?: boolean;
  earnings_is_estimate?: boolean;
  is_team_job?: boolean | null;
  teamMemberCount?: number | null;
  team_roster_summary?: string | null;
  assigned_at?: string | null;
  /** From `bookings.accepted_at` — dual-signal with `cleaner_response_status` for accepted UI (see `isCleanerAssignmentAccepted`). */
  accepted_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  cleaner_response_status?: string | null;
  /** Deep / move cleaning execution QA (optional checklist + photos). */
  service_qa?: ServiceQaCleanerWire | null;
  /** DB `cleaner_earnings_total_cents` when present on wire (snake_case from API). */
  cleaner_earnings_total_cents?: number | null;
  is_recurring_generated?: boolean | null;
  billing_type?: string | null;
  monthly_invoice_id?: string | null;
  cleaner_pending_payment_banner?: string | null;
  cleaner_visibility_mode?: "recurring_pending_payment" | null;
  payment_completed_at?: string | null;
  admin_recurring_unpaid_completion_override_at?: string | null;
  admin_recurring_unpaid_completion_override_by?: string | null;
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
    dispatch_status: j.dispatch_status ?? null,
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
    accepted_at: j.accepted_at ?? null,
    en_route_at: j.en_route_at ?? null,
    started_at: j.started_at ?? null,
    completed_at: j.completed_at ?? null,
    created_at: j.created_at ?? null,
    booking_snapshot: j.booking_snapshot ?? null,
    is_team_job: j.is_team_job ?? false,
    teamMemberCount: j.teamMemberCount ?? null,
    cleaner_response_status: j.cleaner_response_status ?? null,
    displayEarningsCents: j.displayEarningsCents ?? null,
    cleaner_earnings_total_cents:
      typeof (j as { cleaner_earnings_total_cents?: unknown }).cleaner_earnings_total_cents === "number"
        ? ((j as { cleaner_earnings_total_cents?: number }).cleaner_earnings_total_cents as number)
        : null,
    earnings_cents: j.earnings_cents ?? null,
    displayEarningsIsEstimate: j.displayEarningsIsEstimate,
    earnings_estimated: j.earnings_estimated,
    earnings_is_estimate: j.earnings_is_estimate,
    team_roster_summary: j.team_roster_summary ?? null,
    is_recurring_generated: j.is_recurring_generated ?? null,
    billing_type: j.billing_type ?? null,
    monthly_invoice_id: j.monthly_invoice_id ?? null,
    cleaner_pending_payment_banner: j.cleaner_pending_payment_banner ?? null,
    cleaner_visibility_mode: j.cleaner_visibility_mode ?? null,
    payment_completed_at: j.payment_completed_at ?? null,
    payout_status: (j as { payout_status?: string | null }).payout_status ?? null,
    payout_paid_at: (j as { payout_paid_at?: string | null }).payout_paid_at ?? null,
    admin_recurring_unpaid_completion_override_at: j.admin_recurring_unpaid_completion_override_at ?? null,
    admin_recurring_unpaid_completion_override_by: j.admin_recurring_unpaid_completion_override_by ?? null,
  };
}

function lifecyclePhaseBeforeLabel(
  job: CleanerJobDetailWire | null,
  patch: Partial<CleanerJobDetailWire> | null,
): string {
  if (!job?.id) return "unknown";
  const merged = { ...job, ...patch } as CleanerJobDetailWire;
  try {
    return String(deriveMobilePhase(wireToBookingRow(merged), { nowMs: Date.now() }));
  } catch {
    return String(job.status ?? "unknown");
  }
}

function acceptPersistSessionPatch(base: CleanerJobDetailWire | null): Record<string, unknown> {
  const cur = String(base?.status ?? "").toLowerCase();
  const dst = String(base?.dispatch_status ?? "").trim().toLowerCase();
  const patch: Record<string, unknown> = { cleaner_response_status: CLEANER_RESPONSE.ACCEPTED };
  if (cur === "pending_payment") {
    patch.accepted_at = new Date().toISOString();
    return patch;
  }
  if (cur === "offered" || cur === "confirmed") patch.status = "assigned";
  if (dst === "offered") patch.dispatch_status = "assigned";
  return patch;
}

const NOTE_ALERT_RE = /\b(dog|dogs|alarm|key|keys|gate|codes?|code|pet|pets|lock)\b/i;

function beforeYouStartLines(phase: ReturnType<typeof deriveMobilePhase>): string[] {
  switch (phase) {
    case "in_progress":
      return [
        "Follow the booked scope and extras — focus on the work you were assigned.",
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
  const [tick, setTick] = useState(0);
  const [confirmPending, setConfirmPending] = useState<null | "complete" | "reject">(null);
  const [completionSuccess, setCompletionSuccess] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [lifecycleWorking, setLifecycleWorking] = useState(false);
  const [needsJobRefresh, setNeedsJobRefresh] = useState(false);
  const [queueTtlBanner, setQueueTtlBanner] = useState<{ count: number; hadComplete: boolean } | null>(null);
  const [ttlCompleteLock, setTtlCompleteLock] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const jobControlRef = useRef<HTMLElement | null>(null);
  const postActionReconcileTimerRef = useRef<number | null>(null);
  const lifecycleGuardRef = useRef(false);
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

  /** Same as `displayJob` — updated during render so `loadJob` / flush always see merged state without extra effect deps. */
  latestJobRef.current = displayJob;

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
    const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, {
      headers,
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { job?: CleanerJobDetailWire; error?: string };
    if (res.status === 404) {
      const cached = readCleanerJobDetailCache(id);
      if (cached) {
        setJob(cached.body as CleanerJobDetailWire);
        setStaleBanner("This job is no longer on your roster — showing your last saved copy.");
        setErr(null);
      } else {
        setErr("This job is no longer assigned to you, or it was removed.");
        setJob(null);
        setStaleBanner(null);
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
        setStaleBanner(j.error ?? "Could not refresh — showing saved job details.");
        setErr(null);
      } else {
        setErr(j.error ?? "Could not load job.");
        setJob(null);
        setStaleBanner(null);
      }
      setLoading(false);
      return false;
    }
    setErr(null);
    setStaleBanner(null);
    const next = j.job ?? null;
    const picked = pickIncomingJobAvoidPhaseRegression(latestJobRef.current, next, optimisticPatchRef.current);
    setJob(picked);
    if (next && typeof next.server_now_ms === "number" && Number.isFinite(next.server_now_ms)) {
      setServerClockOffsetMs(next.server_now_ms - Date.now());
    }
    if (picked) writeCleanerJobDetailCache(id, picked as Record<string, unknown>);
    setLoading(false);
    lifecycleOrchestratorRef.current?.markNetworkStable();
    setTtlCompleteLock(false);
    clearTtlCompleteSyncLockFromSession();
    signalLifecycleFlushBackoffClear("job-detail-get");
    return true;
  }, [id]);

  const loadJobRef = useRef(loadJob);
  useLayoutEffect(() => {
    loadJobRef.current = loadJob;
  }, [loadJob]);

  /** `public.cleaners.id` + team ids for Realtime (matches jobs list). */
  const [rtCleanerId, setRtCleanerId] = useState<string | null>(null);
  const [rtTeamIds, setRtTeamIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setRtCleanerId(null);
    setRtTeamIds([]);
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers || cancelled) return;
      const res = await cleanerAuthenticatedFetch("/api/cleaner/me", { headers });
      const m = (await res.json().catch(() => ({}))) as { cleaner?: { id?: string }; teamIds?: unknown };
      if (!res.ok || cancelled) return;
      if (m.cleaner && typeof m.cleaner.id === "string") {
        const cid = m.cleaner.id.trim();
        if (cid) setRtCleanerId(cid);
      }
      const tis = Array.isArray(m.teamIds)
        ? m.teamIds.filter((x): x is string => typeof x === "string" && Boolean(String(x).trim())).map((x) => String(x).trim())
        : [];
      setRtTeamIds(tis);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useCleanerRealtime({
    cleanerId: rtCleanerId ?? undefined,
    debounceMs: 300,
    subscribeBookings: true,
    subscribeWorkSettings: false,
    workspaceBookingsRealtime: true,
    workspaceTeamIds: rtTeamIds,
    onBookingChange: () => {
      void loadJobRef.current();
    },
  });

  /** Merge lifecycle fields into session cache before `loadJob` (survives fast navigation). */
  const persistLifecycleSessionPatch = useCallback((patch: Record<string, unknown>) => {
    const bid = id.trim();
    if (!bid) return;
    const cached = readCleanerJobDetailCache(bid);
    const raw = latestJobRef.current ?? (cached?.body as CleanerJobDetailWire | null | undefined);
    if (!raw?.id || String(raw.id).trim() !== bid) return;
    writeCleanerJobDetailCache(bid, {
      ...(raw as unknown as Record<string, unknown>),
      ...patch,
    });
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
    const idTimer = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(idTimer);
  }, []);

  useEffect(() => {
    if (postActionReconcileTimerRef.current != null) {
      window.clearTimeout(postActionReconcileTimerRef.current);
      postActionReconcileTimerRef.current = null;
    }
  }, [id]);

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
    setJob(null);
    const cached = readCleanerJobDetailCache(id);
    if (cached) {
      setJob(cached.body as CleanerJobDetailWire);
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
      if (postActionReconcileTimerRef.current != null) {
        window.clearTimeout(postActionReconcileTimerRef.current);
        postActionReconcileTimerRef.current = null;
      }
    };
  }, [id, loadJob]);

  useEffect(() => {
    if (!completionSuccess) return;
    const t = window.setTimeout(() => setCompletionSuccess(false), 5000);
    return () => window.clearTimeout(t);
  }, [completionSuccess]);

  useEffect(() => {
    if (!optimisticPatch) return;
    const os = optimisticPatch.status != null ? String(optimisticPatch.status).toLowerCase() : null;
    const optimisticCompletedAt = optimisticPatch.completed_at != null && String(optimisticPatch.completed_at).trim() !== "";
    const optimisticClaimsDone = os === "completed" || optimisticCompletedAt;
    if (!optimisticClaimsDone) return;

    if (!job) {
      return;
    }
    const js = String(job.status ?? "").toLowerCase();
    const serverCompletedAt = job.completed_at != null && String(job.completed_at).trim() !== "";
    const serverAuthoritativeDone = js === "completed" || serverCompletedAt;
    /** Drop stale “completed” overlay when the server row never finished (failed sync / retry). */
    if (!serverAuthoritativeDone) {
      setOptimisticPatch(null);
      return;
    }
    if (js === "completed" && os != null && os !== "completed") {
      setOptimisticPatch(null);
      setCompletionSuccess(true);
    }
  }, [job?.status, job?.completed_at, optimisticPatch?.status, optimisticPatch?.completed_at]);

  const scopeSource = useMemo(() => {
    if (!displayJob) return null;
    return {
      rooms: displayJob.rooms,
      bathrooms: displayJob.bathrooms,
      extras: displayJob.extras,
      selected_extras: displayJob.selected_extras,
      pricing_summary: displayJob.pricing_summary,
      service_details: displayJob.service_details,
      booking_snapshot: displayJob.booking_snapshot,
      lineItems: displayJob.lineItems ?? null,
      scope_lines: displayJob.scope_lines ?? undefined,
    };
  }, [displayJob]);

  const locationLabel = useMemo(() => {
    const display = displayJob?.location_display?.trim();
    if (display) return display;
    return displayJob?.location?.trim() ?? "";
  }, [displayJob?.location_display, displayJob?.location]);

  const unified = useMemo(
    () => (scopeSource ? buildUnifiedJobScope(scopeSource) : { propertyLine: null as string | null, extras: [] as string[] }),
    [scopeSource],
  );

  const bookingRow = useMemo(() => (displayJob ? wireToBookingRow(displayJob) : null), [displayJob]);
  const operational = useMemo(() => {
    if (!bookingRow?.id) return null;
    return describeBookingOperationalState({
      row: bookingRow as unknown as Record<string, unknown>,
      viewer: "cleaner",
      nowMs: Date.now() + serverClockOffsetMs,
      telemetryBookingId: bookingRow.id,
    });
  }, [bookingRow, serverClockOffsetMs, tick]);
  const jobUi = operational?.cleanerJobUi ?? ({ phase: "none" } as const);
  const mobilePhase = operational?.cleanerMobilePhase ?? null;
  const phaseBadge = operational?.displayBadge ?? "—";
  const recurringLifecycleRestrictionLine = operational?.progressionBlockedReason ?? null;

  useEffect(() => {
    setConfirmPending(null);
  }, [jobUi.phase]);

  useEffect(() => {
    setContactSheetOpen(false);
  }, [id]);

  useEffect(() => {
    if (!contactSheetOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContactSheetOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [contactSheetOpen]);

  const addressMapsHref = useMemo(() => {
    const loc = locationLabel;
    if (!loc) return null;
    const q = loc.split(/\r?\n/)[0]?.trim() ?? loc;
    return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
  }, [locationLabel]);

  const title = useMemo(() => {
    if (!displayJob) return "Job";
    return (
      serviceLabelFromBookingRow({
        service: displayJob.service ?? null,
        service_slug: displayJob.service_slug ?? null,
      }) ||
      String(displayJob.service_name ?? "").trim() ||
      String(displayJob.service ?? "").trim() ||
      "Job"
    );
  }, [displayJob]);

  const earningsCents = displayJob?.displayEarningsCents ?? displayJob?.earnings_cents ?? null;
  const earningsEstimated =
    displayJob?.displayEarningsIsEstimate === true ||
    displayJob?.earnings_estimated === true ||
    displayJob?.earnings_is_estimate === true;
  /**
   * Canonical job-earning shape from the same wire fields used by offer cards
   * and the dashboard surfaces (`resolveCleanerJobEarning` precedence). R0 is
   * deliberately treated as "unavailable" by `isCleanerJobEarningPositive` —
   * the server-side completion gate does the same with
   * `isCompletableDisplayEarningsCents`, so the disabled-Complete UX matches
   * exactly what the API would return on attempt.
   */
  const jobEarning = useMemo(() => cleanerJobEarningFromCents(earningsCents), [earningsCents]);
  const jobEarningPositive = isCleanerJobEarningPositive(jobEarning);

  const showLifecycleDebugStrip = process.env.NEXT_PUBLIC_CLEANER_JOB_LIFECYCLE_DEBUG === "1";

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

  const scheduleHeadline = useMemo(() => {
    const parts = [displayJob?.date, displayJob?.time].map((x) => String(x ?? "").trim()).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }, [displayJob?.date, displayJob?.time]);

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
          setOptimisticPatch(
            optimisticPatchForLifecycleAction(action as "accept" | "en_route" | "start" | "complete", latestJobRef.current),
          );
        }
      };

      try {
        setActionErr(null);

        const orch = lifecycleOrchestratorRef.current;
        if (!orch) {
          setActionErr("Not ready. Try again.");
          setConfirmPending(null);
          return;
        }

        await orch.enqueueViaPost(async () => {
          const headersEarly = await getCleanerAuthHeaders();
          if (!headersEarly) {
            setActionErr("Not signed in.");
            setConfirmPending(null);
            return { applyPostEnqueueTail: false };
          }

          const phaseBefore = lifecyclePhaseBeforeLabel(latestJobRef.current, optimisticPatchRef.current);

          const mergedJob = { ...(latestJobRef.current ?? {}), ...(optimisticPatchRef.current ?? {}) } as CleanerJobDetailWire;
          const mergedRow = wireToBookingRow(mergedJob) as unknown as Record<string, unknown>;
          const opGate = describeBookingOperationalState({
            row: mergedRow,
            viewer: "cleaner",
            nowMs: Date.now() + serverClockOffsetMs,
            telemetryBookingId: id,
          });
          if (!isLifecycleActionAllowedByCapabilities(action, opGate.lifecycleCapabilities)) {
            setActionErr(opGate.progressionBlockedReason ?? "This action is not available for this booking yet.");
            setConfirmPending(null);
            return { applyPostEnqueueTail: false };
          }

          if (!online) {
            const enq = await enqueuePendingLifecycle(
              {
                bookingId: id,
                action: action as PendingLifecycleAction,
                idempotencyKey,
                queuedAt: Date.now(),
              },
              { capabilityRow: mergedRow },
            );
            if (!enq.ok) {
              setActionErr(enq.reason);
              setConfirmPending(null);
              return { applyPostEnqueueTail: false };
            }
            void logCleanerLifecycleClientEvent({
              bookingId: id,
              action,
              status: "queued",
              finalStatus: "queued",
              networkOnline: readNavigatorOnline(),
              phaseBefore,
            });
            applyOptimistic();
            const nowQueued = new Date().toISOString();
            if (action === "accept") {
              persistLifecycleSessionPatch(acceptPersistSessionPatch(latestJobRef.current));
            } else if (action === "en_route") {
              persistLifecycleSessionPatch({
                cleaner_response_status: CLEANER_RESPONSE.ON_MY_WAY,
                en_route_at: nowQueued,
              });
            } else if (action === "start") {
              persistLifecycleSessionPatch({
                status: "in_progress",
                started_at: nowQueued,
                cleaner_response_status: CLEANER_RESPONSE.STARTED,
              });
            }
            setConfirmPending(null);
            return {};
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
            const friendly = cleanerLifecycleFailureMessage({
              action,
              code: result.code,
              baseMessage: result.error ?? "Action failed.",
              httpStatus: result.status,
            });

            /** Server rejected completion (e.g. payout) — never hide behind offline queue + empty error. */
            if (action === "complete" && result.status >= 500) {
              setOptimisticPatch(null);
              setActionErr(friendly);
              setConfirmPending(null);
              return { applyPostEnqueueTail: false };
            }

            if (result.status === 0 || result.status >= 500) {
              const enq = await enqueuePendingLifecycle(
                {
                  bookingId: id,
                  action: action as PendingLifecycleAction,
                  idempotencyKey,
                  queuedAt: Date.now(),
                },
                { capabilityRow: mergedRow },
              );
              if (!enq.ok) {
                setOptimisticPatch(null);
                setActionErr(action === "complete" ? friendly : enq.reason);
                setConfirmPending(null);
                return { applyPostEnqueueTail: false };
              }
              void logCleanerLifecycleClientEvent({
                bookingId: id,
                action,
                status: "queued",
                finalStatus: "queued",
                networkOnline: readNavigatorOnline(),
                phaseBefore,
              });
              setActionErr(
                action === "complete"
                  ? "You're offline — completion is saved and will send when you're back online."
                  : null,
              );
              setConfirmPending(null);
              return { armBackoffAfterPostEnqueue: true };
            }
            setOptimisticPatch(null);
            setActionErr(friendly);
            setConfirmPending(null);
            return { applyPostEnqueueTail: false };
          }

          lifecycleOrchestratorRef.current?.clearFlushFailureStreakAndConnectionFlag();
          if (result.ok) {
            clearAllCleanerDashboardSessionCaches();
            clearCleanerJobDetailCache(id);
            const nowIso = new Date().toISOString();
            if (action === "accept") {
              persistLifecycleSessionPatch(acceptPersistSessionPatch(latestJobRef.current));
            } else if (action === "en_route") {
              persistLifecycleSessionPatch({
                cleaner_response_status: CLEANER_RESPONSE.ON_MY_WAY,
                en_route_at: nowIso,
              });
            } else if (action === "start") {
              persistLifecycleSessionPatch({
                status: "in_progress",
                started_at: nowIso,
                cleaner_response_status: CLEANER_RESPONSE.STARTED,
              });
            } else if (action === "complete") {
              persistLifecycleSessionPatch({
                status: "completed",
                completed_at: nowIso,
              });
            }
          }
          if (result.ok && action === "complete") {
            setCompletionSuccess(true);
          }
          try {
            await loadJob();
          } catch {
            setOptimisticPatch(null);
            setNeedsJobRefresh(true);
            setActionErr(null);
            await removePendingLifecycleByKey(idempotencyKey);
            setConfirmPending(null);
            return { scheduleFlush: false };
          }
          setOptimisticPatch(null);
          setConfirmPending(null);
          await removePendingLifecycleByKey(idempotencyKey);
          setNeedsJobRefresh(false);
          signalCleanerDashboardJobsRefresh();
          scrollJobControlIntoView();
          if (postActionReconcileTimerRef.current != null) {
            window.clearTimeout(postActionReconcileTimerRef.current);
            postActionReconcileTimerRef.current = null;
          }
          postActionReconcileTimerRef.current = window.setTimeout(() => {
            postActionReconcileTimerRef.current = null;
            void loadJob();
          }, 1500);
          return {};
        });
      } finally {
        setActionBusy(null);
        lifecycleGuardRef.current = false;
        setLifecycleWorking(false);
      }
    },
    [id, loadJob, persistLifecycleSessionPatch, scrollJobControlIntoView, serverClockOffsetMs],
  );

  const openNavigationForCurrentJob = useCallback(() => {
    const url = mapsNavigationUrlFromJobLocation(locationLabel || displayJob?.location);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, [displayJob?.location, locationLabel]);

  /** Maps opens in the same user activation (avoids popup blockers); lifecycle POST runs immediately after. */
  const handleOnMyWay = useCallback(() => {
    openNavigationForCurrentJob();
    void runLifecyclePost("en_route", { optimistic: true });
  }, [openNavigationForCurrentJob, runLifecyclePost]);

  const st = String(displayJob?.status ?? "").toLowerCase();
  const completed = st === "completed";
  const cancelled = st === "cancelled";
  const failed = st === "failed";
  const lifecycleDisabled = Boolean(staleBanner) || lifecycleWorking || ttlCompleteLock;

  const notesFull = displayJob?.job_notes?.trim() ?? "";
  const notesNeedsExpand = notesFull.length > NOTES_PREVIEW_LEN;
  const notesShown = notesExpanded || !notesNeedsExpand ? notesFull : `${notesFull.slice(0, NOTES_PREVIEW_LEN).trim()}…`;

  const checklist = mobilePhase ? beforeYouStartLines(mobilePhase) : beforeYouStartLines("pending");

  const jobDetailsHeadingId = sectionHeadingId("Job details");

  const JOB_TONE_BADGE: Record<OperationalDisplayTone, string> = {
    danger: "border-destructive/30 bg-destructive/10 text-destructive",
    success: "border-border bg-muted text-muted-foreground",
    warning: "border-amber-600/45 bg-amber-500/12 text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/25 dark:text-amber-50",
    neutral: "border-border bg-muted text-foreground",
    muted: "border-border bg-muted/80 text-muted-foreground",
  };

  const jobStatusBadgeClass = useMemo(() => {
    if (cancelled) return "border-destructive/30 bg-destructive/10 text-destructive";
    if (failed) return "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-50";
    if (operational) return JOB_TONE_BADGE[operational.displayTone];
    if (completed) return "border-border bg-muted text-muted-foreground";
    const ph = mobilePhase ?? "pending";
    switch (ph) {
      case "assigned":
        return "border-emerald-600/35 bg-emerald-600/12 text-emerald-900 dark:text-emerald-100";
      case "en_route":
        return "border-sky-600/35 bg-sky-600/12 text-sky-900 dark:text-sky-100";
      case "in_progress":
        return "border-primary/35 bg-primary/10 text-primary";
      case "pending":
      default:
        return "border-border bg-muted text-foreground";
    }
  }, [mobilePhase, cancelled, failed, completed, operational]);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 bg-background p-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 h-11 rounded-xl px-3 text-muted-foreground">
        <Link href="/jobs">← Dashboard</Link>
      </Button>
      {loading && !displayJob ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : err && !displayJob ? (
        <p className="text-sm text-destructive">{err}</p>
      ) : displayJob ? (
        <div className="space-y-4">
          {staleBanner ? (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50">{staleBanner}</div>
          ) : null}
          {lifecycleOrch.hasFailuresForJob ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/35 bg-destructive/10 px-3 py-3 text-sm text-destructive"
            >
              <p className="font-medium text-destructive">Couldn&apos;t save your last update to the server.</p>
              <p className="mt-1 text-xs text-muted-foreground">Check your connection, then try again.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 h-9 rounded-lg"
                disabled={lifecycleOrch.isFlushing}
                onClick={() => void lifecycleOrch.flushPendingLifecycleQueue()}
              >
                {lifecycleOrch.isFlushing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Retrying…
                  </>
                ) : (
                  "Try again"
                )}
              </Button>
            </div>
          ) : null}
          {queueTtlBanner != null && queueTtlBanner.count > 0 && queueTtlBanner.hadComplete ? (
            <div className="relative rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 pr-10 text-sm text-amber-950 dark:text-amber-50">
              <p className="font-medium text-amber-950 dark:text-amber-100">Job completion was not synced.</p>
              <p className="mt-1 text-xs opacity-90">Please confirm status with the server when you can.</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1 size-8 shrink-0 p-0 text-amber-950 hover:bg-amber-500/20 dark:text-amber-50"
                aria-label="Dismiss notice"
                onClick={() => {
                  setQueueTtlBanner(null);
                  setTtlCompleteLock(false);
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

          <section
            ref={jobControlRef}
            className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            aria-labelledby={jobDetailsHeadingId}
          >
            <p id={jobDetailsHeadingId} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Job details
            </p>
            <div className="mt-2 space-y-5">
              <h1 className="text-xl font-semibold leading-snug text-foreground">{title}</h1>
              {operational?.overrideApplied ? (
                <p
                  className="rounded-lg border border-violet-600/35 bg-violet-500/10 px-3 py-2 text-sm text-violet-950 dark:border-violet-500/30 dark:bg-violet-950/30 dark:text-violet-50"
                  role="status"
                >
                  <span className="font-semibold">Completed by admin override</span>
                  {operational.overrideRecordedBy ? (
                    <span className="mt-1 block text-xs opacity-90">Recorded for: {operational.overrideRecordedBy}</span>
                  ) : null}
                </p>
              ) : null}
              {recurringLifecycleRestrictionLine ? (
                <p
                  className="rounded-lg border border-sky-600/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-950 dark:border-sky-500/25 dark:bg-sky-950/25 dark:text-sky-50"
                  role="note"
                >
                  {recurringLifecycleRestrictionLine}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-sm">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <Calendar className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <p className="min-w-0 text-muted-foreground">{scheduleHeadline ?? scheduleModel?.startLabel ?? "Schedule TBD"}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
                    jobStatusBadgeClass,
                  )}
                >
                  {phaseBadge}
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{displayJob.customer_name?.trim() || "—"}</p>
                {locationLabel ? (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <div className="min-w-0 flex-1">
                      {addressMapsHref ? (
                        <a
                          href={addressMapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="Open address in Google Maps"
                          className="whitespace-pre-wrap text-foreground underline decoration-muted-foreground/60 underline-offset-2 hover:text-primary hover:decoration-primary"
                        >
                          {locationLabel}
                        </a>
                      ) : (
                        <p className="whitespace-pre-wrap text-foreground">{locationLabel}</p>
                      )}
                    </div>
                  </div>
              ) : (
                <p className="text-sm text-muted-foreground">Address on file will appear here.</p>
                )}
              </div>

              {showLifecycleDebugStrip ? (
                <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Lifecycle debug</span>
                  <br />
                  status: {displayJob.status ?? "—"}
                  <br />
                  dispatch: {displayJob.dispatch_status ?? "—"}
                  <br />
                  response: {displayJob.cleaner_response_status ?? "—"}
                  <br />
                  accepted_at: {displayJob.accepted_at ?? "—"}
                  <br />
                  en_route_at: {displayJob.en_route_at ?? "—"}
                  <br />
                  started_at: {displayJob.started_at ?? "—"}
                  <br />
                  completed_at: {displayJob.completed_at ?? "—"}
                  <br />
                  displayEarningsCents: {displayJob.displayEarningsCents ?? "—"}
                  <br />
                  earnings_cents: {displayJob.earnings_cents ?? "—"}
                  <br />
                  cleaner_earnings_total_cents: {displayJob.cleaner_earnings_total_cents ?? "—"}
                </div>
              ) : null}

              {scheduleModel?.durText || scheduleModel?.endRange ? (
                <div className="space-y-1 text-sm">
                  {scheduleModel.durText ? (
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Estimated duration: </span>
                      {scheduleModel.durText}
                    </p>
                  ) : null}
                  {scheduleModel.endRange ? (
                    <p className="text-foreground">
                      <span className="text-muted-foreground">Expected finish: </span>
                      {scheduleModel.endRange}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {lateness.kind === "late" ? (
                <p
                  className={cn(
                    "text-sm font-semibold",
                    lateness.severe ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-200",
                  )}
                >
                  Running late by {lateness.minutes} min
                </p>
              ) : null}
              {lateness.kind === "early" ? (
                <p className="text-sm font-medium text-sky-800 dark:text-sky-200">Arriving ~{lateness.minutes} min early</p>
              ) : null}
              {displayJob.is_team_job && displayJob.teamMemberCount != null && displayJob.teamMemberCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Team roster: {displayJob.teamMemberCount} cleaner{displayJob.teamMemberCount === 1 ? "" : "s"}
                  {displayJob.team_roster_summary ? ` — ${displayJob.team_roster_summary}` : ""}
                </p>
              ) : null}

              {completionSuccess ? (
                <div className="relative flex gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 py-2 pl-3 pr-10 text-sm text-emerald-950 dark:text-emerald-50">
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

              {unified.propertyLine ? <p className="text-base font-medium text-foreground">{unified.propertyLine}</p> : null}

              {jobEarningPositive ? (
                <div
                  className={cn(unified.propertyLine ? "mt-1" : "")}
                  data-testid="cleaner-job-detail-earning-positive"
                >
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {JOB_EARNING_LABEL}: {formatZarFromCents(jobEarning.amount_cents ?? 0)}
                    {earningsEstimated ? " (estimate)" : ""}
                  </p>
                  {earningsEstimated ? (
                    <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">
                      Pay is confirmed once the job is recorded.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  className={cn(
                    "rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-50",
                    unified.propertyLine || completionSuccess ? "mt-1" : "",
                  )}
                  role="status"
                  aria-label={JOB_EARNING_UNAVAILABLE_CONTACT_LABEL}
                  data-testid="cleaner-job-detail-earning-unavailable"
                >
                  <p className="font-semibold">{JOB_EARNING_UNAVAILABLE_CONTACT_LABEL}</p>
                  <p className="mt-1 text-xs opacity-90">
                    {completionSuccess
                      ? "Processing your earnings… refresh in a moment if the amount still shows as empty."
                      : "Your pay for this job hasn't been confirmed yet. Support can recompute it before you complete."}
                  </p>
                </div>
              )}

              {unified.extras.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Extras</p>
                  <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm text-foreground">
                    {unified.extras.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {displayJob.service_detail_lines && displayJob.service_detail_lines.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Property details</p>
                  <dl className="mt-2 space-y-2 text-sm">
                    {displayJob.service_detail_lines.map((line) => (
                      <div key={line.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                        <dt className="shrink-0 font-medium text-muted-foreground">{line.label}</dt>
                        <dd className="text-foreground">{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              {displayJob.access_detail_lines && displayJob.access_detail_lines.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Access</p>
                  <dl className="mt-2 space-y-2 text-sm">
                    {displayJob.access_detail_lines.map((line) => (
                      <div key={line.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                        <dt className="shrink-0 font-medium text-muted-foreground">{line.label}</dt>
                        <dd className="whitespace-pre-wrap text-foreground">{line.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              {displayJob.lineItems && displayJob.lineItems.length > 0 ? (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Booked line items</p>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-foreground">
                    {displayJob.lineItems.map((it, idx) => (
                      <li key={`${it.slug ?? it.name}-${idx}`} className="flex justify-between gap-2">
                        <span className="min-w-0">
                          {stripExtraTimeSuffixFromDisplayLabel(String(it.name ?? ""))}
                          {it.quantity > 1 ? <span className="text-muted-foreground"> ×{it.quantity}</span> : null}
                        </span>
                        <span className="shrink-0 text-[10px] font-medium uppercase text-muted-foreground">{it.item_type}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 space-y-3 border-t border-border pt-4" aria-label="Job actions">
                {actionErr ? (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    <p className="font-semibold text-destructive">Couldn&apos;t update this job</p>
                    <p className="mt-1 text-sm leading-snug">{actionErr}</p>
                  </div>
                ) : null}
                {jobUi.phase === "expired" ? (
                  <div className="rounded-lg border border-muted-foreground/30 bg-muted/30 px-3 py-3 text-sm text-foreground">
                    <p className="font-semibold">This job is no longer available</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The scheduled start has passed without acceptance. Refresh your jobs list — this booking may have
                      been removed.
                    </p>
                  </div>
                ) : (
                  <>
                    {jobUi.phase !== "none" || completed ? (
                  <div className="flex flex-col gap-2">
                    {jobUi.phase === "accept" ? (
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
                        {jobUi.canReject ? (
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
                    {jobUi.phase === "on_my_way" ? (
                      <Button
                        type="button"
                        className="min-h-12 w-full bg-emerald-600 text-white hover:bg-emerald-600/90"
                        disabled={actionBusy != null || lifecycleDisabled}
                        onClick={() => void handleOnMyWay()}
                      >
                        {actionBusy === "en_route" ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                        {actionBusy === "en_route" ? "Navigating…" : "On my way"}
                      </Button>
                    ) : null}
                    {jobUi.phase === "start" ? (
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
                    {jobUi.phase === "complete" ? (
                      <>
                        {!jobEarningPositive ? (
                          <p
                            role="status"
                            data-testid="cleaner-job-detail-complete-blocked-message"
                            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-950 dark:text-amber-50"
                          >
                            {JOB_EARNING_BLOCK_COMPLETION_MESSAGE}
                          </p>
                        ) : null}
                        {confirmPending === "complete" ? (
                          <div className="rounded-lg border border-emerald-600/35 bg-background p-3">
                            <p className="text-sm font-medium text-foreground">Complete this job?</p>
                            <p className="mt-1 text-xs text-muted-foreground">This records completion and runs payout checks.</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                className="min-h-12 flex-1 bg-emerald-700 text-white hover:bg-emerald-700/90"
                                disabled={actionBusy != null || lifecycleDisabled || !jobEarningPositive}
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
                            data-testid="cleaner-job-detail-complete-button"
                            className="min-h-12 w-full bg-emerald-700 text-white hover:bg-emerald-700/90"
                            disabled={actionBusy != null || lifecycleDisabled || !jobEarningPositive}
                            aria-disabled={!jobEarningPositive || actionBusy != null || lifecycleDisabled}
                            onClick={() => setConfirmPending("complete")}
                          >
                            Complete job
                          </Button>
                        )}
                      </>
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
                ) : null}

                {jobUi.phase !== "accept" ? (
                  displayJob.customer_phone?.trim() ? (
                    <>
                      <div className={cn(jobUi.phase !== "none" || completed ? "border-t border-border pt-3" : "")}>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-12 w-full"
                          onClick={() => setContactSheetOpen(true)}
                        >
                          Contact
                        </Button>
                      </div>
                      {contactSheetOpen ? (
                        <div
                          className="fixed inset-0 z-50 flex flex-col justify-end"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="contact-sheet-title"
                        >
                          <button
                            type="button"
                            className="absolute inset-0 bg-zinc-950/50"
                            aria-label="Close contact options"
                            onClick={() => setContactSheetOpen(false)}
                          />
                          <div className="relative mt-auto w-full max-w-lg self-center rounded-t-2xl border border-border bg-card p-4 shadow-lg">
                            <p id="contact-sheet-title" className="mb-3 text-center text-sm font-semibold text-foreground">
                              Contact customer
                            </p>
                            <div className="flex flex-col gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                              <Button type="button" variant="outline" className="min-h-12 w-full gap-2" asChild>
                                <a href={`tel:${digitsOnly(displayJob.customer_phone)}`} onClick={() => setContactSheetOpen(false)}>
                                  <Phone className="size-4 shrink-0" aria-hidden />
                                  Call
                                </a>
                              </Button>
                              {digitsOnly(displayJob.customer_phone).length >= 9 ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="min-h-12 w-full gap-2 border-emerald-600/40 text-emerald-800 hover:bg-emerald-600/10 dark:text-emerald-200"
                                  asChild
                                >
                                  <a
                                    href={`https://wa.me/${digitsOnly(displayJob.customer_phone)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setContactSheetOpen(false)}
                                  >
                                    <MessageCircle className="size-4 shrink-0" aria-hidden />
                                    WhatsApp
                                  </a>
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                className="min-h-11 w-full text-muted-foreground"
                                onClick={() => setContactSheetOpen(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p
                      className={cn(
                        "text-sm text-muted-foreground",
                        jobUi.phase !== "none" || completed ? "border-t border-border pt-3" : "",
                      )}
                    >
                      No phone on file.
                    </p>
                  )
                ) : null}
                  </>
                )}
              </div>
            </div>
          </section>

          {displayJob.service_qa ? (
            <Section title="Job checklist & photos">
              <BookingServiceQaPanel
                bookingId={id}
                bookingStatus={displayJob.status}
                serviceQa={displayJob.service_qa}
                onUpdated={() => void loadJob()}
              />
            </Section>
          ) : null}

          <Section title="Before you start" className="border-dashed">
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {checklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Section>

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

        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing to show.</p>
      )}
    </div>
  );
}
