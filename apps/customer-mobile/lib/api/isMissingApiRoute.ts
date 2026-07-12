import type { ApiFailure } from "@shalean/api-client";

/**
 * True when the upstream returned a route-missing 404 (often HTML "Not Found"
 * from Next.js because the API is not deployed yet on that environment).
 */
export function isMissingApiRoute(result: Pick<ApiFailure, "status" | "error">): boolean {
  if (result.status !== 404) return false;
  const msg = (result.error || "").trim().toLowerCase();
  return (
    !msg ||
    msg === "not found" ||
    msg.includes("page not found") ||
    msg.includes("cannot get") ||
    msg.includes("not found.")
  );
}
