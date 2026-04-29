/**
 * Client-only slot presentation & ordering for the booking schedule.
 * Does not affect pricing APIs, lock payloads, or server eligibility.
 */

export type UiSlot = {
  time: string;
  price: number | null;
  cleanersCount: number;
  isEstimated?: boolean;
  score: number;
  badges: string[];
  group: "recommended" | "earlier" | "later";
  priceDelta: number;
  isBestValue?: boolean;
  /** Same-day max slot price (client display only). */
  maxDayPrice: number;
};

export type ScheduleSlotInput = {
  time: string;
  price: number | null;
  cleanersCount: number;
  isEstimated?: boolean;
};

function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
}

function timeScore(slotMin: number, nowMin: number, isToday: boolean): number {
  if (!isToday || slotMin < 0) return 12;
  const d = slotMin - nowMin;
  if (d < 120) return Math.max(0, (d / 120) * 8);
  if (d <= 360) return 8 + ((d - 120) / 240) * 12;
  return Math.max(0, 20 - (d - 360) / 90);
}

function scoreSlot(
  slot: ScheduleSlotInput,
  minPrice: number,
  maxCleaners: number,
  nowMin: number,
  isToday: boolean,
): number {
  const slotMin = hmToMinutes(slot.time);
  const priceScore =
    slot.price != null && Number.isFinite(slot.price) && slot.price > 0 ? (minPrice / slot.price) * 50 : 0;
  const availabilityScore =
    maxCleaners > 0 ? (Math.max(0, slot.cleanersCount) / maxCleaners) * 30 : slot.cleanersCount > 0 ? 15 : 0;
  const ts = timeScore(slotMin, nowMin, isToday);
  return priceScore + availabilityScore + ts;
}

/** AI-lite: nudge ranking from wall-clock + booking date (display order only). */
function personalizationScoreBonus(
  slotMin: number,
  opts: { clientHour: number; isToday: boolean; selectedDateYmd: string; todayYmd: string },
): number {
  const ch = Math.floor(Number(opts.clientHour));
  if (slotMin < 0) return 0;
  if (opts.isToday && ch < 12) {
    const cap = 13 * 60;
    if (slotMin < cap) return ((cap - slotMin) / cap) * 4;
  }
  if (ch >= 17 && !opts.isToday && opts.selectedDateYmd > opts.todayYmd) {
    if (slotMin >= 7 * 60 && slotMin <= 11 * 60 + 30) return 3;
  }
  if (ch >= 17 && opts.isToday) {
    if (slotMin > 16 * 60) return -1.5;
  }
  return 0;
}

/**
 * Builds UI slots with scores, badges, price deltas, and render groups.
 */
export type BuildUiSlotsOpts = {
  isToday: boolean;
  nowMinutes: number;
  /** Local hour 0–23 for light personalization. */
  clientHour?: number;
  selectedDateYmd?: string;
  todayYmd?: string;
};

