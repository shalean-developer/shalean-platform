import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { invalidateTemplateCache } from "@/lib/templates/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("templates")
    .select("id, key, channel, subject, content, variables, is_active, created_at, updated_at")
    .order("key", { ascending: true })
    .order("channel", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

type PatchBody = {
  id?: string;
  subject?: string | null;
  content?: string;
  variables?: unknown;
  is_active?: boolean;
};

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing template id." }, { status: 400 });

  const hasField =
    body.subject !== undefined ||
    typeof body.content === "string" ||
    body.variables !== undefined ||
    typeof body.is_active === "boolean";
  if (!hasField) return NextResponse.json({ error: "No fields to update." }, { status: 400 });

  if (body.variables !== undefined) {
    if (!Array.isArray(body.variables) || body.variables.some((v) => typeof v !== "string")) {
      return NextResponse.json({ error: "variables must be a JSON array of strings." }, { status: 400 });
    }
    for (const v of body.variables) {
      if (!/^[a-zA-Z0-9_]+$/.test(v)) {
        return NextResponse.json({ error: `Invalid variable name: ${v}` }, { status: 400 });
      }
    }
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.subject !== undefined) patch.subject = body.subject;
  if (typeof body.content === "string") patch.content = body.content;
  if (body.variables !== undefined) patch.variables = body.variables;
  if (typeof body.is_active === "boolean") patch.is_active = body.is_active;

  const { data, error } = await admin.from("templates").update(patch).eq("id", id).select().maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  invalidateTemplateCache();
  return NextResponse.json({ template: data });
}
