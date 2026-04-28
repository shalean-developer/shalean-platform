import type { PreferredTimeBlock } from "@/lib/cleaner/cleanerPreferencesTypes";

export type CleanerPreferenceRowLike = {
  preferred_areas: string[] | null | undefined;
  preferred_services: string[] | null | undefined;
  preferred_time_blocks: unknown;
  is_strict: boolean | null | undefined;
};

export type JobPreferenceContext = {
  jobLocationId: string;
  jobServiceSlug: string | null;
  jobDateYmd: string;
  jobTimeHm: string;
};

function normAreas(areas: string[] | null | undefined): string[] {
  if (!areas?.length) return [];
  return areas.map((a) => String(a).trim()).filter(Boolean);
}

function normServices(services: string[] | null | undefined): string[] {
  if (!services?.length) return [];
  return services.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

export function parsePreferredTimeBlocks(raw: unknown): PreferredTimeBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PreferredTimeBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const day = Number(o.day);
    const start = String(o.start ?? "").trim();
    const end = String(o.end ?? "").trim();
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    if (!/^\d{1,2}:\d{2}$/.test(start) || !/^\d{1,2}:\d{2}$/.test(end)) continue;
    out.push({ day, start, end });
  }
  return out;
}

/** Weekday 0–6 (Sun–Sat) for `YYYY-MM-DD` using UTC noon anchor. */
export function weekdayUtcFromDateYmd(dateYmd: string): number {
  const p = dateYmd.split("-").map((x) => Number(x));
  if (p.length < 3 || !p.every((n) => Number.isFinite(n))) return 0;
  return new Date(Date.UTC(p[0]!, p[1]! - 1, p[2]!, 12, 0, 0)).getUTCDay();
}

function hmToMinutes(hm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/**
 * Job start time falls inside any block on the job weekday.
 * Supports overnight windows when `start` > `end` (e.g. 22:00–06:00).
 */
export function jobMatchesPreferredTimeBlocks(
  blocks: PreferredTimeBlock[],
  jobDateYmd: string,
  jobTimeHm: string,
): boolean {
  if (!blocks.length) return false;
  const wd = weekdayUtcFromDateYmd(jobDateYmd);
  const jobMin = hmToMinutes(jobTimeHm);
  if (jobMin == null) return false;

  for (const b of blocks) {
    if (b.day !== wd) continue;
    const s = hmToMinutes(b.start);
    const e = hmToMinutes(b.end);
    if (s == null || e == null) continue;
    if (s <= e) {
      if (jobMin >= s && jobMin < e) return true;
    } else {
      if (jobMin >= s || jobMin < e) return true;
    }
  }
  return false;
}

export function hasConfiguredPreferences(pref: CleanerPreferenceRowLike | null | undefined): boolean {
  if (!pref) return false;
  const areas = normAreas(pref.preferred_areas);
  const services = normServices(pref.preferred_services);
  const blocks = parsePreferredTimeBlocks(pref.preferred_time_blocks);
  return areas.length > 0 || services.length > 0 || blocks.length > 0;
}

/**
 * 0.4 * areaMatch + 0.3 * serviceMatch + 0.3 * timeMatch.
 * Per dimension: empty config → 0.5 neutral; configured → 1 match / 0 no match.
 */
export function computePreferenceScore01(pref: CleanerPreferenceRowLike, job: JobPreferenceContext): number {
  const areas = normAreas(pref.preferred_areas);
  const services = normServices(pref.preferred_services);
  const blocks = parsePreferredTimeBlocks(pref.preferred_time_blocks);

  const areaMatch = areas.length === 0 ? 0.5 : areas.includes(String(job.jobLocationId).trim()) ? 1 : 0;
  const svc = (job.jobServiceSlug ?? "").trim().toLowerCase();
  const serviceMatch =
    services.length === 0 ? 0.5 : svc && services.includes(svc) ? 1 : 0;
  const timeMatch = blocks.length === 0 ? 0.5 : jobMatchesPreferredTimeBlocks(blocks, job.jobDateYmd, job.jobTimeHm) ? 1 : 0;

  return 0.4 * areaMatch + 0.3 * serviceMatch + 0.3 * timeMatch;
}

/**
 * Strict cleaners are dropped when any *configured* dimension fails.
 */
export function cleanerPreferenceStrictExcludesJob(
  pref: CleanerPreferenceRowLike,
  job: JobPreferenceContext,
): boolean {
  if (!pref.is_strict) return false;
  const areas = normAreas(pref.preferred_areas);
  if (areas.length > 0 && !areas.includes(String(job.jobLocationId).trim())) {
    return true;
  }
  const services = normServices(pref.preferred_services);
  const svc = (job.jobServiceSlug ?? "").trim().toLowerCase();
  if (services.length > 0 && (!svc || !services.includes(svc))) {
    return true;
  }
  const blocks = parsePreferredTimeBlocks(pref.preferred_time_blocks);
  if (blocks.length > 0 && !jobMatchesPreferredTimeBlocks(blocks, job.jobDateYmd, job.jobTimeHm)) {
    return true;
  }
  return false;
}
