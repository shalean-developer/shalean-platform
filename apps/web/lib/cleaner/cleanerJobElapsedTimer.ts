import { durationHoursFromMinutes } from "@/lib/booking/quote/resolveBookingDurationWorkload";

export function elapsedMsFromStartedAt(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const raw = typeof startedAt === "string" ? startedAt.trim() : "";
  if (!raw) return null;
  const startMs = Date.parse(raw);
  if (!Number.isFinite(startMs)) return null;
  return Math.max(0, nowMs - startMs);
}

export function elapsedMinutesFromStartedAt(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  const ms = elapsedMsFromStartedAt(startedAt, nowMs);
  if (ms == null) return null;
  return ms / 60_000;
}

export function formatCleanerJobElapsedLabel(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  const ms = elapsedMsFromStartedAt(startedAt, nowMs);
  if (ms == null) return null;
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m on site`;
  if (minutes === 0) return `${hours}h on site`;
  return `${hours}h ${minutes}m on site`;
}

export function formatQuotedDurationLabel(durationMinutes: number | null | undefined): string | null {
  if (durationMinutes == null || !Number.isFinite(durationMinutes) || durationMinutes < 1) return null;
  const hours = durationHoursFromMinutes(Math.round(durationMinutes));
  if (hours % 1 === 0) return `${hours} hours quoted`;
  return `${hours.toFixed(1)} hours quoted`;
}
