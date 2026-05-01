/** Short label for compact service tiles (checkout step 1). */
export function formatServiceName(name: string): string {
  return name.replace(/Cleaning/gi, "").replace(/-/g, " ").trim();
}
