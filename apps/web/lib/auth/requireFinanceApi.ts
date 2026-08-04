import "server-only";

import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";

/**
 * Central finance API authorization gate.
 *
 * All existing finance routes using this helper now resolve the granular
 * `finance.full.view` permission through the deny-by-default RBAC service.
 * Legacy email allow-lists and `user_profiles.finance_access` no longer grant
 * access to protected finance APIs.
 */
export async function requireFinanceApi(
  request: Request,
): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireAdminPermissionFromRequest(request, "finance.full.view");
  if (!auth.ok) {
    const body = (await auth.response.clone().json().catch(() => null)) as { error?: string } | null;
    return {
      ok: false,
      status: auth.response.status,
      error: body?.error ?? "Finance access required.",
    };
  }

  return { ok: true, userId: auth.user.id, email: auth.email };
}
