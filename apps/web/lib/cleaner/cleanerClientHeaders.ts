import { buildBearerHeaders } from "@shalean/api-client";
import { webTokenProvider } from "@/lib/api/webTokenProvider";

/** Auth headers for `/api/cleaner/*` — Supabase session JWT only. */
export async function getCleanerAuthHeaders(): Promise<Record<string, string> | null> {
  return buildBearerHeaders(webTokenProvider);
}
