/** Parsing / normalization helpers for Office three-layer audit. */

const EMPTY_UI_TOKENS = new Set(["", "—", "–", "-", "…", "...", "n/a", "na", "null", "undefined"]);

export function parseIntegerDisplay(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return Math.trunc(raw);
  }
  const s = String(raw).trim().toLowerCase();
  if (EMPTY_UI_TOKENS.has(s)) return null;
  const cleaned = s.replace(/[\s,]/g, "").replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "+") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

export function parseDecimalDisplay(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().toLowerCase();
  if (EMPTY_UI_TOKENS.has(s)) return null;
  const cleaned = s.replace(/[\s,]/g, "").replace(/[^\d.-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse South African Rand displays such as:
 * - "R 1 234"
 * - "R1,234"
 * - "R 1 234,56" (decimal comma — treated as decimal when both separators appear ambiguously)
 */
export function parseZarDisplay(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (EMPTY_UI_TOKENS.has(lower)) return null;
  // Prefer an embedded Rand amount ("Visit paid value R 1 234").
  const embedded = s.match(/(?:zar|r)\s*([-]?\d[\d\s,\.]*)/i);
  if (embedded?.[1]) s = embedded[1].trim();
  else s = s.replace(/^(zar|r)\s*/i, "").trim();
  if (!s) return null;

  // en-ZA often uses space thousands and decimal comma; also accept en-US comma thousands.
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Assume last separator is decimal.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma && !hasDot) {
    // "1,234" thousands vs "1,5" decimal — if exactly 3 digits after comma → thousands.
    const m = s.match(/^(-?\d+),(\d+)$/);
    if (m && m[2]!.length === 3) s = `${m[1]}${m[2]}`;
    else if (m) s = `${m[1]}.${m[2]}`;
    else s = s.replace(/,/g, "");
  }

  s = s.replace(/[\s\u00a0]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parsePercentageDisplay(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const s = String(raw).trim().toLowerCase().replace(/%/g, "");
  if (EMPTY_UI_TOKENS.has(s)) return null;
  return parseDecimalDisplay(s);
}

export function isEmptyUiState(raw: unknown): boolean {
  if (raw == null) return true;
  const s = String(raw).trim().toLowerCase();
  return EMPTY_UI_TOKENS.has(s);
}

export function normalizeStatusLabel(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeMetricValue(
  kind: "integer" | "zar_rand" | "percentage" | "string" | "boolean",
  raw: unknown,
): number | string | boolean | null {
  if (kind === "integer") return parseIntegerDisplay(raw);
  if (kind === "zar_rand") {
    const n = parseZarDisplay(raw);
    if (n == null) return null;
    return Math.round(n);
  }
  if (kind === "percentage") return parsePercentageDisplay(raw);
  if (kind === "boolean") {
    if (typeof raw === "boolean") return raw;
    const s = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (["true", "yes", "1", "healthy"].includes(s)) return true;
    if (["false", "no", "0"].includes(s)) return false;
    return null;
  }
  if (raw == null) return null;
  const s = String(raw).trim();
  if (isEmptyUiState(s)) return null;
  return normalizeStatusLabel(s);
}

/** Johannesburg civil date YYYY-MM-DD. */
export function johannesburgYmd(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** [start, endExclusive) ISO bounds for a Johannesburg calendar day. */
export function johannesburgDayBounds(ymd: string): { startIso: string; endExclusiveIso: string } {
  const d = String(ymd).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`Invalid YMD: ${ymd}`);
  const start = new Date(`${d}T00:00:00+02:00`);
  const endExclusive = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() };
}

export function bookingStartUtcMs(date: string | null | undefined, time: string | null | undefined): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const safeTime = time && /^\d{2}:\d{2}/.test(time) ? `${time.slice(0, 5)}:00` : "00:00:00";
  const t = new Date(`${date}T${safeTime}+02:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

export function startsWithinTwoHours(
  date: string | null | undefined,
  time: string | null | undefined,
  nowMs: number,
): boolean {
  const start = bookingStartUtcMs(date, time);
  if (start == null) return false;
  const mins = Math.round((start - nowMs) / 60_000);
  return mins >= 0 && mins < 120;
}

export function averageBookingValueZar(totalZar: number, count: number): number {
  if (!Number.isFinite(totalZar) || !Number.isFinite(count) || count <= 0) return 0;
  return Math.round(totalZar / count);
}

export function detectStaleFetchedAt(fetchedAt: string | null | undefined, nowMs = Date.now(), maxAgeMs = 5 * 60_000): boolean {
  if (!fetchedAt) return true;
  const t = new Date(fetchedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return nowMs - t > maxAgeMs;
}
