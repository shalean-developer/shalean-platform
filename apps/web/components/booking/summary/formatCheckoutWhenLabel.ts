/** Long-form date for dialogs (e.g. Fri, 3 May 2026). */
export function formatCheckoutDateOnly(date: string | null): string {
  const d = date?.trim() ?? "";
  if (!d) return "Not set yet";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/** Time slot label for dialogs. */
export function formatCheckoutTimeDisplay(time: string | null): string {
  const t = time?.trim() ?? "";
  return t || "Not set yet";
}

/** Human-readable date · time for checkout summary rows. */
export function formatCheckoutWhenLabel(date: string | null, time: string | null): string {
  const d = date?.trim() ?? "";
  const t = time?.trim() ?? "";
  if (!d && !t) return "Pick date & time";
  let datePart = "";
  if (d) {
    const parsed = new Date(`${d}T12:00:00`);
    datePart = Number.isNaN(parsed.getTime())
      ? d
      : parsed.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
  }
  return [datePart, t].filter(Boolean).join(" · ");
}
