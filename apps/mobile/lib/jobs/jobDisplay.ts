import { johannesburgCalendarYmd } from "@shalean/utils";
import type { StatusTone } from "@/components/ui/StatusBadge";
import type { CleanerJobWire } from "@/services/types/cleanerJobs";

/** Filter jobs whose booking `date` is today in Africa/Johannesburg. */
export function filterTodaysJobs(jobs: CleanerJobWire[], now = new Date()): CleanerJobWire[] {
  const today = johannesburgCalendarYmd(now);
  return jobs.filter((j) => String(j.date ?? "").trim() === today);
}

export function jobStatusLabel(job: CleanerJobWire): string {
  const response = String(job.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  const status = String(job.status ?? "")
    .trim()
    .toLowerCase();

  if (status === "completed" || response === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "in_progress" || response === "started") return "In progress";
  if (response === "on_my_way" || job.en_route_at) return "On the way";
  if (response === "accepted") return "Accepted";
  if (response === "declined") return "Declined";
  if (status === "offered" || status === "assigned" || status === "confirmed") return "Assigned";
  if (job.cleaner_pending_payment_banner) return job.cleaner_pending_payment_banner;
  return status ? status.replace(/_/g, " ") : "Unknown";
}

/** Semantic color tone for status badges — display only. */
export function jobStatusTone(job: CleanerJobWire): StatusTone {
  const label = jobStatusLabel(job).toLowerCase();
  if (label === "completed" || label === "accepted") return "success";
  if (label === "in progress" || label === "on the way") return "info";
  if (label === "cancelled" || label === "declined") return "danger";
  if (label.includes("payment") || label.includes("pending")) return "warning";
  if (label === "assigned") return "warning";
  return "neutral";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** Format YYYY-MM-DD as "Sat 11 Jul" for list headers. */
export function formatFriendlyYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? "").trim());
  if (!m) return ymd;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (Number.isNaN(date.getTime())) return ymd;
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

export function formatDuration(job: CleanerJobWire): string {
  if (typeof job.duration_hours === "number" && Number.isFinite(job.duration_hours) && job.duration_hours > 0) {
    const h = job.duration_hours;
    return h === 1 ? "1 hour" : `${h % 1 === 0 ? h : h.toFixed(1)} hours`;
  }
  if (typeof job.duration_minutes === "number" && job.duration_minutes > 0) {
    const hours = job.duration_minutes / 60;
    return hours === 1 ? "1 hour" : `${hours % 1 === 0 ? hours : hours.toFixed(1)} hours`;
  }
  return "—";
}

export function formatJobTime(time: string | null | undefined): string {
  const t = String(time ?? "").trim();
  if (!t) return "—";
  // Already HH:MM or HH:MM:SS from API
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function extrasLabels(job: CleanerJobWire): string[] {
  if (Array.isArray(job.lineItems) && job.lineItems.length > 0) {
    return job.lineItems
      .filter((li) => String(li.item_type ?? "").toLowerCase() === "extra" || !li.item_type)
      .map((li) => li.name)
      .filter(Boolean);
  }
  if (Array.isArray(job.extras)) {
    return job.extras
      .map((e) => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object" && "name" in e) return String((e as { name: unknown }).name ?? "");
        return "";
      })
      .filter(Boolean);
  }
  return [];
}
