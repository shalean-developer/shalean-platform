/** Persist lifecycle POSTs when offline; replay on reconnect. */

import { notifyCleanerLifecycleQueueChanged } from "@/lib/cleaner/cleanerLifecycleQueueBroadcast";
import { broadcastTtlCompleteLockChanged } from "@/lib/cleaner/cleanerLifecycleTtlLockBroadcast";

/** `localStorage` key — listen for `storage` in other tabs using this constant. */
export const CLEANER_PENDING_LIFECYCLE_LOCAL_KEY = "cleanerPendingLifecycleV2";
const STORAGE_KEY_V1 = "cleanerPendingLifecycleV1";
const MAX_ITEMS = 30;
const TTL_DROP_NOTICE_KEY = "cleanerLifecycleQueueTtlDroppedV1";

/**
 * Cross-tab TTL complete lock (`localStorage`). Listen for `storage` with this key, plus
 * {@link broadcastTtlCompleteLockChanged} / `cleaner-ttl-complete-lock` for same-tab updates.
 */
export const CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY = "cleanerLifecycleTtlCompleteLockV1";

/** Drop queue entries older than this (client prune). */
export const PENDING_LIFECYCLE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Stop auto-flush after this many failed POST cycles per item (each cycle already retries network/5xx). */
export const PENDING_LIFECYCLE_MAX_FLUSH_ATTEMPTS = 3;
/** Async CAS attempts before a bounded synchronous merge commit (cross-tab starvation guard). */
export const PENDING_LIFECYCLE_MAX_ASYNC_CAS_ATTEMPTS = 10;

export type PendingLifecycleAction = "accept" | "reject" | "en_route" | "start" | "complete";

export type PendingLifecycleItem = {
  bookingId: string;
  action: PendingLifecycleAction;
  idempotencyKey: string;
  queuedAt: number;
  attempts: number;
  failed?: boolean;
  /** Set on each failed flush attempt (for UX). */
  lastAttemptAt?: number;
};

export type EnqueueLifecycleResult = { ok: true } | { ok: false; reason: string };

type StoredEnvelope = { version: number; items: PendingLifecycleItem[] };

let casRetriesTotal = 0;

/** Monotonic counter: CAS async backoff iterations (for telemetry). */
export function getCasRetriesTotal(): number {
  return casRetriesTotal;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Async jitter between CAS attempts — avoids synchronous spin on the main thread
 * (unlike the bounded fast-retry path in {@link commitEnvelopeSync} for TTL prune).
 */
export async function casBackoffBetweenCasAttempts(attemptIndex: number): Promise<void> {
  const base = 5 + Math.random() * 20;
  const ramp = Math.min(Math.max(0, attemptIndex), 10) * 2.5;
  await sleep(base + ramp);
}

function migrateV1IfNeeded(): void {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY)) return;
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return;
    localStorage.setItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY, raw);
    localStorage.removeItem(STORAGE_KEY_V1);
    notifyCleanerLifecycleQueueChanged();
  } catch {
    /* ignore */
  }
}

function parseRow(row: unknown): PendingLifecycleItem | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const bookingId = typeof o.bookingId === "string" ? o.bookingId.trim() : "";
  const action = typeof o.action === "string" ? o.action.trim() : "";
  const idempotencyKey = typeof o.idempotencyKey === "string" ? o.idempotencyKey.trim() : "";
  const queuedAt = typeof o.queuedAt === "number" && Number.isFinite(o.queuedAt) ? o.queuedAt : 0;
  const attemptsRaw = typeof o.attempts === "number" && Number.isFinite(o.attempts) ? Math.floor(o.attempts) : 0;
  const attempts = Math.max(0, attemptsRaw);
  const failed = o.failed === true;
  const lastAttemptAtRaw = o.lastAttemptAt;
  const lastAttemptAt =
    typeof lastAttemptAtRaw === "number" && Number.isFinite(lastAttemptAtRaw) ? lastAttemptAtRaw : undefined;
  if (!bookingId || !idempotencyKey) return null;
  if (!["accept", "reject", "en_route", "start", "complete"].includes(action)) return null;
  return {
    bookingId,
    action: action as PendingLifecycleItem["action"],
    idempotencyKey,
    queuedAt,
    attempts,
    ...(typeof lastAttemptAt === "number" ? { lastAttemptAt } : {}),
    ...(failed ? { failed: true } : {}),
  };
}

