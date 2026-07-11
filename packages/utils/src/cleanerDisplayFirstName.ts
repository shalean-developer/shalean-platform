/** First token of `full_name` for greetings; title-cases ASCII; falls back to “there”. */
export function cleanerDisplayFirstName(fullName: string | null | undefined): string {
  const raw = String(fullName ?? "").trim();
  if (!raw) return "there";
  const token = raw.split(/\s+/)[0] ?? "";
  if (!token) return "there";
  return token.charAt(0).toLocaleUpperCase() + token.slice(1).toLocaleLowerCase();
}
