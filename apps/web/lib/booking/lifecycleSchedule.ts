/**
 * Compute lifecycle job times from appointment date/time (Africa/Johannesburg wall time as +02:00).
 * reminder_24h: 24h before appointment start
 * review_request: 4h after appointment start
 * rebook_offer: 24h after appointment start
 */
export function computeLifecycleScheduledIso(params: {
  dateYmd: string | null | undefined;
  timeHm: string | null | undefined;
}): { reminder24h: string; reviewRequest: string; rebookOffer: string } | null {
  const dateYmd = params.dateYmd?.trim();
  if (!dateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;

  let t = params.timeHm?.trim() ?? "";
  if (!/^\d{1,2}:\d{2}$/.test(t)) t = "09:00";
  const [hh, mm] = t.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const wall = `${dateYmd}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+02:00`;
  const startMs = Date.parse(wall);
  if (!Number.isFinite(startMs)) return null;

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  return {
    reminder24h: new Date(startMs - DAY).toISOString(),
    reviewRequest: new Date(startMs + 4 * HOUR).toISOString(),
    rebookOffer: new Date(startMs + DAY).toISOString(),
  };
}
