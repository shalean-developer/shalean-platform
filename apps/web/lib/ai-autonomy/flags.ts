import "server-only";

/**
 * Master kill-switch and per-domain toggles for the autonomy layer.
 * When disabled, callers must use rule-only paths (existing engines).
 */
export type AiAutonomyFlags = {
  aiDisabled: boolean;
  pricing: boolean;
  assignment: boolean;
  growth: boolean;
};

function envTrue(v: string | undefined): boolean {
  return String(v ?? "").toLowerCase() === "true" || v === "1";
}

export function getAiAutonomyFlags(): AiAutonomyFlags {
  const aiDisabled = envTrue(process.env.AI_DISABLED);
  return {
    aiDisabled,
    pricing: !aiDisabled && envTrue(process.env.AI_PRICING_ENABLED),
    assignment: !aiDisabled && envTrue(process.env.AI_ASSIGNMENT_ENABLED),
    growth: !aiDisabled && envTrue(process.env.AI_GROWTH_ENABLED),
  };
}
