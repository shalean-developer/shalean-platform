/**
 * Guardrails for AI- or admin-proposed `pricing_rules.base_multiplier` updates.
 * Deterministic; no network calls.
 */

export const PRICING_MAX_RELATIVE_DELTA = 0.2;
export const PRICING_MULTIPLIER_MIN = 0.8;
export const PRICING_MULTIPLIER_MAX = 1.5;

/** Max allowed drop in portfolio margin ratio (0–1) before recommending rollback. */
export const PRICING_MARGIN_ROLLBACK_THRESHOLD = 0.1;

export function validatePricingChange(oldValue: number, newValue: number): boolean {
  const MAX_CHANGE = PRICING_MAX_RELATIVE_DELTA;
  if (!Number.isFinite(oldValue) || !Number.isFinite(newValue)) return false;
  const diff = Math.abs(newValue - oldValue);
  if (diff > MAX_CHANGE) return false;
  if (newValue < PRICING_MULTIPLIER_MIN || newValue > PRICING_MULTIPLIER_MAX) return false;
  return true;
}

export type AiPricingSuggestion = {
  location: string;
  new_multiplier: number;
  reason?: string;
  /** When set, targets this row exactly (safest for duplicate location labels). */
  pricing_rule_id?: string;
};

export function normalizeLocationLabel(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

export function parseStrictPricingSuggestionsJson(raw: string): { ok: true; items: AiPricingSuggestion[] } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON." };
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, error: "Expected a JSON array." };
  }
  const items: AiPricingSuggestion[] = [];
  for (const el of parsed) {
    if (!el || typeof el !== "object") return { ok: false, error: "Each item must be an object." };
    const o = el as Record<string, unknown>;
    const loc = o.location;
    const nm = o.new_multiplier;
    if (typeof loc !== "string" || !normalizeLocationLabel(loc)) {
      return { ok: false, error: "Each item needs a non-empty string location." };
    }
    if (typeof nm !== "number" || !Number.isFinite(nm)) {
      return { ok: false, error: "Each item needs a finite numeric new_multiplier." };
    }
    const reason = o.reason;
    if (reason != null && typeof reason !== "string") {
      return { ok: false, error: "reason must be a string when present." };
    }
    const prid = o.pricing_rule_id;
    if (prid != null && typeof prid !== "string") {
      return { ok: false, error: "pricing_rule_id must be a string when present." };
    }
    items.push({
      location: normalizeLocationLabel(loc),
      new_multiplier: nm,
      reason: typeof reason === "string" ? reason.slice(0, 4000) : undefined,
      pricing_rule_id: typeof prid === "string" ? prid : undefined,
    });
  }
  return { ok: true, items };
}

export function validateSuggestionShape(s: AiPricingSuggestion): { ok: true } | { ok: false; error: string } {
  const loc = normalizeLocationLabel(s.location);
  if (!loc) return { ok: false, error: "location is required." };
  if (!Number.isFinite(s.new_multiplier)) return { ok: false, error: "new_multiplier must be finite." };
  return { ok: true };
}

/** Coerce JSON body fields into `AiPricingSuggestion` (strict string location; numeric multiplier). */
export function coercePricingSuggestionInput(raw: unknown): AiPricingSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.location !== "string") return null;
  const nm = typeof o.new_multiplier === "number" ? o.new_multiplier : Number(o.new_multiplier);
  if (!Number.isFinite(nm)) return null;
  const reason = o.reason;
  const prid = o.pricing_rule_id;
  return {
    location: normalizeLocationLabel(o.location),
    new_multiplier: nm,
    reason: typeof reason === "string" ? reason.slice(0, 4000) : undefined,
    pricing_rule_id: typeof prid === "string" ? prid : undefined,
  };
}

export function shouldRollbackForMarginDrop(
  marginBefore: number | null | undefined,
  marginAfter: number | null | undefined,
): boolean {
  if (marginBefore == null || marginAfter == null) return false;
  if (!Number.isFinite(marginBefore) || !Number.isFinite(marginAfter)) return false;
  return marginBefore - marginAfter > PRICING_MARGIN_ROLLBACK_THRESHOLD;
}
