import { NextResponse } from "next/server";
import { loadOwnerCommandCentre } from "@/lib/admin/loadOwnerCommandCentre";
import { canAccessOwnerCommandCentre } from "@/lib/admin/ownerCommandCentre";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { adminUserHasPermission } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner Command Centre aggregate. Gated to Owner (`role.manage` + `system.settings`).
 * Reuses existing finance/ops loaders — does not invent parallel KPI math.
 */
export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "role.manage");
  if (!auth.ok) return auth.response;

  const hasSettings = await adminUserHasPermission(auth.user.id, "system.settings");
  if (!hasSettings) {
    return NextResponse.json(
      { error: "Owner Command Centre is restricted to Owner accounts.", code: "owner_only" },
      { status: 403 },
    );
  }

  // Defense in depth: same inference used by the Office UI.
  const permissions = new Set<string>(["role.manage", "system.settings"]);
  if (!canAccessOwnerCommandCentre(permissions)) {
    return NextResponse.json({ error: "Forbidden.", code: "owner_only" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const payload = await loadOwnerCommandCentre(admin, auth.user.id);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Owner Command Centre.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
