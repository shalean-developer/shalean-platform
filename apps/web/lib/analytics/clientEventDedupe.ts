const recentEvents = new Map<string, number>();

function withoutVolatileFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutVolatileFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "timestamp")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, withoutVolatileFields(entry)]),
  );
}

/** Suppresses only an identical event repeated during a React remount burst. */
export function shouldSendClientEvent(scope: string, payload: unknown, windowMs = 1_500): boolean {
  const now = Date.now();
  const key = `${scope}:${JSON.stringify(withoutVolatileFields(payload))}`;
  const previous = recentEvents.get(key) ?? 0;
  recentEvents.set(key, now);
  if (recentEvents.size > 200) {
    for (const [candidate, sentAt] of recentEvents) {
      if (now - sentAt > windowMs) recentEvents.delete(candidate);
    }
  }
  return now - previous > windowMs;
}

export function clearClientEventDedupeForTests(): void {
  recentEvents.clear();
}
