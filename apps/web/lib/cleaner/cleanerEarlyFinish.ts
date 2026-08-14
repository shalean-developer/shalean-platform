import type { SupabaseClient } from "@supabase/supabase-js";

export const EARLY_FINISH_REASONS = [
  "work_completed_faster",
  "customer_requested_early_finish",
  "property_required_less_work",
  "other",
] as const;

export type EarlyFinishReason = (typeof EARLY_FINISH_REASONS)[number];

export function isEarlyFinishReason(value: unknown): value is EarlyFinishReason {
  return EARLY_FINISH_REASONS.includes(String(value ?? "") as EarlyFinishReason);
}

export async function getApprovedEarlyFinish(
  admin: SupabaseClient,
  bookingId: string,
): Promise<{ approved: boolean; source?: string | null; approvedAt?: string | null; requestId?: string | null }> {
  const { data, error } = await admin
    .from("cleaner_early_finish_requests")
    .select("id,status,approval_source,approved_at")
    .eq("booking_id", bookingId)
    .in("status", ["customer_approved", "admin_approved"])
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { approved: false };
  return {
    approved: true,
    source: data.approval_source ?? null,
    approvedAt: data.approved_at ?? null,
    requestId: data.id ?? null,
  };
}
