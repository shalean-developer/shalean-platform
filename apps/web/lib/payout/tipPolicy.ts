/**
 * Customer tip policy (Phase 3).
 *
 * Tips charged at checkout (`tip_zar`) are **platform revenue** by default.
 * They are NOT included in `resolveCanonicalCleanerPayout` / cleaner share %.
 * Ops may pass tip value to a cleaner only via explicit `cleaner_bonus_cents`
 * (admin adjust, maker–checker when enabled).
 */
export const TIP_PASSTHROUGH_TO_CLEANER = false as const;

export type TipPolicy = {
  tipPassthroughToCleaner: typeof TIP_PASSTHROUGH_TO_CLEANER;
  note: string;
};

export function getTipPolicy(): TipPolicy {
  return {
    tipPassthroughToCleaner: TIP_PASSTHROUGH_TO_CLEANER,
    note: "Tips stay with Shalean unless manually granted as cleaner_bonus_cents.",
  };
}
