/** Lightweight hints for admin notes (not sent to API). */
export function extractNotesPreviewTags(notes: string): { emoji: string; label: string }[] {
  const t = notes.toLowerCase();
  const out: { emoji: string; label: string }[] = [];
  const push = (emoji: string, label: string) => {
    if (!out.some((x) => x.label === label)) out.push({ emoji, label });
  };
  if (/\b(key|keys|lockbox|code|access)\b/i.test(notes)) push("🔑", "Keys / access");
  if (/\b(gate|gated|boom)\b/i.test(notes)) push("🚪", "Gate");
  if (/\b(pet|pets|dog|cat)\b/i.test(notes)) push("🐶", "Pets");
  if (/\b(alarm|security|disarm)\b/i.test(notes)) push("🔔", "Alarm / security");
  if (/\b(park|parking|garage)\b/i.test(notes)) push("🅿️", "Parking");
  if (/\b(checkout|check-out|checkout time|leave by)\b/i.test(t)) push("⏰", "Checkout time");
  if (/\b(fragile|breakable|handle with care)\b/i.test(notes)) push("📦", "Fragile");
  return out;
}
