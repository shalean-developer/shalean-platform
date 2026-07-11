const TZ = "Africa/Johannesburg";

/** Default minimum lead time from “now” in Johannesburg before a same-day slot is bookable. */
export const BOOKING_MIN_LEAD_MINUTES = 120;

function hmToMinutes(hm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Wall-clock “now” in Johannesburg as date + minutes since midnight. */
export function johannesburgNowParts(now = new Date()): { ymd: string; minutes: number } {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const hm = now
    .toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .slice(0, 5);
  const minutes = hmToMinutes(hm) ?? 0;
  return { ymd, minutes };
}
