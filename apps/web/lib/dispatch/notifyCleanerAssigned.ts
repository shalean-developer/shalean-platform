import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCleanerNewJobEmail } from "@/lib/email/sendCleanerNotification";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

function extrasJsonToEmailLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const slug = typeof o.slug === "string" ? o.slug.trim() : "";
      const price = typeof o.price === "number" && Number.isFinite(o.price) ? Math.round(o.price) : null;
      if (name) out.push(price != null ? `${name} (R${price})` : name);
      else if (slug) out.push(slug);
    }
  }
  return out;
}

export async function notifyCleanerAssignedBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cleanerId: string,
): Promise<void> {
  const { data: b } = await supabase
    .from("bookings")
    .select("service, date, time, location, extras")
    .eq("id", bookingId)
    .maybeSingle();

  const { data: c } = await supabase.from("cleaners").select("email, full_name").eq("id", cleanerId).maybeSingle();

  const email = c && typeof c === "object" ? String((c as { email?: string }).email ?? "") : "";
  if (!email.trim()) {
    await reportOperationalIssue("warn", "notifyCleanerAssignedBooking", "Cleaner has no email", {
      bookingId,
      cleanerId,
    });
    return;
  }

  const extrasRequired =
    b && typeof b === "object" ? extrasJsonToEmailLines((b as { extras?: unknown }).extras) : [];

  await sendCleanerNewJobEmail({
    cleanerEmail: email,
    cleanerName: c && typeof c === "object" ? String((c as { full_name?: string }).full_name ?? "Cleaner") : "Cleaner",
    bookingId,
    service: b && typeof b === "object" ? String((b as { service?: string }).service ?? "Cleaning") : "Cleaning",
    dateLabel: b && typeof b === "object" ? String((b as { date?: string }).date ?? "") : "",
    timeLabel: b && typeof b === "object" ? String((b as { time?: string }).time ?? "") : "",
    location: b && typeof b === "object" ? String((b as { location?: string }).location ?? "") : "",
    extrasRequired: extrasRequired.length ? extrasRequired : undefined,
  });
}
