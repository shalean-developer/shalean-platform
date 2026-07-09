import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_EXPENSE_CATEGORY_MAPPINGS,
  isZohoConfigured,
  loadZohoIntegrationSettings,
  type ExpenseCategoryMapping,
} from "@/lib/accounting/zohoIntegrationSettings";
import { processAccountingSyncQueue } from "@/lib/accounting/processAccountingSyncQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const settings = await loadZohoIntegrationSettings(admin);

  const [{ data: vendors }, { data: categories }, { data: failedSyncs }, { count: pendingCount }] =
    await Promise.all([
      admin.from("expense_vendors").select("id, name").order("name"),
      admin.from("expense_categories").select("id, name, group_name").order("group_name").order("name"),
      admin
        .from("accounting_sync_records")
        .select("id, entity_type, entity_id, sync_status, sync_errors, retry_count, updated_at")
        .eq("sync_status", "failed")
        .order("updated_at", { ascending: false })
        .limit(20),
      admin
        .from("accounting_sync_records")
        .select("id", { count: "exact", head: true })
        .eq("sync_status", "pending"),
    ]);

  return NextResponse.json({
    zoho_configured: isZohoConfigured(),
    organization_id: process.env.ZOHO_ORGANIZATION_ID ? "••••" + process.env.ZOHO_ORGANIZATION_ID.slice(-4) : null,
    oauth_configured: Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_REFRESH_TOKEN),
    settings: {
      expense_category_mappings: settings.expense_category_mappings,
      default_paystack_vendor_id: settings.default_paystack_vendor_id,
      default_paystack_category_id: settings.default_paystack_category_id,
      sync_frequency_minutes: settings.sync_frequency_minutes,
      max_retry_attempts: settings.max_retry_attempts,
      retry_base_delay_seconds: settings.retry_base_delay_seconds,
      auto_sync_enabled: settings.auto_sync_enabled,
      last_sync_at: settings.last_sync_at,
    },
    default_category_mappings: DEFAULT_EXPENSE_CATEGORY_MAPPINGS,
    vendors: vendors ?? [],
    categories: categories ?? [],
    sync_queue: {
      pending_count: pendingCount ?? 0,
      failed_records: failedSyncs ?? [],
    },
  });
}

export async function PATCH(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (Array.isArray(body.expense_category_mappings)) {
    patch.expense_category_mappings = (body.expense_category_mappings as ExpenseCategoryMapping[]).map((m) => ({
      platform_category: String(m.platform_category ?? "").trim(),
      zoho_account_name: String(m.zoho_account_name ?? "").trim(),
    }));
  }
  if (body.default_paystack_vendor_id !== undefined) {
    patch.default_paystack_vendor_id = body.default_paystack_vendor_id || null;
  }
  if (body.default_paystack_category_id !== undefined) {
    patch.default_paystack_category_id = body.default_paystack_category_id || null;
  }
  if (typeof body.sync_frequency_minutes === "number") {
    patch.sync_frequency_minutes = Math.min(1440, Math.max(5, body.sync_frequency_minutes));
  }
  if (typeof body.max_retry_attempts === "number") {
    patch.max_retry_attempts = Math.min(20, Math.max(1, body.max_retry_attempts));
  }
  if (typeof body.retry_base_delay_seconds === "number") {
    patch.retry_base_delay_seconds = Math.min(3600, Math.max(10, body.retry_base_delay_seconds));
  }
  if (typeof body.auto_sync_enabled === "boolean") {
    patch.auto_sync_enabled = body.auto_sync_enabled;
  }

  const { error } = await admin
    .from("zoho_integration_settings")
    .update(patch)
    .eq("singleton_key", "default");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await processAccountingSyncQueue(admin, 50);
  return NextResponse.json({ ok: true, ...result });
}
