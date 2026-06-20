import { NextResponse } from "next/server";
import { invalidateLifecycleEmailSettingsCache } from "@/lib/booking/lifecycleEmailSettings";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as {
    emails_enabled?: boolean;
    dry_run_enabled?: boolean;
    frequency_limit_enabled?: boolean;
  };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: auth.userId ?? null,
  };
  if (typeof body.emails_enabled === "boolean") patch.emails_enabled = body.emails_enabled;
  if (typeof body.dry_run_enabled === "boolean") patch.dry_run_enabled = body.dry_run_enabled;
  if (typeof body.frequency_limit_enabled === "boolean") {
    patch.frequency_limit_enabled = body.frequency_limit_enabled;
  }

  if (Object.keys(patch).length <= 2) {
    return NextResponse.json({ error: "No valid settings provided." }, { status: 400 });
  }

  const { data: existing } = await admin.from("lifecycle_email_settings").select("id").limit(1).maybeSingle();

  let result;
  if (existing?.id) {
    result = await admin
      .from("lifecycle_email_settings")
      .update(patch)
      .eq("id", existing.id)
      .select("emails_enabled, dry_run_enabled, frequency_limit_enabled, updated_at")
      .maybeSingle();
  } else {
    result = await admin
      .from("lifecycle_email_settings")
      .insert({
        emails_enabled: body.emails_enabled ?? true,
        dry_run_enabled: body.dry_run_enabled ?? false,
        frequency_limit_enabled: body.frequency_limit_enabled ?? true,
        updated_by: auth.userId ?? null,
      })
      .select("emails_enabled, dry_run_enabled, frequency_limit_enabled, updated_at")
      .maybeSingle();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  invalidateLifecycleEmailSettingsCache();

  void logSystemEvent({
    level: "info",
    source: "admin/lifecycle-emails",
    message: "lifecycle_email_settings.updated",
    context: {
      emails_enabled: result.data?.emails_enabled,
      dry_run_enabled: result.data?.dry_run_enabled,
      frequency_limit_enabled: result.data?.frequency_limit_enabled,
      updated_by: auth.userId,
    },
  });

  return NextResponse.json({ ok: true, settings: result.data });
}
