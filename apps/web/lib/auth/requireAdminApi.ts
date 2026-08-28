import "server-only";

import { requireAnyAdminPermissionFromRequest, type AdminPermission } from "@/lib/admin/requirePermission";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

/**
 * Shared Office API gate backed by granular deny-by-default RBAC.
 *
 * Callers may supply an explicit permission set for sensitive sub-actions that
 * need stricter authority than the route family's compatibility mapping.
 */
export async function requireAdminApi(
  request: Request,
  permissions?: readonly AdminPermission[],
): Promise<{ ok: true; userId: string; email: string } | { ok: false; status: number; error: string }> {
  const auth = await requireAnyAdminPermissionFromRequest(
    request,
    permissions ?? priorityPermissionsForRequest(request),
  );
  if (!auth.ok) {
    const body = (await auth.response.clone().json().catch(() => null)) as { error?: string } | null;
    return { ok: false, status: auth.response.status, error: body?.error ?? "Forbidden." };
  }
  return { ok: true, userId: auth.user.id, email: auth.email };
}
