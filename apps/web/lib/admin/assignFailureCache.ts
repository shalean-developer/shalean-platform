/** How long a per-(booking,cleaner) assign failure is remembered to avoid immediate retries. */
const TTL_MS = 2 * 60 * 1000;

const failures = new Map<string, number>();

function key(bookingId: string, cleanerId: string): string {
  return `${bookingId}\t${cleanerId}`;
}

function prune(): void {
  const now = Date.now();
  for (const [k, t] of failures) {
    if (now - t > TTL_MS) failures.delete(k);
  }
}

export function recordAssignFailure(bookingId: string, cleanerId: string): void {
  failures.set(key(bookingId, cleanerId), Date.now());
}

/** True if this cleaner failed assign for this booking within the TTL. */
export function isAssignFailureFresh(bookingId: string, cleanerId: string): boolean {
  prune();
  const t = failures.get(key(bookingId, cleanerId));
  return t != null && Date.now() - t < TTL_MS;
}

export function clearAssignFailuresForBooking(bookingId: string): void {
  const prefix = `${bookingId}\t`;
  for (const k of [...failures.keys()]) {
    if (k.startsWith(prefix)) failures.delete(k);
  }
}
