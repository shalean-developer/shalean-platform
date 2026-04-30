/** Canonical weekday keys (Monday-first, matches typical ZA ops week display). */
export const CLEANER_WEEKDAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type CleanerWeekdayCode = (typeof CLEANER_WEEKDAY_CODES)[number];

export const CLEANER_WEEKDAY_LABELS: Record<CleanerWeekdayCode, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const ALLOWED = new Set<string>(CLEANER_WEEKDAY_CODES);

/** Normalises DB / JSON into a sorted Mon→Sun subset; defaults to all days if empty or invalid. */
export function normalizeCleanerAvailabilityWeekdays(raw: unknown): CleanerWeekdayCode[] {
  if (!Array.isArray(raw)) return [...CLEANER_WEEKDAY_CODES];
  const picked = new Set<CleanerWeekdayCode>();
  for (const x of raw) {
    const k = String(x).trim().toLowerCase();
    if (ALLOWED.has(k)) picked.add(k as CleanerWeekdayCode);
  }
  const ordered = CLEANER_WEEKDAY_CODES.filter((d) => picked.has(d));
  return ordered.length > 0 ? ordered : [...CLEANER_WEEKDAY_CODES];
}

export function validateCleanerAvailabilityWeekdaysForAdmin(
  raw: unknown,
): { ok: true; value: CleanerWeekdayCode[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "availability_weekdays must be an array." };
  const picked = new Set<CleanerWeekdayCode>();
  for (const x of raw) {
    const k = String(x).trim().toLowerCase();
    if (!ALLOWED.has(k)) return { ok: false, error: `Invalid weekday: ${String(x)}` };
    picked.add(k as CleanerWeekdayCode);
  }
  const ordered = CLEANER_WEEKDAY_CODES.filter((d) => picked.has(d));
  if (ordered.length === 0) return { ok: false, error: "Select at least one weekday." };
  return { ok: true, value: ordered };
}

const JOHANNESBURG_TZ = "Africa/Johannesburg";

const SHORT_WEEKDAY_TO_CODE: Record<string, CleanerWeekdayCode> = {
  mon: "mon",
  monday: "mon",
  tue: "tue",
  tues: "tue",
  tuesday: "tue",
  wed: "wed",
  weds: "wed",
  wednesday: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  thursday: "thu",
  fri: "fri",
  friday: "fri",
  sat: "sat",
  saturday: "sat",
  sun: "sun",
  sunday: "sun",
};

/**
 * Maps a booking calendar `YYYY-MM-DD` to mon..sun using the civil date in Africa/Johannesburg
 * (aligned with `johannesburgCalendarYmd` / roster date strings).
 */
export function weekdayCodeFromYmdJohannesburg(dateYmd: string): CleanerWeekdayCode | null {
  const s = dateYmd.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, mo, d] = s.split("-").map(Number) as [number, number, number];
  const civilInJhb = new Intl.DateTimeFormat("en-CA", {
    timeZone: JOHANNESBURG_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  let anchorMs: number | null = null;
  const start = Date.UTC(y, mo - 1, d - 1, 0, 0, 0);
  const end = Date.UTC(y, mo - 1, d + 3, 0, 0, 0);
  for (let t = start; t <= end; t += 60 * 60 * 1000) {
    if (civilInJhb.format(new Date(t)) === s) {
      anchorMs = t;
      break;
    }
  }
  if (anchorMs == null) return null;

  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: JOHANNESBURG_TZ,
    weekday: "short",
  })
    .formatToParts(new Date(anchorMs))
    .find((p) => p.type === "weekday")?.value;
  if (!wd) return null;
  const key = wd.replace(/\./g, "").trim().toLowerCase();
  return SHORT_WEEKDAY_TO_CODE[key] ?? null;
}

/** Whether the cleaner may be booked on this calendar day (admin weekday roster). */
export function cleanerWorksOnScheduledWeekday(cleanerWeekdaysRaw: unknown, bookingDateYmd: string): boolean {
  const code = weekdayCodeFromYmdJohannesburg(bookingDateYmd);
  if (!code) return true;
  const set = new Set(normalizeCleanerAvailabilityWeekdays(cleanerWeekdaysRaw));
  return set.has(code);
}
