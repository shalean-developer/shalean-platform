/**
 * Soft, non-mandatory encouragement from **existing** cents only (no targets or fake goals).
 */
export function dailyProgressEncouragement(input: {
  /** From `/api/cleaner/me` — show only when cleaner has completed at least one job historically. */
  jobsCompleted?: number;
  todayCents: number;
  weekCents: number;
}): string | null {
  const jc = typeof input.jobsCompleted === "number" && Number.isFinite(input.jobsCompleted) ? input.jobsCompleted : 0;
  if (jc < 1) return null;
  if (input.todayCents <= 0) return null;
  const week = Math.max(0, Math.round(input.weekCents || 0));
  const threshold = Math.max(30_000, Math.floor(week * 0.18));
  if (input.todayCents >= threshold) return "Great progress today 🔥";
  return "You're earning well today";
}
