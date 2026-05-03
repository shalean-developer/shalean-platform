import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Completion among bookings where this cleaner is the assigned / selected cleaner.
 * Excludes unpaid / expired shells. Returns null when there is no assignment history yet.
 */
export async function fetchCleanerCompletionRatePercent(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<number | null> {
  const cid = cleanerId.trim();
  if (!cid) return null;

  const orExpr = `cleaner_id.eq.${cid},selected_cleaner_id.eq.${cid}`;

  const base = () =>
    admin
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .or(orExpr)
      .not("status", "eq", "pending_payment")
      .not("status", "eq", "payment_expired");

  const [{ count: total, error: e1 }, { count: completed, error: e2 }] = await Promise.all([base(), base().eq("status", "completed")]);

  if (e1 || e2) return null;
  const t = typeof total === "number" ? total : 0;
  const c = typeof completed === "number" ? completed : 0;
  if (t <= 0) return null;
  return Math.min(100, Math.round((c * 100) / t));
}
