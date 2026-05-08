function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseLocalSlotStart(dateYmd: string, timeHm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return null;
  const t = timeHm.trim().slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = t.split(":").map(Number);
  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function formatGcalLocal(dt: Date): string {
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
}

/** Opens Google Calendar “create event” with the visit window (local date/time interpretation). */
export function buildGoogleCalendarTemplateUrl(opts: {
  dateYmd: string;
  timeHm: string;
  durationHours: number;
  title: string;
  details?: string;
  location?: string;
}): string | null {
  const start = parseLocalSlotStart(opts.dateYmd, opts.timeHm);
  if (!start) return null;
  const hrs =
    typeof opts.durationHours === "number" &&
    Number.isFinite(opts.durationHours) &&
    opts.durationHours > 0 &&
    opts.durationHours <= 24
      ? opts.durationHours
      : 2;
  const end = new Date(start.getTime() + Math.round(hrs * 3600000));
  const dates = `${formatGcalLocal(start)}/${formatGcalLocal(end)}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates,
  });
  if (opts.details) params.set("details", opts.details);
  if (opts.location) params.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
