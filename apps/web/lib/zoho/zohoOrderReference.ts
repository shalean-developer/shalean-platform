export type ZohoOrderKind = "booking" | "monthly" | "sales";

/** Matches the 8-char ids shown in /office (e.g. C44BD9D4). */
export function shortShaleanId(id: string): string {
  return String(id ?? "")
    .trim()
    .slice(0, 8)
    .toUpperCase();
}

/** Short human-readable order number written to Zoho `reference_number`. */
export function formatZohoOrderReference(id: string, kind: ZohoOrderKind): string {
  const short = shortShaleanId(id);
  if (kind === "monthly") return `MI-${short}`;
  if (kind === "sales") return `SD-${short}`;
  return `BK-${short}`;
}
