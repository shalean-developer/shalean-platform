import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import type { CleanerMeRow } from "@/lib/cleaner/cleanerMobileProfileFromMe";

export async function setCleanerAvailability(
  next: boolean,
): Promise<{ ok: true; cleaner: CleanerMeRow } | { ok: false; error: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: false, error: "You appear offline. Reconnect, then try again." };
  }
  const headers = await getCleanerAuthHeaders();
  if (!headers) return { ok: false, error: "Not signed in." };
  try {
    const res = await cleanerAuthenticatedFetch("/api/cleaner/me", {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ is_available: next }),
    });
    const json = (await res.json()) as { cleaner?: CleanerMeRow; error?: string };
    if (!res.ok) return { ok: false, error: json.error ?? "Update failed." };
    if (!json.cleaner) return { ok: false, error: "Update failed." };
    return { ok: true, cleaner: json.cleaner };
  } catch {
    return { ok: false, error: "Network error." };
  }
}
