import { NextResponse } from "next/server";
import { requireAnyAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findAuthUserByEmail(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return { user: null, error: error.message };
    const user = data.users.find((candidate) => candidate.email?.trim().toLowerCase() === email);
    if (user) return { user, error: null };
    if (data.users.length < 1000) break;
  }
  return { user: null, error: null };
}

async function activeSupervisorRole(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string) {
  const { data: role } = await admin.from("admin_roles").select("id").eq("code", "supervisor").eq("is_active", true).maybeSingle();
  if (!role?.id) return false;
  const now = new Date().toISOString();
  const { data } = await admin
    .from("admin_user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .limit(1);
  return Boolean(data?.length);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["cleaner.edit", "role.manage"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid cleaner id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const { data, error } = await admin.from("cleaner_auth_links").select("auth_user_id,link_type,is_active,created_at").eq("cleaner_id", id).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const users = new Map<string, string>();
  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const user of authUsers?.users ?? []) users.set(user.id, user.email ?? user.id);
  return NextResponse.json({ links: (data ?? []).map((link) => ({ ...link, email: users.get(link.auth_user_id) ?? link.auth_user_id })) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAnyAdminPermissionFromRequest(request, ["cleaner.edit", "role.manage"]);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Invalid cleaner id." }, { status: 400 });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { email?: string; reason?: string } | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  const reason = String(body?.reason ?? "Supervisor and cleaner portal convergence").trim();
  if (!email || !email.includes("@")) return NextResponse.json({ error: "A valid supervisor email is required." }, { status: 400 });

  const [{ data: cleaner }, authLookup] = await Promise.all([
    admin.from("cleaners").select("id,full_name,auth_user_id").eq("id", id).maybeSingle(),
    findAuthUserByEmail(admin, email),
  ]);
  if (!cleaner) return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });
  if (authLookup.error) return NextResponse.json({ error: "Unable to resolve the Auth user." }, { status: 500 });
  if (!authLookup.user) return NextResponse.json({ error: "No Auth user exists for that email." }, { status: 404 });
  if (!(await activeSupervisorRole(admin, authLookup.user.id))) {
    return NextResponse.json({ error: "That Auth user does not have an active Supervisor role." }, { status: 409 });
  }
  const { data: primaryConflict } = await admin.from("cleaners").select("id,full_name").eq("auth_user_id", authLookup.user.id).neq("id", id).maybeSingle();
  if (primaryConflict) return NextResponse.json({ error: `That login already belongs to ${primaryConflict.full_name}.` }, { status: 409 });

  const { error } = await admin.from("cleaner_auth_links").upsert({ cleaner_id: id, auth_user_id: authLookup.user.id, link_type: "supervisor", is_active: true, linked_by: auth.user.id, reason }, { onConflict: "cleaner_id,auth_user_id" });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "That login is linked to another cleaner." : error.message }, { status: error.code === "23505" ? 409 : 500 });
  await Promise.all([
    admin.from("user_profiles").upsert({ id: authLookup.user.id, role: "admin", updated_at: new Date().toISOString() }, { onConflict: "id" }),
    admin.from("admin_audit_events").insert({ actor_user_id: auth.user.id, event_type: "cleaner_auth_linked", target_type: "cleaner", target_id: id, permission_code: auth.permission, reason, old_value: null, new_value: { auth_user_id: authLookup.user.id, email }, metadata: { link_type: "supervisor" } }),
  ]);
  return NextResponse.json({ ok: true, cleanerId: id, authUserId: authLookup.user.id, email });
}

