import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export type AdminEarningsActionKind = "fix" | "reset";

/** Best-effort audit row for admin earnings tools (never throws). */
export async function logAdminEarningsAction(
  admin: SupabaseClient,
  entry: { bookingId: string; action: AdminEarningsActionKind; adminUserId: string },
): Promise<void> {
  const bid = entry.bookingId.trim();
  const uid = entry.adminUserId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(bid) || !/^[0-9a-f-]{36}$/i.test(uid)) return;

  const { error } = await admin.from("admin_earnings_actions").insert({
    booking_id: bid,
    action: entry.action,
    admin_user_id: uid,
  });
  if (error) {
    void reportOperationalIssue("warn", "logAdminEarningsAction", error.message, {
      bookingId: bid,
      action: entry.action,
    });
  }
}