export function buildUiSlots(slots: ScheduleSlotInput[], opts: BuildUiSlotsOpts): UiSlot[] {
  if (slots.length === 0) return [];

  const finitePrices = slots.map((s) => s.price).filter((p): p is number => p != null && Number.isFinite(p));
  const minPrice = finitePrices.length > 0 ? Math.min(...finitePrices) : 0;
  const maxCleaners = Math.max(...slots.map((s) => s.cleanersCount ?? 0), 0);
  const minPriceForScore = minPrice > 0 ? minPrice : 1;
  const maxCleanersForScore = maxCleaners > 0 ? maxCleaners : 1;

  const normalized: ScheduleSlotInput[] = slots.map((s) => ({
    time: s.time,
    price: s.price != null && Number.isFinite(s.price) ? s.price : null,
    cleanersCount: Math.max(0, Math.round(s.cleanersCount ?? 0)),
    isEstimated: s.isEstimated,
  }));

  const ch = opts.clientHour;
  const sel = opts.selectedDateYmd ?? "";
  const today = opts.todayYmd ?? "";
  const usePers = typeof ch === "number" && Number.isFinite(ch) && sel.length >= 10 && today.length >= 10;

  const scored = normalized.map((s) => {
    const base = scoreSlot(s, minPriceForScore, maxCleanersForScore, opts.nowMinutes, opts.isToday);
    const slotMin = hmToMinutes(s.time);
    const pers = usePers ? personalizationScoreBonus(slotMin, { clientHour: ch, isToday: opts.isToday, selectedDateYmd: sel, todayYmd: today }) : 0;
    const score = base + pers;
    const priceDelta = s.price != null && minPrice > 0 ? s.price - minPrice : 0;
    return { ...s, score, priceDelta, badges: [] as string[], group: "later" as UiSlot["group"], isBestValue: false };
  });

  const sortedByTime = [...scored].sort((a, b) => a.time.localeCompare(b.time));
  const earliestTime = sortedByTime[0]?.time ?? null;
  const minsList = sortedByTime.map((s) => hmToMinutes(s.time)).filter((m) => m >= 0);
  const medianMin =
    minsList.length === 0
      ? -1
      : minsList.length % 2 === 1
        ? minsList[(minsList.length - 1) >> 1]!
        : (minsList[minsList.length / 2 - 1]! + minsList[minsList.length / 2]!) / 2;

  const byScore = [...scored].sort((a, b) => b.score - a.score);
  const top2 = new Set(byScore.slice(0, 2).map((s) => s.time));
  const maxScore = byScore[0]?.score ?? 0;

  const finitePricesAll = scored.map((s) => s.price).filter((p): p is number => p != null && Number.isFinite(p));
  const maxPrice = finitePricesAll.length > 0 ? Math.max(...finitePricesAll) : 0;

  return scored.map((s) => {
    const rawBadges: string[] = [];
    if (s.score === maxScore && maxScore > 0) rawBadges.push("Recommended");
    if (s.price != null && minPrice > 0 && s.price === minPrice) rawBadges.push("Best price");
    if (s.cleanersCount <= 2) rawBadges.push("Limited");
    if (earliestTime && s.time === earliestTime) rawBadges.push("Earliest");
    if (maxCleaners > 0 && s.cleanersCount >= maxCleaners - 1) rawBadges.push("High availability");

    const badges = pickBadgesWithCap(rawBadges, 2);

    const slotMin = hmToMinutes(s.time);
    let group: UiSlot["group"];
    if (top2.has(s.time)) group = "recommended";
    else if (medianMin >= 0 && slotMin >= 0 && slotMin < medianMin) group = "earlier";
    else group = "later";

    const isBestValue =
      Boolean(s.price != null && minPrice > 0 && s.price === minPrice) &&
      maxCleaners > 0 &&
      s.cleanersCount >= Math.max(1, maxCleaners - 1);

    return {
      time: s.time,
      price: s.price,
      cleanersCount: s.cleanersCount,
      isEstimated: s.isEstimated,
      score: s.score,
      badges,
      group,
      priceDelta: s.priceDelta,
      isBestValue,
      maxDayPrice: maxPrice,
    };
  });
}

const BADGE_PRIORITY = ["Recommended", "Best price", "Limited", "Earliest", "High availability"] as const;

function pickBadgesWithCap(raw: string[], max: number): string[] {
  const rank = (b: string) => {
    const i = BADGE_PRIORITY.indexOf(b as (typeof BADGE_PRIORITY)[number]);
    return i === -1 ? 99 : i;
  };
  return [...raw].sort((a, b) => rank(a) - rank(b)).slice(0, max);
}

/** Final column order: recommended (score desc), earlier (time asc), later (time asc). */
export function orderTimesForConversionGrid(ui: UiSlot[]): string[] {
  const rec = ui.filter((s) => s.group === "recommended").sort((a, b) => b.score - a.score);
  const early = ui.filter((s) => s.group === "earlier").sort((a, b) => a.time.localeCompare(b.time));
  const late = ui.filter((s) => s.group === "later").sort((a, b) => a.time.localeCompare(b.time));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of [...rec, ...early, ...late]) {
    if (seen.has(row.time)) continue;
    seen.add(row.time);
    out.push(row.time);
  }
  return out;
}

export type ScheduleDefaultPickVariant = "score" | "cheapest" | "fastest_confirm";

export function defaultPickTimeFromUiSlots(
  ui: UiSlot[],
  variant: ScheduleDefaultPickVariant = "score",
): string | null {
  if (ui.length === 0) return null;
  if (variant === "fastest_confirm") {
    const sorted = [...ui].sort((a, b) => {
      if (b.cleanersCount !== a.cleanersCount) return b.cleanersCount - a.cleanersCount;
      if (b.score !== a.score) return b.score - a.score;
      return a.time.localeCompare(b.time);
    });
    return sorted[0]?.time ?? null;
  }
  if (variant === "cheapest") {
    const sorted = [...ui].sort((a, b) => {
      const ap = a.price ?? Number.POSITIVE_INFINITY;
      const bp = b.price ?? Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      if (b.score !== a.score) return b.score - a.score;
      return a.time.localeCompare(b.time);
    });
    return sorted[0]?.time ?? null;
  }
  const sorted = [...ui].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ap = a.price ?? Number.POSITIVE_INFINITY;
    const bp = b.price ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return a.time.localeCompare(b.time);
  });
  return sorted[0]?.time ?? null;
}

