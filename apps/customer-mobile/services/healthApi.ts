import { getHealthApi } from "@/services/customerApi";
import type { HealthResponse } from "@shalean/api-client";

export type { HealthResponse };

/** Smoke-check against existing `GET /api/health` (apps/web). */
export async function fetchApiHealth(): Promise<
  { ok: true; data: HealthResponse } | { ok: false; error: string; status: number }
> {
  const result = await getHealthApi().get();
  if (!result.ok) {
    return { ok: false, error: result.error, status: result.status };
  }
  return { ok: true, data: result.data };
}
