/**
 * Per-device session ack for "Confirm availability" (MVP).
 * Other devices / browsers show "Not confirmed yet" until a DB-backed ack exists.
 */
const STORAGE_KEY = "shalean.cleaner.teamAvailabilityAck.v1";

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export function readTeamAvailabilityAckSet(): Set<string> {
  return new Set(readIds());
}

export function addTeamAvailabilityAck(bookingId: string): void {
  if (typeof window === "undefined") return;
  const id = bookingId.trim();
  if (!id) return;
  const next = new Set(readIds());
  next.add(id);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
}
