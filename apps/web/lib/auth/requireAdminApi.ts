import "server-only";

import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { priorityOnePermissionForRequest } from "@/lib/admin/requireAdmin";

/**
 * Shared Office API gate backed by granular deny-by-default RBAC.
 */
export async function requireAdminApi(
  request: Request,
): Promise<{ ok: true; userId: string; email: string } | { ok: false; status: number; error: string }> {
  const auth = await requireAdminPermissionFromRequest(
    request,
    priorityOnePermissionForRequest(request),
  );
  if (!auth.ok) {
    const body = (await auth.response.clone().json().catch(() => null)) as { error?: string } | null;
    return { ok: false, status: auth.response.status, error: body?.error ?? "Forbidden." };
  }
  return { ok: true, userId: auth.user.id, email: auth.email };
}