function parseEnvelopeFromRaw(raw: string | null): StoredEnvelope | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    const items: PendingLifecycleItem[] = [];
    for (const row of parsed) {
      const item = parseRow(row);
      if (item) items.push(item);
    }
    return { version: 0, items };
  }
  if (parsed && typeof parsed === "object" && "items" in parsed && Array.isArray((parsed as { items: unknown }).items)) {
    const o = parsed as { version?: unknown; items: unknown[] };
    const v = typeof o.version === "number" && Number.isFinite(o.version) ? Math.max(0, Math.floor(o.version)) : 1;
    const items: PendingLifecycleItem[] = [];
    for (const row of o.items) {
      const item = parseRow(row);
      if (item) items.push(item);
    }
    return { version: v, items };
  }
  return null;
}

/** Read disk without prune side-effects (for CAS loops). */
function loadEnvelopeFromDisk(): StoredEnvelope {
  if (typeof localStorage === "undefined") return { version: 1, items: [] };
  migrateV1IfNeeded();
  try {
    const raw = localStorage.getItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY);
    const env = parseEnvelopeFromRaw(raw);
    if (!env) return { version: 1, items: [] };
    return env;
  } catch {
    return { version: 1, items: [] };
  }
}

function itemsEqual(a: PendingLifecycleItem[], b: PendingLifecycleItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.bookingId !== y.bookingId ||
      x.action !== y.action ||
      x.idempotencyKey !== y.idempotencyKey ||
      x.queuedAt !== y.queuedAt ||
      x.attempts !== y.attempts ||
      Boolean(x.failed) !== Boolean(y.failed) ||
      x.lastAttemptAt !== y.lastAttemptAt
    ) {
      return false;
    }
  }
  return true;
}

function tryCommitOnce(mutator: (items: PendingLifecycleItem[]) => PendingLifecycleItem[]): boolean {
  if (typeof localStorage === "undefined") return false;
  const { version, items } = loadEnvelopeFromDisk();
  const nextItems = mutator(items).slice(0, MAX_ITEMS);
  if (itemsEqual(nextItems, items) && version > 0) {
    return true;
  }
  const raw = localStorage.getItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY);
  const cur = parseEnvelopeFromRaw(raw) ?? { version: 1, items: [] };
  if (cur.version !== version) {
    return false;
  }
  const nextVersion = version === 0 ? 1 : version + 1;
  const payload: StoredEnvelope = { version: nextVersion, items: nextItems };
  localStorage.setItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY, JSON.stringify(payload));
  notifyCleanerLifecycleQueueChanged(nextVersion);
  return true;
}

/**
 * Fast CAS for TTL prune only — bounded synchronous retries (no `await`).
 * User-driven mutations use {@link commitEnvelopeAsync} instead.
 */
function commitEnvelopeSync(mutator: (items: PendingLifecycleItem[]) => PendingLifecycleItem[]): void {
  for (let attempt = 0; attempt < 12; attempt++) {
    if (tryCommitOnce(mutator)) return;
  }
}

/** CAS with jittered async backoff (mutations from user / flush). */
async function commitEnvelopeAsync(mutator: (items: PendingLifecycleItem[]) => PendingLifecycleItem[]): Promise<void> {
  if (typeof localStorage === "undefined") return;
  for (let attempt = 0; attempt < PENDING_LIFECYCLE_MAX_ASYNC_CAS_ATTEMPTS; attempt++) {
    if (tryCommitOnce(mutator)) return;
    casRetriesTotal += 1;
    await casBackoffBetweenCasAttempts(attempt);
  }
  /** Final bounded CAS with micro-yields — avoids a tight main-thread burst when many tabs fall back together. */
  await commitEnvelopeFinalCasWithMicroYields(mutator);
}

/**
 * Bounded synchronous CAS with **time-aware** micro-yields (~one frame) so bursts from many tabs
 * cannot monopolize the main thread even if contention patterns change.
 */
async function commitEnvelopeFinalCasWithMicroYields(
  mutator: (items: PendingLifecycleItem[]) => PendingLifecycleItem[],
): Promise<void> {
  let lastYield = typeof performance !== "undefined" ? performance.now() : 0;
  for (let i = 0; i < 12; i++) {
    if (tryCommitOnce(mutator)) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - lastYield > 8) {
      await Promise.resolve();
      lastYield = typeof performance !== "undefined" ? performance.now() : 0;
    }
  }
}

/** Newest non-failed queued row for a booking (flush should only POST this). */
export function getLatestPendingLifecycleItemForBooking(
  queue: readonly PendingLifecycleItem[],
  bookingId: string,
): PendingLifecycleItem | null {
  const bid = bookingId.trim();
  if (!bid) return null;
  const open = queue.filter((x) => x.bookingId === bid && !x.failed);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => b.queuedAt - a.queuedAt)[0] ?? null;
}

/**
 * Items that would run a flush POST for this frozen snapshot (newest wins per booking;
 * stale rows skipped in iteration order). For tests and diagnostics.
 */
