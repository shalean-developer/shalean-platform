import type { StatusTone } from "@shalean/mobile-ui";
import { canonicalDbBookingStatus } from "@shalean/types";

export function formatBookingDate(date: string): string {
  try {
    const d = new Date(`${date}T00:00:00`);
    return d.toLocaleDateString("en-ZA", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
  } catch {
    return date;
  }
}

export function formatBookingTime(
  time: string,
  durationHours: number | null | undefined,
  scheduleConfirmed = true,
): string {
  if (!scheduleConfirmed || !time?.trim() || !/^\d{1,2}:\d{2}$/.test(time.trim())) {
    return "Time to be confirmed";
  }
  try {
    const [hStr, mStr] = time.split(":");
    const h = parseInt(hStr ?? "0", 10);
    const m = parseInt(mStr ?? "0", 10);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "Time to be confirmed";
    const start = new Date(2000, 0, 1, h, m);
    const fmt = (d: Date) =>
      d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
    if (durationHours != null && Number.isFinite(durationHours) && durationHours > 0) {
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      return `${fmt(start)} – ${fmt(end)}`;
    }
    return fmt(start);
  } catch {
    return "Time to be confirmed";
  }
}

export function formatAddressLine(
  addressLine: string | null | undefined,
  suburb: string | null | undefined,
): string {
  const parts = [addressLine, suburb]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0 && p !== "—");
  return parts.filter((p, i) => parts.indexOf(p) === i).join(", ") || "Address on file";
}

export function bookingStatusLabel(raw: string | null | undefined): string {
  const s = canonicalDbBookingStatus(raw);
  switch (s) {
    case "pending_payment":
      return "Payment due";
    case "area_review":
      return "Area Review";
    case "pending":
    case "pending_assignment":
      return "Pending Assignment";
    case "offered":
    case "assigned":
      return "Confirmed";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "failed":
      return "Failed";
    default:
      return s ? s.replace(/_/g, " ") : "Status";
  }
}

export function bookingStatusTone(raw: string | null | undefined): StatusTone {
  const s = canonicalDbBookingStatus(raw);
  switch (s) {
    case "completed":
      return "success";
    case "cancelled":
    case "failed":
    case "payment_mismatch":
      return "danger";
    case "pending_payment":
    case "payment_reconciliation_required":
    case "area_review":
      return "warning";
    case "in_progress":
      return "info";
    default:
      return "neutral";
  }
}

export function greetingName(email: string | null | undefined, fullName?: string | null): string {
  const name = String(fullName ?? "").trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  const local = String(email ?? "").split("@")[0]?.trim();
  if (local) return local.charAt(0).toUpperCase() + local.slice(1);
  return "there";
}
