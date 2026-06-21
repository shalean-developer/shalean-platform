import {
  CLEANER_WEEKDAY_CODES,
  CLEANER_WEEKDAY_LABELS,
  type CleanerWeekdayCode,
} from "@/lib/cleaner/availabilityWeekdays";

export type { CleanerWeekdayCode };
export const CLEANER_APPLY_WORKING_DAY_CODES = CLEANER_WEEKDAY_CODES;
export const CLEANER_APPLY_WORKING_DAY_LABELS = CLEANER_WEEKDAY_LABELS;

const ALLOWED_DAYS = new Set<string>(CLEANER_WEEKDAY_CODES);

export function normalizeCleanerApplyWorkingDays(raw: unknown): CleanerWeekdayCode[] {
  if (!Array.isArray(raw)) return [];
  const picked = new Set<CleanerWeekdayCode>();
  for (const item of raw) {
    const code = String(item ?? "").trim().toLowerCase();
    if (ALLOWED_DAYS.has(code)) picked.add(code as CleanerWeekdayCode);
  }
  return CLEANER_WEEKDAY_CODES.filter((c) => picked.has(c));
}

export function normalizeCleanerApplyWorkingAreas(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const name = String(item ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= 12) break;
  }
  return out;
}

export function formatCleanerApplyWorkingDays(days: unknown): string {
  const normalized = normalizeCleanerApplyWorkingDays(days);
  if (normalized.length === 0) return "";
  return normalized.map((d) => CLEANER_WEEKDAY_LABELS[d]).join(", ");
}

export function formatCleanerApplyWorkingAreas(areas: unknown): string {
  const normalized = normalizeCleanerApplyWorkingAreas(areas);
  return normalized.join(", ");
}
