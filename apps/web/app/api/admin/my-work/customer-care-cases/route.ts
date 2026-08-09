import { NextResponse } from "next/server";
import { GET as getMyPermissions } from "@/app/api/admin/security/my-permissions/route";
import { canReceiveOfficeWorkItem, sortOfficeWorkItems } from "@/lib/admin/officeWorkItems";
import { customerCareCaseWorkItems } from "@/lib/customer-care/customerCareWorkItems";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PermissionPayload = { permissions?: string[] };

async function payload(response: Response): Promise<PermissionPayload | null> {
  if (!response.ok) return null;
  try { return (await response.json()) as PermissionPayload; } catch { return null; }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/admin/security/my-permissions";
  url.search = "";
  const permissionResponse = await getMyPermissions(new Request(url, { method: "GET", headers: request.headers, cache: "no-store" }));
  if (!permissionResponse.ok) return permissionResponse;
  const permissionPayload = await payload(permissionResponse);
  if (!permissionPayload) return NextResponse.json({ error: "Unable to resolve Office permissions." }, { status: 503 });

  const permissions = new Set(permissionPayload.permissions ?? []);
  if (!permissions.has("customer.contact")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const items = sortOfficeWorkItems((await customerCareCaseWorkItems()).filter((item) => canReceiveOfficeWorkItem(item, permissions)));
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), items, total: items.length }, { headers: { "Cache-Control": "private, no-store" } });
}
