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

export type CleanerAssignedHeadlineContext = {
  service?: string | null;
  /** One-line area (e.g. suburb); keep short for SMS. */
  areaShort?: string | null;
};

function headlineService(ctx?: CleanerAssignedHeadlineContext): string {
  const s = String(ctx?.service ?? "").trim();
  return s || "Job";
}

function headlineArea(ctx?: CleanerAssignedHeadlineContext): string {
  const a = String(ctx?.areaShort ?? "").trim();
  if (!a || a === "—") return "";
  return a.length > 32 ? `${a.slice(0, 29)}…` : a;
}

/** First line of address / area suitable for SMS subject lines. */
export function notifyAreaShortForHeadline(location: string | null | undefined): string {
  const line = String(location ?? "")
    .split(/\r?\n/)[0]
    ?.trim();
  if (!line) return "";
  return line.length > 36 ? `${line.slice(0, 33)}…` : line;
}

/** WhatsApp/SMS headline when a cleaner is assigned (amount + job context). */
export function buildCleanerAssignedNotifyHeadline(
  zar: number | null,
  isEstimate: boolean,
  ctx?: CleanerAssignedHeadlineContext,
): string {
  if (zar == null || !Number.isFinite(zar)) return "✅ New job assigned to you";
  const r = `R${Math.round(zar).toLocaleString("en-ZA")}`;
  const svc = headlineService(ctx);
  const area = headlineArea(ctx);
  const place = area ? (area.includes(",") ? area : `in ${area}`) : "";

  if (isEstimate) {
    const tail = place ? ` ${place}` : "";
    return `✅ ~${r} (est.) — ${svc}${tail}`.replace(/\s+/g, " ").trim();
  }
  if (place) return `✅ Earn ${r} — ${svc} ${place}`.replace(/\s+/g, " ").trim();
  return `✅ Earn ${r} — ${svc}`;
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
