import { NextResponse } from "next/server";
import { buildOfficeTemplatesSummary } from "@/lib/admin/officeTemplates";
import { requireAdminFromRequest } from "@/lib/admin/requireAdmin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { TemplateRow } from "@/lib/templates/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_SELECT = "id, key, channel, subject, content, variables, is_active, created_at, updated_at";
const USAGE_HISTORY_MS = 30 * 86_400_000;

export async function GET(request: Request) {
  const auth = await requireAdminFromRequest(request);
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const fetchedAt = new Date().toISOString();
  const sinceIso = new Date(Date.parse(fetchedAt) - USAGE_HISTORY_MS).toISOString();

  const [templatesRes, usageRes] = await Promise.all([
    admin.from("templates").select(TEMPLATE_SELECT).order("key", { ascending: true }).order("channel", { ascending: true }),
    admin
      .from("notification_logs")
      .select("template_key, channel, status, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20000),
  ]);

  if (templatesRes.error) return NextResponse.json({ error: templatesRes.error.message }, { status: 500 });
  if (usageRes.error) return NextResponse.json({ error: usageRes.error.message }, { status: 500 });

  const summary = buildOfficeTemplatesSummary({
    fetchedAt,
    templateRows: (templatesRes.data ?? []) as TemplateRow[],
    usageRows: usageRes.data ?? [],
  });

  return NextResponse.json(summary);
}
