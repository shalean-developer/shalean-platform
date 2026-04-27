import "server-only";

import type { AssignmentWeights } from "@/lib/ai-autonomy/modelWeights";
import type { CleanerAcceptanceResult } from "@/lib/ai-autonomy/predictions";

/**
 * Small additive adjustment on top of Phase-3 dispatch score — bounded for safety.
 * Uses marketplace MI score + acceptance model + learned weight multipliers.
 */
export function computeAiDispatchDelta(miScore: number, acc: CleanerAcceptanceResult, w: AssignmentWeights): number {
  const miNorm = (Number.isFinite(miScore) ? miScore : 0) / 125;
  const miPart = miNorm * w.miScoreBlend * 0.9;
  const accPart = (acc.probability - 0.5) * 3.2 * w.acceptanceBlend;
  const raw = miPart * 0.55 + accPart;
  return Math.min(2.8, Math.max(-2.8, raw));
}
