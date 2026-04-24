/** Headers for cleaner phone-login session (`/api/cleaner/*`). */
export function getCleanerIdHeaders(): Record<string, string> | null {
  if (typeof window === "undefined") return null;
  const id = localStorage.getItem("cleaner_id")?.trim();
  if (!id) return null;
  return { "x-cleaner-id": id };
}
