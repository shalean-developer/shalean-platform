import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function logAiDecision(decisionType: string, payload: Record<string, unknown>): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;

  const { error } = await admin.from("ai_decision_logs").insert({
    decision_type: decisionType,
    payload,
  });
  if (error) {
    await reportOperationalIssue("warn", "logAiDecision", error.message, { decisionType });
  }
}
