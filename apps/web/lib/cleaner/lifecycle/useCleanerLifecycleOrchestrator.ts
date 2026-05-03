"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  CLEANER_PENDING_LIFECYCLE_LOCAL_KEY,
  getCasRetriesTotal,
  getLatestPendingLifecycleItemForBooking,
  listPendingLifecycle,
  readPendingLifecycleQueueStorageVersion,
  recordFlushFailure,
  removePendingLifecycleByKey,
  type PendingLifecycleAction,
} from "@/lib/cleaner/cleanerJobPendingLifecycleQueue";
import { planBcQueueRefresh } from "@/lib/cleaner/cleanerLifecycleBcMessageGuard";
import { peekCleanerJobWireForLifecycle } from "@/lib/cleaner/peekCleanerJobWireForLifecycle";
import { isOfflineSignal } from "@/lib/cleaner/cleanerLifecycleNetworkSignal";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";
import {
  LIFECYCLE_FLUSH_BACKOFF_CLEAR_APPLY_MAX_AGE_MS,
  readLifecycleFlushBackoffClearSignal,
} from "@/lib/cleaner/cleanerLifecycleFlushBackoffSignal";
import {
  getLifecycleBroadcastClientId,
  subscribeCleanerLifecycleQueueChanged,
} from "@/lib/cleaner/cleanerLifecycleQueueBroadcast";
import {
  logCleanerLifecycleClientEvent,
  type LifecycleFlushTrigger,
} from "@/lib/cleaner/cleanerLifecycleTelemetryClient";
import type { LifecycleWireLike } from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";
import { shouldDropStaleQueuedLifecycleAction } from "@/lib/cleaner/cleanerQueuedLifecycleFlushGuard";

function nextFlushBackoffUntilMs(baseMs: number): number {
  const jitter = Math.floor(Math.random() * 10_000);
  return Date.now() + baseMs + jitter;
}

function readNavigatorOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export type UseCleanerLifecycleOrchestratorOptions = {
  /** Route booking id (trimmed). Used for telemetry + “current page” job reload after flush. */
  activeBookingId: string;
  /** Must return fresh wire for `bookingId` (page uses cache + in-memory job). */
  flushWireResolverRef: MutableRefObject<(bookingId: string) => LifecycleWireLike | null>;
  /** Human-readable phase label for client logs when flushing the active booking. */
  flushPhaseLabelRef: MutableRefObject<(bookingId: string) => string>;
  loadJob: () => Promise<boolean>;
  needsJobRefresh: boolean;
  clearNeedsJobRefresh: () => void;
};

export type CleanerLifecycleOrchestratorState = {
  /** True while a flush pass is in flight (for debug / future UI). */
  isFlushing: boolean;
  /** Whether any queued item exists for `activeBookingId`. */
  offlineQueuedForJob: boolean;
  /** Whether any failed queue row exists for `activeBookingId`. */
  hasFailuresForJob: boolean;
  /** Bumped when localStorage queue may have changed — drive `listPendingLifecycle*` memos. */
  queueUiNonce: number;
  connectionUnstable: boolean;
};

/** Result of the inner function passed to {@link UseCleanerLifecycleOrchestratorReturn.enqueueViaPost}. */
export type LifecycleEnqueueViaPostResult = {
  /** When false, skip shared peek / queue / flush tail (e.g. not signed in). Default true. */
  applyPostEnqueueTail?: boolean;
  /** After offline or 5xx enqueue path. */
  armBackoffAfterPostEnqueue?: boolean;
  /** When false, do not trigger a flush after tail. Default true. */
  scheduleFlush?: boolean;
  skipInvalidatePeek?: boolean;
  /** Defaults to `activeBookingId` when omitted. */
  peekBookingId?: string;
};

