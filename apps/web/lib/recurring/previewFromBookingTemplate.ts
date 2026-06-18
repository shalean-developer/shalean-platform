import {
  getServiceLabel,
  parseBookingServiceId,
  SERVICE_TYPE_DISPLAY,
  type BookingServiceTypeKey,
} from "@/components/booking/serviceCategories";

export type BookingTemplatePreview = {
  customerEmail: string | null;
  customerName: string | null;
  visitDate: string | null;
  visitTime: string | null;
  location: string | null;
  serviceLabel: string | null;
};

function serviceLabelFromLocked(locked: Record<string, unknown> | null): string | null {
  if (!locked) return null;
  const svcRaw = typeof locked.service === "string" ? locked.service.trim() : "";
  const parsed = svcRaw ? parseBookingServiceId(svcRaw) : null;
  if (parsed) return getServiceLabel(parsed);
  const typeRaw = typeof locked.service_type === "string" ? locked.service_type.trim() : "";
  if (typeRaw && typeRaw in SERVICE_TYPE_DISPLAY) {
    return SERVICE_TYPE_DISPLAY[typeRaw as BookingServiceTypeKey];
  }
  return null;
}

/**
 * Lightweight fields from `booking_snapshot_template` for admin/customer list UIs (no full blob to client).
 */
export function previewFromBookingTemplate(template: unknown): BookingTemplatePreview {
  if (!template || typeof template !== "object" || Array.isArray(template)) {
    return {
      customerEmail: null,
      customerName: null,
      visitDate: null,
      visitTime: null,
      location: null,
      serviceLabel: null,
    };
  }
  const t = template as Record<string, unknown>;
  const cust =
    t.customer && typeof t.customer === "object" && !Array.isArray(t.customer)
      ? (t.customer as Record<string, unknown>)
      : null;
  const email = typeof cust?.email === "string" ? cust.email.trim() : null;
  const name = typeof cust?.name === "string" ? cust.name.trim() : null;
  const flat = t.flat && typeof t.flat === "object" && !Array.isArray(t.flat) ? (t.flat as Record<string, unknown>) : null;
  const locked =
    t.locked && typeof t.locked === "object" && !Array.isArray(t.locked) ? (t.locked as Record<string, unknown>) : null;
  const visitDate =
    (typeof flat?.date === "string" && flat.date) || (typeof locked?.date === "string" && locked.date) || null;
  const visitTime =
    (typeof flat?.time === "string" && flat.time) || (typeof locked?.time === "string" && locked.time) || null;
  const locRaw =
    (typeof flat?.location === "string" && flat.location) ||
    (typeof locked?.location === "string" && locked.location) ||
    "";
  const location = locRaw ? locRaw.trim().slice(0, 160) : null;
  return {
    customerEmail: email || null,
    customerName: name || null,
    visitDate: visitDate || null,
    visitTime: visitTime || null,
    location,
    serviceLabel: serviceLabelFromLocked(locked),
  };
}
