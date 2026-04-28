/**
 * Cleaner-facing offer cards: show area without full street address.
 * Uses the tail of comma-separated lines (typical: street, suburb, city).
 */
export function suburbFromLocationForOffer(location: string | null | undefined): string {
  const raw = location?.trim() ?? "";
  if (!raw) return "Area on file";
  const line = raw.split(/\r?\n/)[0]?.trim() ?? "";
  const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const tail = parts.slice(1).join(", ");
    return tail.length > 56 ? `${tail.slice(0, 53)}…` : tail;
  }
  if (line.length > 48) return `${line.slice(0, 45)}…`;
  return line || "Area on file";
}