/** Read from `NEXT_PUBLIC_SCHEDULE_AB_DEFAULT` at build time (`cheapest` | `fastest_confirm` | unset = score). */
export function readScheduleDefaultPickVariant(): ScheduleDefaultPickVariant {
  if (typeof process === "undefined" || !process.env?.NEXT_PUBLIC_SCHEDULE_AB_DEFAULT) return "score";
  const v = String(process.env.NEXT_PUBLIC_SCHEDULE_AB_DEFAULT).toLowerCase().trim();
  if (v === "cheapest") return "cheapest";
  if (v === "fastest_confirm" || v === "fastest") return "fastest_confirm";
  return "score";
}

export function readScheduleVisibleSlotCap(fallback: number): number {
  if (typeof process === "undefined" || !process.env?.NEXT_PUBLIC_SCHEDULE_VISIBLE_SLOTS) return fallback;
  const n = Number.parseInt(String(process.env.NEXT_PUBLIC_SCHEDULE_VISIBLE_SLOTS), 10);
  return Number.isFinite(n) && n >= 4 && n <= 12 ? n : fallback;
}

/** Empty-state line when a day has no slots (client copy only). */
export function formatNextAvailableSlotLine(nextDateYmd: string | null): string {
  if (!nextDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(nextDateYmd)) {
    return "Pick another date above to see the next open times.";
  }
  const [y, m, d] = nextDateYmd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const day = dt.toLocaleDateString("en-ZA", { weekday: "long" });
  return `Next available: ${day} at 09:00`;
}

export type BestValueCallout = { time: string; line: string };

export function computeBestValueCallout(ui: UiSlot[], minPrice: number): BestValueCallout | null {
  if (ui.length < 2 || minPrice <= 0) return null;
  const sorted = [...ui].sort((a, b) => b.score - a.score);
  const first = sorted[0]!;
  const second = sorted[1]!;
  if (second.score <= 0 || first.score <= second.score * 1.15) return null;
  const lowPrice = first.price != null && first.price === minPrice;
  const maxC = Math.max(...ui.map((s) => s.cleanersCount), 0);
  const highAvail = maxC > 0 && first.cleanersCount >= maxC - 1;
  if (!lowPrice && !highAvail) return null;
  const parts: string[] = [];
  if (lowPrice) parts.push("lowest price");
  if (highAvail) parts.push("high availability");
  const hint = parts.length ? parts.join(" with ") : "great fit";
  return {
    time: first.time,
    line: `Best value: ${first.time} — ${hint}.`,
  };
}

export function formatPriceDeltaZar(delta: number): string {
  if (delta === 0) return "";
  if (delta > 0) return `+R ${Math.round(delta).toLocaleString("en-ZA")}`;
  return `Save R ${Math.round(Math.abs(delta)).toLocaleString("en-ZA")}`;
}

/** Gain framing vs cheapest / peak slots the same day (display only). */
export function formatSlotPriceGainLine(
  price: number | null,
  minPrice: number,
  maxPrice: number,
): string | null {
  if (price == null || !Number.isFinite(price) || minPrice <= 0 || maxPrice <= 0) return null;
  if (maxPrice <= minPrice) return null;
  if (price <= minPrice + 0.5) {
    const save = Math.round(maxPrice - minPrice);
    if (save < 1) return null;
    return `Save R ${save.toLocaleString("en-ZA")} vs other times`;
  }
  if (price < maxPrice - 0.5) {
    const vsPeak = Math.round(maxPrice - price);
    if (vsPeak < 1) return null;
    return `R ${vsPeak.toLocaleString("en-ZA")} cheaper than peak times`;
  }
  return null;
}

/** Subtle day-part label for HH:mm (local grid). */
export function timeDaypartLabel(hm: string): string {
  const m = hmToMinutes(hm);
  if (m < 0) return "";
  if (m < 9 * 60) return "Early morning";
  if (m < 12 * 60) return "Mid-morning";
  if (m < 14 * 60) return "Midday";
  if (m < 16 * 60) return "Afternoon";
  return "Late afternoon";
}
