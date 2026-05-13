export type CleanerEarningsEligibility = "cleaner_eligible" | "cleaner_ineligible" | "unknown_unclassified";

export type CleanerEarningsEligibilityCategory =
  | "service_base"
  | "bedrooms"
  | "bathrooms"
  | "extra_rooms"
  | "cleaner_eligible_extra"
  | "legacy_extra_aggregate"
  | "equipment_or_supplies"
  | "extra_cleaner_fee"
  | "service_fee"
  | "platform_fee"
  | "admin_fee"
  | "payment_processing_fee"
  | "customer_convenience_fee"
  | "cancellation_fee"
  | "reminder_fee"
  | "late_payment_fee"
  | "tax_or_vat"
  | "cleaner_related_surge"
  | "company_only_surge"
  | "generic_adjustment"
  | "approved_bonus"
  | "unknown";

export type CleanerEarningsEligibilityInput = {
  item_type?: string | null;
  slug?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
  surge_type?: string | null;
  fee_type?: string | null;
  adjustment_category?: string | null;
  earns_cleaner?: boolean | null;
};

export type CleanerEarningsEligibilityResult = {
  eligibility: CleanerEarningsEligibility;
  category: CleanerEarningsEligibilityCategory;
  reason: string;
};

const CLEANER_ELIGIBLE_EXTRA_SLUGS = new Set([
  "inside-cabinets",
  "inside-oven",
  "inside-fridge",
  "interior-walls",
  "ironing",
  "laundry",
  "interior-windows",
  "water-plants",
  "balcony-cleaning",
  "carpet-cleaning",
  "ceiling-cleaning",
  "garage-cleaning",
  "mattress-cleaning",
  "outside-windows",
]);

const EQUIPMENT_OR_SUPPLIES_EXTRA_SLUGS = new Set(["supplies-kit", "equipment", "equipment-fee"]);
const EXTRA_CLEANER_EXTRA_SLUGS = new Set(["extra-cleaner", "extra-cleaner-fee"]);

const FEE_CATEGORY_BY_TOKEN: Array<[RegExp, CleanerEarningsEligibilityCategory]> = [
  [/\bservice[-_\s]?fee\b/, "service_fee"],
  [/\bplatform[-_\s]?fee\b/, "platform_fee"],
  [/\badmin[-_\s]?fee\b/, "admin_fee"],
  [/\bpayment[-_\s]?(processing[-_\s]?)?fee\b/, "payment_processing_fee"],
  [/\bconvenience[-_\s]?fee\b/, "customer_convenience_fee"],
  [/\bcancellation[-_\s]?fee\b/, "cancellation_fee"],
  [/\breminder[-_\s]?fee\b/, "reminder_fee"],
  [/\blate[-_\s]?payment[-_\s]?fee\b/, "late_payment_fee"],
  [/\b(vat|tax)([-_\s]?only)?\b/, "tax_or_vat"],
];

function norm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string {
  if (!metadata || typeof metadata !== "object") return "";
  return norm(metadata[key]);
}

function textForClassification(input: CleanerEarningsEligibilityInput): string {
  const metadata = input.metadata;
  return [
    input.item_type,
    input.slug,
    input.name,
    input.surge_type,
    input.fee_type,
    input.adjustment_category,
    metadataString(metadata, "category"),
    metadataString(metadata, "type"),
    metadataString(metadata, "surge_type"),
    metadataString(metadata, "fee_type"),
    metadataString(metadata, "adjustment_category"),
  ]
    .map(norm)
    .filter(Boolean)
    .join(" ");
}

function ineligible(category: CleanerEarningsEligibilityCategory, reason: string): CleanerEarningsEligibilityResult {
  return { eligibility: "cleaner_ineligible", category, reason };
}

function eligible(category: CleanerEarningsEligibilityCategory, reason: string): CleanerEarningsEligibilityResult {
  return { eligibility: "cleaner_eligible", category, reason };
}

function unknown(reason: string): CleanerEarningsEligibilityResult {
  return { eligibility: "unknown_unclassified", category: "unknown", reason };
}

function classifyFeeLikeText(text: string): CleanerEarningsEligibilityResult | null {
  for (const [pattern, category] of FEE_CATEGORY_BY_TOKEN) {
    if (pattern.test(text)) {
      return ineligible(category, `${category} is company revenue only`);
    }
  }
  return null;
}

export function resolveCleanerEarningsEligibility(
  input: CleanerEarningsEligibilityInput,
): CleanerEarningsEligibilityResult {
  if (input.earns_cleaner === false) {
    return ineligible("generic_adjustment", "line item is explicitly marked earns_cleaner=false");
  }

  const itemType = norm(input.item_type);
  const slug = norm(input.slug);
  const name = norm(input.name);
  const text = textForClassification(input);

  const fee = classifyFeeLikeText(text);
  if (fee) return fee;

  if (text.includes("company-only surge") || text.includes("company_only_surge")) {
    return ineligible("company_only_surge", "company-only surge is not cleaner eligible");
  }

  if (text.includes("cleaner-related surge") || text.includes("cleaner_related_surge")) {
    return eligible("cleaner_related_surge", "cleaner-related surge is cleaner eligible");
  }

  if (text.includes("approved bonus") || text.includes("approved_bonus")) {
    return eligible("approved_bonus", "approved cleaner bonus is cleaner eligible");
  }

  if (itemType === "base") {
    return eligible("service_base", "base service price is cleaner eligible");
  }

  if (itemType === "room") {
    return slug === "extra-rooms" || name.includes("extra room")
      ? eligible("extra_rooms", "extra rooms are cleaner eligible")
      : eligible("bedrooms", "bedrooms/rooms are cleaner eligible");
  }

  if (itemType === "bathroom") {
    return eligible("bathrooms", "bathrooms are cleaner eligible");
  }

  if (itemType === "extra") {
    if (EQUIPMENT_OR_SUPPLIES_EXTRA_SLUGS.has(slug)) {
      return ineligible("equipment_or_supplies", "equipment/supplies extras are company-only");
    }
    if (EXTRA_CLEANER_EXTRA_SLUGS.has(slug)) {
      return ineligible("extra_cleaner_fee", "extra-cleaner fees are not assigned-cleaner earnings");
    }
    if (CLEANER_ELIGIBLE_EXTRA_SLUGS.has(slug)) {
      return eligible("cleaner_eligible_extra", "known cleaner-eligible extra");
    }
    if (!slug && name.includes("add-ons")) {
      return eligible("legacy_extra_aggregate", "legacy aggregate add-ons line remains cleaner eligible until per-extra lines are canonical");
    }
    return unknown("extra slug is not classified in the cleaner earnings matrix");
  }

  if (itemType === "adjustment") {
    return ineligible("generic_adjustment", "generic adjustments must not silently affect cleaner earnings");
  }

  return unknown("line item type is not classified in the cleaner earnings matrix");
}

export function lineItemContributesToCleanerEarnings(input: CleanerEarningsEligibilityInput): boolean {
  return resolveCleanerEarningsEligibility(input).eligibility === "cleaner_eligible";
}
