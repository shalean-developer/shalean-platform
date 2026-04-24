/**
 * Single source for booking copy in customer email, cleaner WhatsApp/SMS, and admin alerts.
 */
export type BookingNotifyMessageFields = {
  service: string;
  date: string;
  time: string;
  address: string;
  id: string;
};

function normaliseTimeHm(raw: string): string {
  const s = raw.trim();
  if (s.length >= 5 && /^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s || "—";
}

export function buildBookingNotifyMessageFields(input: {
  bookingId: string;
  service?: string | null;
  date?: string | null;
  time?: string | null;
  location?: string | null;
}): BookingNotifyMessageFields {
  return {
    service: String(input.service ?? "Cleaning").trim() || "Cleaning",
    date: String(input.date ?? "—").trim() || "—",
    time: normaliseTimeHm(String(input.time ?? "—")),
    address: String(input.location ?? "—").trim() || "—",
    id: input.bookingId,
  };
}

/** Plain lines for SMS / WhatsApp (no HTML). */
export function formatBookingNotifyPlainLines(
  m: BookingNotifyMessageFields,
  lines: { headline: string; footerLines?: string[] },
): string {
  const tail = lines.footerLines?.filter(Boolean) ?? [];
  return [
    lines.headline,
    "",
    `Service: ${m.service}`,
    `Date: ${m.date}`,
    `Time: ${m.time}`,
    `Address: ${m.address}`,
    "",
    `Booking ID: ${m.id}`,
    ...tail,
  ].join("\n");
}