export type UseCleanerLifecycleOrchestratorReturn = CleanerLifecycleOrchestratorState & {
  flushPendingLifecycleQueue: () => Promise<void>;
  /** Single entry for scheduling a flush (alias of flush). */
  scheduleFlush: () => Promise<void>;
  /**
   * Runs page-owned lifecycle POST / enqueue logic, then applies one shared tail:
   * peek invalidation, queue refresh, optional post-enqueue backoff, optional flush.
   */
  enqueueViaPost: (body: () => Promise<LifecycleEnqueueViaPostResult | void>) => Promise<void>;
  refreshQueueFromDisk: () => void;
  bumpQueueUi: () => void;
  clearFlushBackoff: () => void;
  /** Clears cross-flush peek cache (all or one booking). */
  invalidatePeekCache: (bookingId?: string) => void;
  /** After HTTP post fails into offline queue — short backoff before aggressive flush. */
  armFlushBackoffAfterPostEnqueue: () => void;
  /** After job GET 503 — medium backoff. */
  armFlushBackoffAfterJobFetchDegraded: () => void;
  /** Clears backoff, failure streak, and connection-unstable flag (successful server fetch, etc.). */
  markNetworkStable: () => void;
  /** Resets failure streak, connection flag, and flush backoff (symmetric with markNetworkStable). */
  clearFlushFailureStreakAndConnectionFlag: () => void;
};

/**
 * Owns distributed lifecycle flush: fairness cursor, 2s timeout, chained flush, backoff, BroadcastChannel
 * refresh, peek TTL cache, and queue UI refresh — **refs for queue data**, small React state for UI reactivity.
 */