export function pendingLifecycleFlushCandidatesForSnapshot(queue: readonly PendingLifecycleItem[]): PendingLifecycleItem[] {
  const out: PendingLifecycleItem[] = [];
  for (const item of queue) {
    if (item.failed) continue;
    const latest = getLatestPendingLifecycleItemForBooking(queue, item.bookingId);
    if (!latest || latest.idempotencyKey !== item.idempotencyKey) continue;
    out.push(item);
  }
  return out;
}

function pruneExpiredInPlace(items: PendingLifecycleItem[]): PendingLifecycleItem[] {
  const now = Date.now();
  return items.filter((x) => now - x.queuedAt < PENDING_LIFECYCLE_MAX_AGE_MS);
}

function dispatchTtlCompleteLockChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("cleaner-ttl-complete-lock"));
  } catch {
    /* ignore */
  }
}

function setTtlCompleteSyncLockSession(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY, "1");
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    dispatchTtlCompleteLockChanged();
    broadcastTtlCompleteLockChanged("set");
  } catch {
    /* ignore */
  }
}

/** True when a TTL prune dropped an unsynced completion — block duplicate completes until server refresh. */
export function readTtlCompleteSyncLockFromSession(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    if (localStorage.getItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY) === "1") return true;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY) === "1") {
      localStorage.setItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY, "1");
      sessionStorage.removeItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY);
      dispatchTtlCompleteLockChanged();
      broadcastTtlCompleteLockChanged("set");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function clearTtlCompleteSyncLockFromSession(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY);
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(CLEANER_TTL_COMPLETE_LOCK_STORAGE_KEY);
    }
    dispatchTtlCompleteLockChanged();
    broadcastTtlCompleteLockChanged("clear");
  } catch {
    /* ignore */
  }
}

function recordTtlPruneNotice(dropped: PendingLifecycleItem[]): void {
  if (typeof sessionStorage === "undefined" || dropped.length === 0) return;
  const hadComplete = dropped.some((x) => x.action === "complete");
  if (hadComplete) setTtlCompleteSyncLockSession();
  try {
    const raw = sessionStorage.getItem(TTL_DROP_NOTICE_KEY);
    const prev = raw
      ? (JSON.parse(raw) as { n?: number; hadComplete?: boolean })
      : { n: 0, hadComplete: false };
    const n = (typeof prev.n === "number" ? prev.n : 0) + dropped.length;
    const mergedComplete = Boolean(prev.hadComplete) || hadComplete;
    sessionStorage.setItem(TTL_DROP_NOTICE_KEY, JSON.stringify({ n, hadComplete: mergedComplete }));
  } catch {
    /* ignore */
  }
}

/** Monotonic storage version for cross-tab ordering (BroadcastChannel + local compare). */
export function readPendingLifecycleQueueStorageVersion(): number {
  if (typeof localStorage === "undefined") return 0;
  migrateV1IfNeeded();
  try {
    const raw = localStorage.getItem(CLEANER_PENDING_LIFECYCLE_LOCAL_KEY);
    const env = parseEnvelopeFromRaw(raw);
    return env?.version ?? 0;
  } catch {
    return 0;
  }
}

export type QueueTtlPruneNotice = { count: number; hadComplete: boolean };

/** One-shot: TTL prune notice since last consume (then cleared). */
export function consumeQueueTtlPruneNotice(): QueueTtlPruneNotice {
  if (typeof sessionStorage === "undefined") return { count: 0, hadComplete: false };
  try {
    const raw = sessionStorage.getItem(TTL_DROP_NOTICE_KEY);
    if (!raw) return { count: 0, hadComplete: false };
    sessionStorage.removeItem(TTL_DROP_NOTICE_KEY);
    const o = JSON.parse(raw) as { n?: number; hadComplete?: boolean };
    const n = typeof o.n === "number" && o.n > 0 ? o.n : 0;
    return { count: n, hadComplete: Boolean(o.hadComplete) };
  } catch {
    return { count: 0, hadComplete: false };
  }
}

/** Prune expired rows and persist if anything dropped. */
function readAll(): PendingLifecycleItem[] {
  const { items } = loadEnvelopeFromDisk();
  const kept = pruneExpiredInPlace(items);
  if (kept.length !== items.length) {
    const keptKeys = new Set(kept.map((k) => k.idempotencyKey));
    const dropped = items.filter((x) => !keptKeys.has(x.idempotencyKey));
    recordTtlPruneNotice(dropped);
    commitEnvelopeSync(() => kept);
    return kept;
  }
  return items;
}

function linearRank(action: PendingLifecycleAction): number | null {
  switch (action) {
    case "accept":
      return 0;
    case "en_route":
      return 1;
    case "start":
      return 2;
    case "complete":
      return 3;
    case "reject":
      return null;
    default:
      return null;
  }
}

