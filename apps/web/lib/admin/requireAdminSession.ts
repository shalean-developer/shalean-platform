import "server-only";

import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { priorityOnePermissionForRequest } from "@/lib/admin/requireAdmin";

export type AdminSessionUser = { id: string; email: string };

/**
 * Legacy-compatible Office session helper backed by the granular RBAC gate.
 */
export async function requireAdminSession(request: Request): Promise<
  { ok: true; user: AdminSessionUser } | { ok: false; response: NextResponse }
> {
  const auth = await requireAdminPermissionFromRequest(
    request,
    priorityOnePermissionForRequest(request),
  );
  if (!auth.ok) return auth;
  return { ok: true, user: { id: auth.user.id, email: auth.email } };
}