export function useCleanerLifecycleOrchestrator(
  opts: UseCleanerLifecycleOrchestratorOptions,
): UseCleanerLifecycleOrchestratorReturn {
  const {
    activeBookingId,
    flushWireResolverRef,
    flushPhaseLabelRef,
    loadJob,
    needsJobRefresh,
    clearNeedsJobRefresh,
  } = opts;

  const activeId = activeBookingId.trim();

  const [queueUiNonce, setQueueUiNonce] = useState(0);
  const [offlineQueuedForJob, setOfflineQueuedForJob] = useState(false);
  const [hasFailuresForJob, setHasFailuresForJob] = useState(false);
  const [connectionUnstable, setConnectionUnstable] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);

  const flushInFlightRef = useRef(false);
  const flushBackoffUntilMsRef = useRef(0);
  const flushFailureStreakRef = useRef(0);
  const flushFnRef = useRef<() => Promise<void>>(async () => {});
  const scheduledChainFlushRef = useRef<number | null>(null);
  const flushFromChainedTimerRef = useRef(false);
  const chainedFlushDepthRef = useRef(0);
  const lastAppliedBcMessageVersionRef = useRef(0);
  const lastBcDiskVersionRef = useRef(0);
  const lastBackoffClearMsSeenRef = useRef(0);
  const bcEventsReceivedSessionRef = useRef(0);
  const lifecyclePeekSessionCacheRef = useRef(new Map<string, { wire: LifecycleWireLike; atMs: number }>());
  const flushQueueCursorRef = useRef(0);
  /** Throttles non-chained flush entry (BC, visibility, enqueue bursts). */
  const lastNonChainedFlushStartMsRef = useRef(0);
  const bcRefreshCoalesceTimerRef = useRef<number | null>(null);
  const bcRefreshScheduledRef = useRef(false);
  /** Monotonic “last failure” for connection-unstable auto-clear (90s since last failure). */
  const connectionUnstableSinceMsRef = useRef<number | null>(null);
  /** Non-chained flush source; consumed when a non-chained run is admitted (survives throttle skips). */
  const pendingNonChainedFlushTriggerRef = useRef<LifecycleFlushTrigger>("unknown");
  /** Wall clock for chained flush burst cap (2s across chained starts). */
  const chainBurstStartMsRef = useRef(0);
  const isMountedRef = useRef(true);
  const lastFocusPeekClearMsRef = useRef(0);

  const bumpQueueUi = useCallback(() => setQueueUiNonce((n) => n + 1), []);

  const refreshQueueFromDisk = useCallback(() => {
    if (!activeId) {
      setOfflineQueuedForJob(false);
      setHasFailuresForJob(false);
      bumpQueueUi();
      return;
    }
    const rows = listPendingLifecycle().filter((x) => x.bookingId === activeId);
    setOfflineQueuedForJob(rows.length > 0);
    setHasFailuresForJob(rows.some((x) => x.failed));
    bumpQueueUi();
  }, [activeId, bumpQueueUi]);

  const refreshQueueFromDiskRef = useRef(refreshQueueFromDisk);
  useEffect(() => {
    refreshQueueFromDiskRef.current = refreshQueueFromDisk;
  }, [refreshQueueFromDisk]);

  const clearFlushBackoff = useCallback(() => {
    flushBackoffUntilMsRef.current = 0;
  }, []);

  const clearFlushBackoffRef = useRef(clearFlushBackoff);
  useEffect(() => {
    clearFlushBackoffRef.current = clearFlushBackoff;
  }, [clearFlushBackoff]);

  const markNetworkStable = useCallback(() => {
    flushBackoffUntilMsRef.current = 0;
    flushFailureStreakRef.current = 0;
    connectionUnstableSinceMsRef.current = null;
    setConnectionUnstable(false);
  }, []);

  const clearFlushFailureStreakAndConnectionFlag = useCallback(() => {
    flushFailureStreakRef.current = 0;
    flushBackoffUntilMsRef.current = 0;
    connectionUnstableSinceMsRef.current = null;
    setConnectionUnstable(false);
  }, []);

  const armFlushBackoffAfterPostEnqueue = useCallback(() => {
    flushBackoffUntilMsRef.current = nextFlushBackoffUntilMs(20_000);
  }, []);

  const armFlushBackoffAfterJobFetchDegraded = useCallback(() => {
    flushBackoffUntilMsRef.current = nextFlushBackoffUntilMs(15_000);
  }, []);

  const invalidatePeekCache = useCallback((bookingId?: string) => {
    const bid = bookingId?.trim();
    if (bid) lifecyclePeekSessionCacheRef.current.delete(bid);
    else lifecyclePeekSessionCacheRef.current.clear();
  }, []);

  useEffect(() => {
    const diskV = readPendingLifecycleQueueStorageVersion();
    lastBcDiskVersionRef.current = diskV;
    lastAppliedBcMessageVersionRef.current = 0;
  }, [activeId]);

  useEffect(() => {
    return subscribeCleanerLifecycleQueueChanged(({ version: msgV, clientId: msgClientId }) => {
      bcEventsReceivedSessionRef.current += 1;
      if (msgClientId && msgClientId === getLifecycleBroadcastClientId()) {
        return;
      }
      lifecyclePeekSessionCacheRef.current.clear();
      const diskV = readPendingLifecycleQueueStorageVersion();
      if (msgV > 0 && msgV < lastAppliedBcMessageVersionRef.current) {
        return;
      }
      if (msgV > 0 && msgV === lastAppliedBcMessageVersionRef.current && diskV === lastBcDiskVersionRef.current) {
        return;
      }
      const plan = planBcQueueRefresh({
        messageVersion: msgV,
        lastAppliedMessageVersion: lastAppliedBcMessageVersionRef.current,
        diskVersion: diskV,
        lastDiskVersionApplied: lastBcDiskVersionRef.current,
      });
      if (!plan.shouldRefresh) return;
      lastAppliedBcMessageVersionRef.current = plan.nextLastMessageVersion;
      lastBcDiskVersionRef.current = plan.nextLastDiskVersion;
      if (bcRefreshScheduledRef.current) return;
      bcRefreshScheduledRef.current = true;
      if (bcRefreshCoalesceTimerRef.current != null) window.clearTimeout(bcRefreshCoalesceTimerRef.current);
      bcRefreshCoalesceTimerRef.current = window.setTimeout(() => {
        bcRefreshCoalesceTimerRef.current = null;
        bcRefreshScheduledRef.current = false;
        if (!isMountedRef.current) return;
        refreshQueueFromDiskRef.current();
        pendingNonChainedFlushTriggerRef.current = "bc";
        void flushFnRef.current();
      }, 50);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scheduledChainFlushRef.current != null) {
        window.clearTimeout(scheduledChainFlushRef.current);
        scheduledChainFlushRef.current = null;
      }
      if (bcRefreshCoalesceTimerRef.current != null) {
        window.clearTimeout(bcRefreshCoalesceTimerRef.current);
        bcRefreshCoalesceTimerRef.current = null;
      }
      bcRefreshScheduledRef.current = false;
    };
  }, []);

  const scheduleChainedFlush = useCallback(() => {
    if (scheduledChainFlushRef.current != null) return;
    scheduledChainFlushRef.current = window.setTimeout(() => {
      scheduledChainFlushRef.current = null;
      flushFromChainedTimerRef.current = true;
      void flushFnRef.current();
    }, Math.floor(Math.random() * 500));
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const flushPendingLifecycleQueue = useCallback(async () => {
    if (flushInFlightRef.current) return;
    if (Date.now() < flushBackoffUntilMsRef.current) return;
    if (isOfflineSignal(null, { navigatorOnline: readNavigatorOnline() })) return;

    const fromChained = flushFromChainedTimerRef.current;
    flushFromChainedTimerRef.current = false;
    if (!fromChained) {
      const t = Date.now();
      if (t - lastNonChainedFlushStartMsRef.current < 50) return;
      lastNonChainedFlushStartMsRef.current = t;
    }
    const flushTriggerForCycle: LifecycleFlushTrigger = fromChained
      ? "interval"
      : pendingNonChainedFlushTriggerRef.current;
    if (!fromChained) {
      pendingNonChainedFlushTriggerRef.current = "unknown";
    }
    let flushCycleStep = 0;
    if (fromChained) {
      chainedFlushDepthRef.current += 1;
      if (chainedFlushDepthRef.current === 1) {
        chainBurstStartMsRef.current = Date.now();
      } else if (Date.now() - chainBurstStartMsRef.current > 2000) {
        chainedFlushDepthRef.current = 0;
        return;
      }
      if (chainedFlushDepthRef.current > 5) {
        chainedFlushDepthRef.current = 0;
        return;
      }
      flushCycleStep = chainedFlushDepthRef.current;
    } else {
      chainedFlushDepthRef.current = 0;
      flushCycleStep = 0;
    }

    flushInFlightRef.current = true;
    setIsFlushing(true);
    const flushStartedAt = performance.now();
    let flushTimedOut = false;
    const bcEventsSnap = () => bcEventsReceivedSessionRef.current;
    const peekCallsCount = { n: 0 };
    let flushSkippedStaleCount = 0;
    const backoffClear = readLifecycleFlushBackoffClearSignal();
    if (
      backoffClear &&
      Date.now() - backoffClear.t <= LIFECYCLE_FLUSH_BACKOFF_CLEAR_APPLY_MAX_AGE_MS &&
      backoffClear.t > lastBackoffClearMsSeenRef.current &&
      (backoffClear.src === "lifecycle-peek" || backoffClear.src === "job-detail-get")
    ) {
      lastBackoffClearMsSeenRef.current = backoffClear.t;
      flushBackoffUntilMsRef.current = 0;
      flushFailureStreakRef.current = 0;
    }
    let flushItemsAttempted = 0;
    let flushItemsSucceeded = 0;
    let flushItemsFailed = 0;
    let flushItemsDeferred = 0;
    try {
      const queue = listPendingLifecycle();
      const queueDepthAtFlush = queue.length;
      const open = queue.filter((x) => !x.failed);
      const n = open.length;
      if (n === 0) {
        flushQueueCursorRef.current = 0;
      } else {
        const start = flushQueueCursorRef.current % n;
        let slotsVisited = 0;
        for (let k = 0; k < n; k++) {
          if (performance.now() - flushStartedAt > 2000) {
            flushTimedOut = true;
            flushItemsDeferred += n - k;
            break;
          }
          const item = open[(start + k) % n]!;
          slotsVisited += 1;
          const fresh = listPendingLifecycle();
          const latest = getLatestPendingLifecycleItemForBooking(fresh, item.bookingId);
          if (!latest || latest.idempotencyKey !== item.idempotencyKey) {
            flushSkippedStaleCount += 1;
            flushItemsSucceeded += 1;
            continue;
          }

          flushItemsAttempted += 1;
          const casItemStart = getCasRetriesTotal();

          let peeked: LifecycleWireLike | null = null;
          const ageMs = Date.now() - item.queuedAt;
          if (ageMs > 10 * 60 * 1000 || item.attempts >= 2) {
            peeked = await peekCleanerJobWireForLifecycle({
              bookingId: item.bookingId,
              getHeaders: getCleanerAuthHeaders,
              sessionCache: lifecyclePeekSessionCacheRef.current,
              cacheTtlMs: 8000,
              peekCallsCount,
            });
            if (peeked != null) {
              clearFlushBackoff();
            }
          }
          const wire =
            peeked ?? flushWireResolverRef.current(item.bookingId) ?? null;
          if (shouldDropStaleQueuedLifecycleAction(item.action as PendingLifecycleAction, wire)) {
            flushSkippedStaleCount += 1;
            flushFailureStreakRef.current = 0;
            connectionUnstableSinceMsRef.current = null;
            setConnectionUnstable(false);
            await removePendingLifecycleByKey(item.idempotencyKey);
            lifecyclePeekSessionCacheRef.current.delete(item.bookingId.trim());
            void logCleanerLifecycleClientEvent({
              bookingId: item.bookingId,
              action: item.action,
              status: "synced",
              finalStatus: "synced",
              detail: "stale_queue_dropped",
              queuedAtMs: item.queuedAt,
              networkOnline: readNavigatorOnline(),
              queueDepthAtFlush,
              flushCycleSteps: flushCycleStep,
              bcEventsReceivedSession: bcEventsSnap(),
              casRetriesCount: getCasRetriesTotal() - casItemStart,
            });
            refreshQueueFromDisk();
            flushItemsSucceeded += 1;
            continue;
          }
          const phaseBefore = flushPhaseLabelRef.current(item.bookingId);
          const result = await postCleanerLifecycleWithRetry({
            bookingId: item.bookingId,
            action: item.action,
            idempotencyKey: item.idempotencyKey,
            getHeaders: getCleanerAuthHeaders,
            onPostSuccess: clearFlushBackoff,
          });
          if (result.ok) {
            flushFailureStreakRef.current = 0;
            connectionUnstableSinceMsRef.current = null;
            setConnectionUnstable(false);
            await removePendingLifecycleByKey(item.idempotencyKey);
            lifecyclePeekSessionCacheRef.current.delete(item.bookingId.trim());
            void logCleanerLifecycleClientEvent({
              bookingId: item.bookingId,
              action: item.action,
              status: "synced",
              finalStatus: "synced",
              queuedAtMs: item.queuedAt,
              attemptCount: 0,
              networkOnline: readNavigatorOnline(),
              phaseBefore,
              queueDepthAtFlush,
              detail: result.duplicate ? "idempotent_duplicate" : undefined,
              flushCycleSteps: flushCycleStep,
              bcEventsReceivedSession: bcEventsSnap(),
              casRetriesCount: getCasRetriesTotal() - casItemStart,
            });
            if (item.bookingId === activeId) {
              await loadJob();
            }
            refreshQueueFromDisk();
            flushItemsSucceeded += 1;
            continue;
          }
          if (result.status === 401 || result.status === 403) {
            flushItemsDeferred += Math.max(0, n - k - 1);
            break;
          }
          if (!result.ok && result.status === 409) {
            clearFlushBackoff();
            flushFailureStreakRef.current = 0;
            connectionUnstableSinceMsRef.current = null;
            setConnectionUnstable(false);
            await removePendingLifecycleByKey(item.idempotencyKey);
            lifecyclePeekSessionCacheRef.current.delete(item.bookingId.trim());
            void logCleanerLifecycleClientEvent({
              bookingId: item.bookingId,
              action: item.action,
              status: "synced",
              finalStatus: "synced",
              detail: "idempotent_http_409",
              queuedAtMs: item.queuedAt,
              networkOnline: readNavigatorOnline(),
              phaseBefore,
              queueDepthAtFlush,
              flushCycleSteps: flushCycleStep,
              bcEventsReceivedSession: bcEventsSnap(),
              casRetriesCount: getCasRetriesTotal() - casItemStart,
            });
            refreshQueueFromDisk();
            flushItemsSucceeded += 1;
            continue;
          }
          if (!result.ok && result.status >= 400 && result.status < 500) {
            await removePendingLifecycleByKey(item.idempotencyKey);
            lifecyclePeekSessionCacheRef.current.delete(item.bookingId.trim());
            refreshQueueFromDisk();
            flushItemsSucceeded += 1;
            continue;
          }
          await recordFlushFailure(item.idempotencyKey);
          const after = listPendingLifecycle().find((x) => x.idempotencyKey === item.idempotencyKey);
          flushBackoffUntilMsRef.current = nextFlushBackoffUntilMs(45_000);
          const backoffMsApplied = Math.max(0, flushBackoffUntilMsRef.current - Date.now());
          void logCleanerLifecycleClientEvent({
            bookingId: item.bookingId,
            action: item.action,
            status: "flush_failed",
            finalStatus: "flush_failed",
            detail: `http=${result.status}`,
            attemptCount: after?.attempts,
            networkOnline: readNavigatorOnline(),
            phaseBefore,
            queueDepthAtFlush,
            flushCycleSteps: flushCycleStep,
            bcEventsReceivedSession: bcEventsSnap(),
            casRetriesCount: getCasRetriesTotal() - casItemStart,
            backoffMsApplied,
          });
          flushFailureStreakRef.current += 1;
          flushItemsFailed += 1;
          if (
            flushFailureStreakRef.current >= 2 &&
            (result.status === 0 || isOfflineSignal(null, { navigatorOnline: readNavigatorOnline() }))
          ) {
            connectionUnstableSinceMsRef.current = Date.now();
            setConnectionUnstable(true);
          }
          refreshQueueFromDisk();
          break;
        }
        flushQueueCursorRef.current = (start + slotsVisited) % n;
      }
    } finally {
      const flushLatencyMs = Math.round(performance.now() - flushStartedAt);
      lifecyclePeekSessionCacheRef.current.clear();
      void logCleanerLifecycleClientEvent({
        bookingId: activeId || "lifecycle",
        action: "flush_cycle_metrics",
        status: "queued",
        detail: `peek_calls=${peekCallsCount.n};flush_skipped_stale=${flushSkippedStaleCount};timed_out=${flushTimedOut ? 1 : 0};att=${flushItemsAttempted};ok=${flushItemsSucceeded};fail=${flushItemsFailed};def=${flushItemsDeferred}`,
        networkOnline: readNavigatorOnline(),
        flushSkippedStaleCount,
        peekCallsCount: peekCallsCount.n,
        flushLatencyMs,
        flushCycleTimedOut: flushTimedOut,
        flushItemsAttempted,
        flushItemsSucceeded,
        flushItemsFailed,
        flushItemsDeferred,
        flush_trigger: flushTriggerForCycle,
      });
      flushInFlightRef.current = false;
      setIsFlushing(false);
      refreshQueueFromDisk();
      const remaining = listPendingLifecycle().filter((x) => !x.failed).length;
      if (remaining > 0 && Date.now() >= flushBackoffUntilMsRef.current) {
        scheduleChainedFlush();
      }
    }
  }, [activeId, loadJob, refreshQueueFromDisk, clearFlushBackoff, scheduleChainedFlush, flushWireResolverRef, flushPhaseLabelRef]);

  useEffect(() => {
    flushFnRef.current = flushPendingLifecycleQueue;
  }, [flushPendingLifecycleQueue]);

  useEffect(() => {
    const onOnline = () => {
      flushBackoffUntilMsRef.current = 0;
      flushFailureStreakRef.current = 0;
      connectionUnstableSinceMsRef.current = null;
      setConnectionUnstable(false);
      chainedFlushDepthRef.current = 0;
      pendingNonChainedFlushTriggerRef.current = "online";
      void flushPendingLifecycleQueue();
    };
    window.addEventListener("online", onOnline);
    pendingNonChainedFlushTriggerRef.current = "initial";
    void flushPendingLifecycleQueue();
    return () => window.removeEventListener("online", onOnline);
  }, [flushPendingLifecycleQueue]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFocusPeekClearMsRef.current >= 1000) {
        lastFocusPeekClearMsRef.current = now;
        lifecyclePeekSessionCacheRef.current.clear();
      }
      flushBackoffUntilMsRef.current = 0;
      chainedFlushDepthRef.current = 0;
      void (async () => {
        pendingNonChainedFlushTriggerRef.current = "visibility";
        await flushPendingLifecycleQueue();
        if (!needsJobRefresh) return;
        const ok = await loadJob();
        if (ok) clearNeedsJobRefresh();
      })();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [flushPendingLifecycleQueue, loadJob, needsJobRefresh, clearNeedsJobRefresh]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CLEANER_PENDING_LIFECYCLE_LOCAL_KEY && e.key !== null) return;
      refreshQueueFromDisk();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshQueueFromDisk]);

  useEffect(() => {
    // Intentional: re-sync queue-derived UI when hook mounts or refresh fn identity changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage queue is external store
    refreshQueueFromDisk();
  }, [refreshQueueFromDisk]);

  useEffect(() => {
    if (!connectionUnstable) {
      connectionUnstableSinceMsRef.current = null;
      return;
    }
    if (connectionUnstableSinceMsRef.current == null) {
      connectionUnstableSinceMsRef.current = Date.now();
    }
    const id = window.setInterval(() => {
      const since = connectionUnstableSinceMsRef.current;
      if (since == null) return;
      if (Date.now() - since >= 90_000) {
        connectionUnstableSinceMsRef.current = null;
        setConnectionUnstable(false);
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [connectionUnstable]);

  const scheduleFlush = useCallback(async () => {
    pendingNonChainedFlushTriggerRef.current = "unknown";
    await flushPendingLifecycleQueue();
  }, [flushPendingLifecycleQueue]);

  const enqueueViaPost = useCallback(
    async (body: () => Promise<LifecycleEnqueueViaPostResult | void>) => {
      let r: LifecycleEnqueueViaPostResult | void;
      try {
        r = await body();
      } catch (e) {
        armFlushBackoffAfterPostEnqueue();
        throw e;
      }
      r = r ?? {};
      if (r.applyPostEnqueueTail === false) return;
      const peekId = (r.peekBookingId ?? activeId).trim();
      if (!r.skipInvalidatePeek) {
        if (peekId) invalidatePeekCache(peekId);
        else invalidatePeekCache();
      }
      refreshQueueFromDisk();
      if (r.armBackoffAfterPostEnqueue) armFlushBackoffAfterPostEnqueue();
      if (r.scheduleFlush !== false) {
        pendingNonChainedFlushTriggerRef.current = "enqueue";
        void flushPendingLifecycleQueue();
      }
    },
    [activeId, armFlushBackoffAfterPostEnqueue, flushPendingLifecycleQueue, invalidatePeekCache, refreshQueueFromDisk],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    type LifecycleDebug = {
      getQueue: typeof listPendingLifecycle;
      getState: () => {
        backoffUntil: number;
        failureStreak: number;
        flushInFlight: boolean;
        chainedDepth: number;
        connectionUnstableSinceMs: number | null;
      };
      forceFlush: () => void;
      clearBackoff: () => void;
    };
    const w = window as unknown as { __lifecycleDebug?: LifecycleDebug };
    w.__lifecycleDebug = {
      getQueue: () => listPendingLifecycle(),
      getState: () => ({
        backoffUntil: flushBackoffUntilMsRef.current,
        failureStreak: flushFailureStreakRef.current,
        flushInFlight: flushInFlightRef.current,
        chainedDepth: chainedFlushDepthRef.current,
        connectionUnstableSinceMs: connectionUnstableSinceMsRef.current,
      }),
      forceFlush: () => {
        pendingNonChainedFlushTriggerRef.current = "unknown";
        void flushFnRef.current();
      },
      clearBackoff: () => {
        clearFlushBackoffRef.current();
      },
    };
    return () => {
      delete w.__lifecycleDebug;
    };
  }, []);

  return {
    isFlushing,
    offlineQueuedForJob,
    hasFailuresForJob,
    queueUiNonce,
    connectionUnstable,
    flushPendingLifecycleQueue,
    scheduleFlush,
    enqueueViaPost,
    refreshQueueFromDisk,
    bumpQueueUi,
    clearFlushBackoff,
    invalidatePeekCache,
    armFlushBackoffAfterPostEnqueue,
    armFlushBackoffAfterJobFetchDegraded,
    markNetworkStable,
    clearFlushFailureStreakAndConnectionFlag,
  };
}
