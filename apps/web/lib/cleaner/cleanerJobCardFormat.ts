import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import { ymdLocal } from "@/lib/cleaner/cleanerMobileBookingMap";

export function formatJobDurationShort(hours: number): string {
  if (hours % 1 === 0) return `${hours}h`;
  return `${hours}h`;
}

export function telHref(phone: string): string | undefined {
  const d = phone.replace(/\s/g, "");
  return d ? `tel:${d}` : undefined;
}

export function jobDateHeading(dateStr: string): string {
  const ymd = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return dateStr.trim() || "Scheduled";
  const today = ymdLocal(new Date());
  const tomorrow = ymdLocal(new Date(Date.now() + 86400000));
  if (ymd === today) return "Today";
  if (ymd === tomorrow) return "Tomorrow";
  const [, m, d] = ymd.split("-");
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    Number(m) - 1
  ];
  return `${month} ${Number(d)}`;
}

export function scheduleLineFallback(job: CleanerMobileJobView): string {
  const head = jobDateHeading(job.date);
  const t = job.time?.trim() || "—";
  const dur = formatJobDurationShort(job.durationHours);
  return `${head}, ${t} · ${dur}`;
}

function parseJobStartLocal(dateStr: string, timeStr: string): Date | null {
  const ymd = dateStr.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, mo, d] = ymd.split("-").map(Number);
  const raw = timeStr.trim();
  if (!raw) return new Date(y, mo - 1, d, 0, 0, 0, 0);
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const pm = /\bpm\b/i.test(raw);
  const am = /\bam\b/i.test(raw);
  if (pm && hour < 12) hour += 12;
  if (am && hour === 12) hour = 0;
  if (!am && !pm && hour > 23) return null;
  return new Date(y, mo - 1, d, hour, minute, 0, 0);
}

/** e.g. "Today, 10:00 AM – 2:00 PM" when parse succeeds. */
export function scheduleLineRich(job: CleanerMobileJobView): string {
  const start = parseJobStartLocal(job.date, job.time);
  const hours = job.durationHours;
  if (!start || !Number.isFinite(hours) || hours <= 0) return scheduleLineFallback(job);
  const end = new Date(start.getTime() + hours * 3600000);
  const head = jobDateHeading(job.date);
  const tf: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  const a = start.toLocaleTimeString("en-ZA", tf);
  const b = end.toLocaleTimeString("en-ZA", tf);
  return `${head}, ${a} – ${b}`;
}