/**
 * When at most one queued row exists per booking, validate replacing `existing` with `next`.
 */
export function canEnqueueLifecycleAfterQueued(
  existing: PendingLifecycleAction | null,
  next: PendingLifecycleAction,
): EnqueueLifecycleResult {
  if (!existing) return { ok: true };
  if (existing === next) return { ok: true };

  if (existing === "reject") {
    if (next === "reject") return { ok: true };
    return {
      ok: false,
      reason: "A decline is already queued for this job — sync or refresh before doing anything else.",
    };
  }

  if (next === "reject") {
    const ex = linearRank(existing);
    if (ex !== null && ex >= 1) {
      return {
        ok: false,
        reason: "You can’t queue a decline after you’ve already moved past that step on this device.",
      };
    }
    return { ok: true };
  }

  const rx = linearRank(existing);
  const ry = linearRank(next);
  if (rx === null || ry === null) return { ok: true };
  if (ry < rx) {
    /**
     * Queued `en_route` / `start` / `complete` while the server (and job UI) is still at accept means the
     * outbox is stale — e.g. offline tap, failed flush, or optimistic queue never cleared. Replacing with a
     * fresh `accept` matches the screen and avoids blocking Accept when the booking never advanced server-side.
     */
    if (next === "accept" && rx > 0) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: "That would go backwards in the job steps — wait for sync or refresh.",
    };
  }
  return { ok: true };
}

/**
 * One pending row per booking (newest intent wins). Validates ordering against the previous queued action.
 */
export async function enqueuePendingLifecycle(
  item: Omit<PendingLifecycleItem, "attempts" | "failed"> & { attempts?: number },
): Promise<EnqueueLifecycleResult> {
  const snapshot = readAll();
  const bid = item.bookingId.trim();
  const existing = snapshot.find((x) => x.bookingId === bid) ?? null;
  const gate = canEnqueueLifecycleAfterQueued(existing?.action ?? null, item.action as PendingLifecycleAction);
  if (!gate.ok) return gate;

  const full: PendingLifecycleItem = {
    bookingId: bid,
    action: item.action,
    idempotencyKey: item.idempotencyKey.trim(),
    queuedAt: item.queuedAt,
    attempts: item.attempts ?? 0,
    failed: false,
  };

  let race: string | null = null;
  await commitEnvelopeAsync((all) => {
    const ex2 = all.find((x) => x.bookingId === bid) ?? null;
    if ((ex2?.action ?? null) !== (existing?.action ?? null)) {
      race = "Queue changed while saving. Try again.";
      return all;
    }
    const next = all.filter((x) => x.bookingId !== full.bookingId);
    next.push(full);
    next.sort((a, b) => a.queuedAt - b.queuedAt);
    return next;
  });
  if (race) return { ok: false, reason: race };
  return { ok: true };
}

export function listPendingLifecycle(): PendingLifecycleItem[] {
  return readAll();
}

export function listPendingLifecycleForBooking(bookingId: string): PendingLifecycleItem[] {
  const id = bookingId.trim();
  if (!id) return [];
  return readAll().filter((x) => x.bookingId === id);
}

export async function removePendingLifecycleByKey(idempotencyKey: string): Promise<void> {
  const k = idempotencyKey.trim();
  if (!k) return;
  await commitEnvelopeAsync((items) => items.filter((x) => x.idempotencyKey !== k));
}

export async function removePendingLifecycleForBooking(bookingId: string): Promise<void> {
  const id = bookingId.trim();
  if (!id) return;
  await commitEnvelopeAsync((items) => items.filter((x) => x.bookingId !== id));
}

export async function recordFlushFailure(idempotencyKey: string): Promise<void> {
  const k = idempotencyKey.trim();
  if (!k) return;
  await commitEnvelopeAsync((items) => {
    const idx = items.findIndex((x) => x.idempotencyKey === k);
    if (idx < 0) return items;
    const prev = items[idx]!;
    const nextAttempts = prev.attempts + 1;
    const failed = nextAttempts >= PENDING_LIFECYCLE_MAX_FLUSH_ATTEMPTS;
    const now = Date.now();
    const next = [...items];
    next[idx] = {
      ...prev,
      attempts: nextAttempts,
      lastAttemptAt: now,
      ...(failed ? { failed: true } : { failed: false }),
    };
    return next;
  });
}

export async function retryFailedQueueItem(idempotencyKey: string): Promise<void> {
  const k = idempotencyKey.trim();
  if (!k) return;
  await commitEnvelopeAsync((items) => {
    const idx = items.findIndex((x) => x.idempotencyKey === k);
    if (idx < 0) return items;
    const prev = items[idx]!;
    const next = [...items];
    next[idx] = { ...prev, attempts: 0, failed: false, lastAttemptAt: undefined };
    return next;
  });
}
