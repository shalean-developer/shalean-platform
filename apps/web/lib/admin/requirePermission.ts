import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export type AdminPermission =
  | "booking.view"
  | "booking.create"
  | "booking.edit"
  | "booking.assign"
  | "booking.cancel"
  | "booking.export"
  | "customer.view"
  | "customer.edit"
  | "customer.contact"
  | "customer.export"
  | "cleaner.view"
  | "cleaner.edit"
  | "cleaner.documents.view"
  | "cleaner.bank.view"
  | "team.view"
  | "team.assign"
  | "team.manage"
  | "application.decide"
  | "finance.summary.view"
  | "finance.full.view"
  | "expense.manage"
  | "invoice.manage"
  | "payment.reconcile"
  | "profit.view"
  | "payout.view"
  | "payout.prepare"
  | "payout.approve"
  | "payout.release"
  | "refund.request"
  | "refund.approve.low"
  | "refund.approve.high"
  | "marketing.view"
  | "content.draft"
  | "content.publish"
  | "notification.send"
  | "template.manage"
  | "incident.manage"
  | "dispute.resolve"
  | "ops.health.view"
  | "user.manage"
  | "role.manage"
  | "pricing.manage"
  | "integration.manage"
  | "audit.view"
  | "bulk_export.approve"
  | "branch.view"
  | "branch.manage"
  | "system.settings"
  | "system.notifications"
  | "system.integrations"
  | "system.logs";

export type PermissionScope = {
  branchId?: string | null;
  teamId?: string | null;
};

export type PermissionAuthResult =
  | { ok: true; user: User; email: string; permission: AdminPermission }
  | { ok: false; response: NextResponse };

const AUDITED_ACCESS_PERMISSIONS = new Set<AdminPermission>([
  "cleaner.documents.view",
  "cleaner.bank.view",
  "booking.export",
  "customer.export",
  "bulk_export.approve",
]);

function bearerToken(request: Request): string {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function configuredClients() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !serviceRole) return null;
  return {
    publicClient: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }),
    adminClient: createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function recordAuditedPermissionAccess(
  adminClient: ReturnType<typeof createClient>,
  request: Request,
  userId: string,
  permission: AdminPermission,
  scope: PermissionScope,
): Promise<boolean> {
  if (!AUDITED_ACCESS_PERMISSIONS.has(permission)) return true;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const eventType = method === "GET" || method === "HEAD" ? "sensitive_read" : "sensitive_action";
  const { error } = await adminClient.from("admin_audit_events").insert({
    actor_user_id: userId,
    event_type: eventType,
    target_type: "admin_route",
    target_id: url.pathname,
    permission_code: permission,
    reason: "Permission-gated sensitive access",
    old_value: null,
    new_value: null,
    metadata: {
      method,
      branch_id: scope.branchId ?? null,
      team_id: scope.teamId ?? null,
    },
  });
  if (error) {
    console.error("Sensitive admin access audit failed", {
      permission,
      userId,
      path: url.pathname,
      code: error.code,
    });
    return false;
  }
  return true;
}

export async function requireAdminPermissionFromRequest(
  request: Request,
  permission: AdminPermission,
  scope: PermissionScope = {},
): Promise<PermissionAuthResult> {
  return requireAnyAdminPermissionFromRequest(request, [permission], scope);
}

/** Authorize when at least one listed permission resolves in the requested scope. */
export async function requireAnyAdminPermissionFromRequest(
  request: Request,
  permissions: readonly AdminPermission[],
  scope: PermissionScope = {},
): Promise<PermissionAuthResult> {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Missing authorization." }, { status: 401 }) };
  }
  if (permissions.length === 0) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }

  const clients = configuredClients();
  if (!clients) {
    return { ok: false, response: NextResponse.json({ error: "Server configuration error." }, { status: 503 }) };
  }

  const {
    data: { user },
    error: userError,
  } = await clients.publicClient.auth.getUser(token);
  if (userError || !user?.id || !user.email) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired session." }, { status: 401 }) };
  }

  for (const permission of permissions) {
    const { data: allowed, error: permissionError } = await clients.adminClient.rpc("admin_has_permission", {
      p_user_id: user.id,
      p_permission: permission,
      p_branch_id: scope.branchId ?? null,
      p_team_id: scope.teamId ?? null,
    });

    if (permissionError) {
      console.error("RBAC permission evaluation failed", {
        permission,
        userId: user.id,
        code: permissionError.code,
      });
      return { ok: false, response: NextResponse.json({ error: "Authorization unavailable." }, { status: 503 }) };
    }
    if (allowed === true) {
      const auditRecorded = await recordAuditedPermissionAccess(
        clients.adminClient,
        request,
        user.id,
        permission,
        scope,
      );
      if (!auditRecorded) {
        return {
          ok: false,
          response: NextResponse.json(
            { error: "Sensitive access audit unavailable. Access was not granted." },
            { status: 503 },
          ),
        };
      }
      return { ok: true, user, email: user.email, permission };
    }
  }

  return {
    ok: false,
    response: NextResponse.json(
      { error: "Forbidden.", requiredAnyPermission: permissions },
      { status: 403 },
    ),
  };
}

export async function adminUserHasPermission(
  userId: string,
  permission: AdminPermission,
  scope: PermissionScope = {},
): Promise<boolean> {
  const clients = configuredClients();
  if (!clients) return false;
  const { data, error } = await clients.adminClient.rpc("admin_has_permission", {
    p_user_id: userId,
    p_permission: permission,
    p_branch_id: scope.branchId ?? null,
    p_team_id: scope.teamId ?? null,
  });
  return !error && data === true;
}
