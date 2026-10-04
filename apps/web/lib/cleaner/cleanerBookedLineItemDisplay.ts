import type { CleanerBookingLineItemWire } from "@/lib/cleaner/cleanerBookingRow";
import { stripExtraTimeSuffixFromDisplayLabel } from "@/lib/cleaner/cleanerExtraDisplayLabel";

export type CleanerBookedLineItemPresentation = {
  label: string;
  category: string;
};

const TECHNICAL_SUFFIX_RE =
  /\s*\((?:authoritative\s+subtotal\s+backfill|subtotal\s+backfill|backfill|scope|base)\)\s*$/i;

function humanizeToken(value: string): string {
  const words = value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!words) return "";
  return words
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function categoryLabel(itemType: string): string {
  switch (itemType) {
    case "base":
      return "Service";
    case "bathroom":
      return "Bathroom";
    case "room":
      return "Room";
    case "extra":
      return "Extra";
    case "adjustment":
      return "Adjustment";
    default:
      return humanizeToken(itemType) || "Item";
  }
}

/**
 * Cleaner-facing booked-scope presentation.
 *
 * Financial/backfill provenance belongs in the ledger/API, not in the cleaner UI.
 * Keep the underlying line item unchanged; only normalize the display copy.
 */
export function cleanerBookedLineItemPresentation(
  item: CleanerBookingLineItemWire,
): CleanerBookedLineItemPresentation | null {
  const itemType = String(item.item_type ?? "").trim().toLowerCase();
  const raw = stripExtraTimeSuffixFromDisplayLabel(String(item.name ?? "").trim());
  let label = raw.replace(TECHNICAL_SUFFIX_RE, "").trim();

  // Company-only service-fee backfill rows are pricing mechanics, not booked work.
  if (itemType === "adjustment" && /^service\s+fee$/i.test(label)) {
    return null;
  }

  const slug = String(item.slug ?? "").trim();
  const looksLikeServiceSlug = itemType === "base" && /[-_]/.test(label);
  if ((slug && label.toLowerCase() === slug.toLowerCase()) || looksLikeServiceSlug) {
    label = humanizeToken(label);
  }

  if (!label) {
    label = categoryLabel(itemType);
  }

  return {
    label,
    category: categoryLabel(itemType),
  };
}
