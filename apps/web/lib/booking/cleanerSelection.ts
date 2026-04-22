export const BOOKING_CLEANER_KEY = "booking_cleaner";

export const BOOKING_CLEANER_EVENT = "booking-cleaner-change";

export type SelectedCleanerSnapshot = {
  id: string;
  name: string;
};

let snapshotCache: { raw: string | null; value: SelectedCleanerSnapshot | null } | null = null;

function setSnapshotCache(raw: string | null, value: SelectedCleanerSnapshot | null) {
  snapshotCache = { raw, value };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseSelectedCleaner(raw: string | null): SelectedCleanerSnapshot | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  if (typeof data.id !== "string" || !data.id) return null;
  if (typeof data.name !== "string" || !data.name) return null;
  return { id: data.id, name: data.name };
}

export function readSelectedCleanerFromStorage(): SelectedCleanerSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(BOOKING_CLEANER_KEY);
    if (snapshotCache && snapshotCache.raw === raw) {
      return snapshotCache.value;
    }
    const parsed = parseSelectedCleaner(raw);
    setSnapshotCache(raw, parsed);
    return parsed;
  } catch {
    setSnapshotCache(null, null);
    return null;
  }
}

export function writeSelectedCleanerToStorage(value: SelectedCleanerSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(BOOKING_CLEANER_KEY, serialized);
    setSnapshotCache(serialized, value);
    window.dispatchEvent(new Event(BOOKING_CLEANER_EVENT));
  } catch {
    /* ignore */
  }
}

export function clearSelectedCleanerFromStorage(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(BOOKING_CLEANER_KEY);
    setSnapshotCache(null, null);
    window.dispatchEvent(new Event(BOOKING_CLEANER_EVENT));
  } catch {
    /* ignore */
  }
}
