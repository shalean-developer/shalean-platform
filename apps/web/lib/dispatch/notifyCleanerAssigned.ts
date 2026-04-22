import type { SupabaseClient } from "@supabase/supabase-js";
import { sendCleanerNewJobEmail } from "@/lib/email/sendCleanerNotification";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export async function notifyCleanerAssignedBooking(
  supabase: SupabaseClient,
  bookingId: string,
  cleanerId: string,
): Promise<void> {
  const { data: b } = await supabase
    .from("bookings")
    .select("service, date, time, location")
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

  await sendCleanerNewJobEmail({
    cleanerEmail: email,
    cleanerName: c && typeof c === "object" ? String((c as { full_name?: string }).full_name ?? "Cleaner") : "Cleaner",
    bookingId,
    service: b && typeof b === "object" ? String((b as { service?: string }).service ?? "Cleaning") : "Cleaning",
    dateLabel: b && typeof b === "object" ? String((b as { date?: string }).date ?? "") : "",
    timeLabel: b && typeof b === "object" ? String((b as { time?: string }).time ?? "") : "",
    location: b && typeof b === "object" ? String((b as { location?: string }).location ?? "") : "",
  });
}
