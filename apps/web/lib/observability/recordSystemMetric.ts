import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Best-effort counter row for `system_metrics` (Day 7). Never throws.
 */
export async function recordSystemMetric(input: {
  metric: string;
  value: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return;
    await admin.from("system_metrics").insert({
      metric: input.metric.slice(0, 160),
      value: input.value,
      metadata: input.metadata ?? {},
    });
  } catch {
    /* ignore */
  }
}
