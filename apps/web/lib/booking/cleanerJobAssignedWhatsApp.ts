import "server-only";

import { format, isValid, parseISO } from "date-fns";
import {
  type MetaWhatsAppDeliveryResult,
  metaWhatsAppToDigits,
  sendViaMetaWhatsAppTemplateBody,
} from "@/lib/dispatch/metaWhatsAppSend";
import { assertTemplateSegmentBudget, resolveMetaTemplateName } from "@/lib/whatsapp/cleanerWhatsappTemplates";

/** Row shape after inserting into `public.bookings` (minimal fields for templates). */
export type CreatedBookingRecord = Record<string, unknown> & {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  location: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  status: string | null;
  created_at: string;
};

const TEMPLATE_DATE_DISPLAY_MAX = 30;
const TEMPLATE_TIME_DISPLAY_MAX = 30;
const TEMPLATE_LOCATION_VALUE_MAX = 60;

const LOCATION_EMPTY_FALLBACK = "Location will be shared after acceptance";

function formatCleanerTemplateLocationValue(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const primary = s.split(",")[0]?.trim() ?? "";
  return primary.slice(0, TEMPLATE_LOCATION_VALUE_MAX);
}

function formatCleanerTemplateDate(raw: string): string {
  const d = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return (d || "Scheduled date").slice(0, TEMPLATE_DATE_DISPLAY_MAX);
  const dt = parseISO(d);
  if (!isValid(dt)) return d.slice(0, TEMPLATE_DATE_DISPLAY_MAX);
  return format(dt, "d MMMM yyyy");
}

function formatCleanerTemplateTime(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return (t || "Scheduled time").slice(0, TEMPLATE_TIME_DISPLAY_MAX);
  let h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h > 23 || mi > 59) return t.slice(0, TEMPLATE_TIME_DISPLAY_MAX);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const hh = String(h12).padStart(2, "0");
  const mm = String(mi).padStart(2, "0");
  return `${hh}:${mm} ${ampm}`;
}

/**
 * Short human-visible job tag (not parsed for routing); derived from booking UUID.
 */
export function bookingJobDisplayRef(bookingId: string): string {
  const compact = String(bookingId ?? "")
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase();
  return compact.length >= 6 ? `#${compact}` : `#${String(bookingId).slice(0, 6).toUpperCase()}`;
}

/**
 * `booking_assigned` — exactly **three** body parameters for Meta: location, date, time (fixed order).
 */
export function buildCleanerJobAssignedTemplateParams(booking: CreatedBookingRecord): {
  templateName: string;
  languageCode: string;
  bodyParameters: string[];
} {
  const languageCode =
    process.env.WHATSAPP_TEMPLATE_BOOKING_ASSIGNED_LANG?.trim() ||
    process.env.WHATSAPP_CLEANER_JOB_ASSIGNED_LANG?.trim() ||
    process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() ||
    "en";
  const templateName = resolveMetaTemplateName("booking_assigned");

  const rawLocation = String(booking.location ?? "").trim();
  const locationPrimary = formatCleanerTemplateLocationValue(rawLocation) || LOCATION_EMPTY_FALLBACK;
  const rawDate = String(booking.date ?? "").trim();
  const rawTime = String(booking.time ?? "").trim();
  const bodyParameters = [
    locationPrimary,
    rawDate ? formatCleanerTemplateDate(rawDate) : "Scheduled date",
    rawTime ? formatCleanerTemplateTime(rawTime) : "Scheduled time",
  ];
  assertTemplateSegmentBudget(bodyParameters, "booking_assigned");
  return { templateName, languageCode, bodyParameters };
}

/**
 * `reminder` — two body parameters: location, time (per Phase 8B; static header/emoji in Meta).
 */
export async function sendCleanerJobReminderWhatsApp(params: {
  phone: string;
  bookingId: string;
  cleanerId: string | null;
  location: string;
  timeForCleaner: string;
}): Promise<MetaWhatsAppDeliveryResult> {
  const to = metaWhatsAppToDigits(params.phone);
  if (!to) {
    return { ok: false, error: "Missing or empty recipient phone" };
  }
  const loc = String(params.location ?? "").trim().slice(0, 100) || "TBC";
  const t = String(params.timeForCleaner ?? "").trim().slice(0, 60) || "—";
  const bodyParameters = [loc, t];
  assertTemplateSegmentBudget(bodyParameters, "reminder");
  const languageCode =
    process.env.WHATSAPP_TEMPLATE_REMINDER_LANG?.trim() || process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en";
  return sendViaMetaWhatsAppTemplateBody({
    phone: params.phone,
    templateName: resolveMetaTemplateName("reminder"),
    languageCode,
    bodyParameters,
    recipientRole: "cleaner",
    deliveryLog: {
      bookingId: params.bookingId,
      cleanerId: params.cleanerId,
      templateForLog: "reminder",
      messageType: "template",
    },
  });
}

/**
 * Cleaner-only: `booking_assigned` Meta template (3 body parameters: location, date, time).
 * All sends go through {@link sendViaMetaWhatsAppTemplateBody} with `recipientRole: "cleaner"`.
 */
export async function sendCleanerJobAssignedWhatsApp(
  booking: CreatedBookingRecord,
  options: {
    recipientPhone: string;
    cleanerDisplayName?: string;
    cleanerId?: string | null;
  },
): Promise<MetaWhatsAppDeliveryResult> {
  const to = metaWhatsAppToDigits(options.recipientPhone);
  if (!to) {
    return { ok: false, error: "Missing or empty recipient phone" };
  }

  const { templateName, languageCode, bodyParameters } = buildCleanerJobAssignedTemplateParams(booking);

  return sendViaMetaWhatsAppTemplateBody({
    phone: options.recipientPhone,
    templateName,
    languageCode,
    bodyParameters,
    recipientRole: "cleaner",
    deliveryLog: {
      bookingId: booking.id,
      cleanerId: options.cleanerId ?? null,
      templateForLog: "booking_assigned",
      messageType: "template",
    },
  });
}
