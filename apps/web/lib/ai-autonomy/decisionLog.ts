import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type AiDecisionLogRow = {
  decision_type: string;
  context?: Record<string, unknown> | null;
  prediction?: Record<string, unknown> | null;
  chosen_action: Record<string, unknown>;
  outcome?: Record<string, unknown> | null;
};

/**
 * Persists an audit row for every autonomy-layer decision (best-effort; never throws to callers).
 */
export async function logAiDecision(supabase: SupabaseClient | null | undefined, row: AiDecisionLogRow): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.from("ai_decision_logs").insert({
      decision_type: row.decision_type,
      context: row.context ?? {},
      prediction: row.prediction ?? null,
      chosen_action: row.chosen_action,
      outcome: row.outcome ?? null,
    });
    if (error) {
      console.warn("logAiDecision insert failed", error.message);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("logAiDecision threw", msg);
  }
}
