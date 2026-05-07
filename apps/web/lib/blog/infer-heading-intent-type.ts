/**
 * Lightweight heading → commercial / editorial intent label for analytics.
 * Best-effort only; refine with ML or manual maps when warehouse rolls up.
 */
export function inferHeadingIntentType(headingLabel: string, headingId = ""): string | null {
  const hay = `${headingLabel} ${headingId}`.toLowerCase();

  const rules: { intent: string; re: RegExp }[] = [
    { intent: "faq", re: /\bfaq\b|frequently\s+asked|questions?\s+and\s+answers/ },
    { intent: "pricing", re: /\bpricing\b|\bprices?\b|\bcosts?\b|\brate(?:s| card)?\b|\bfees?\b|\bquote\b/ },
    { intent: "checklist", re: /check\s*list|checklist|things?\s+to\s+(?:do|know)|before\s+we\s+arrive/ },
    { intent: "comparison", re: /\bvs\.?\b|\bversus\b|compare|comparison|deep\s+clean(?:ing)?\s+vs|standard\s+vs/ },
    { intent: "trust", re: /\btrust\b|guarantee|insured|bonded|reviews?|why\s+choose|accredited|certified/ },
    { intent: "process", re: /\bprocess\b|how\s+it\s+works|what\s+to\s+expect|step[s\-–]\d|booking\s+flow/ },
    { intent: "benefits", re: /\bbenefits?\b|advantages?|why\s+us|value\s+of|perks?/ },
    {
      intent: "local_area",
      re: /\bcape\s+town\b|suburb|neighbou?rhood|service\s+areas?|areas?\s+we\s+cover|location/,
    },
  ];

  for (const { intent, re } of rules) {
    if (re.test(hay)) return intent;
  }
  return null;
}
