/**
 * Single formatter for server-derived estimated cleaning duration.
 * UI surfaces must use this — do not recalculate duration independently.
 */

export function formatEstimatedCleaningTimeLabel(durationMinutes: number | null | undefined): string {
  const minutes =
    typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? Math.round(durationMinutes)
      : 0;
  if (minutes < 1) return "Estimated cleaning time: calculating…";
  const hours = Math.round((minutes / 60) * 10) / 10;
  const hoursLabel = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  const unit = hours === 1 ? "hour" : "hours";
  return `Estimated cleaning time: ${hoursLabel} ${unit}`;
}

export function estimatedCleaningHoursFromMinutes(
  durationMinutes: number | null | undefined,
  fallbackHours?: number | null,
): string {
  if (typeof durationMinutes === "number" && durationMinutes > 0) {
    return (durationMinutes / 60).toFixed(1).replace(/\.0$/, "");
  }
  if (typeof fallbackHours === "number" && fallbackHours > 0) {
    return String(fallbackHours);
  }
  return "—";
}


export function stableEstimatedCleaningHours(params: {
  durationMinutes: number | null | undefined;
  quoteReady: boolean;
  detailsReady: boolean;
  minimumHours?: number | null;
}): string {
  if (params.quoteReady && params.detailsReady) {
    return estimatedCleaningHoursFromMinutes(params.durationMinutes);
  }
  if (
    typeof params.minimumHours === "number" &&
    Number.isFinite(params.minimumHours) &&
    params.minimumHours > 0
  ) {
    const minimum = Number.isInteger(params.minimumHours)
      ? String(params.minimumHours)
      : params.minimumHours.toFixed(1).replace(/\.0$/, "");
    return `${minimum}+`;
  }
  return "—";
}
