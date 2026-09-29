import { NextResponse } from "next/server";
import { retryAccountingSync } from "@/lib/accounting/processAccountingSyncQueue";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { listZohoExpenseAccounts } from "@/lib/zoho/zohoBooksService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { action?: string; record_ids?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body remains the read-only account-list probe.
  }

  if (body.action === "retry_expenses") {
    const recordIds = Array.isArray(body.record_ids)
      ? [...new Set(body.record_ids.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    if (recordIds.length < 1 || recordIds.length > 20 || recordIds.some((id) => !UUID_RE.test(id))) {
      return NextResponse.json({ ok: false, error: "record_ids must contain 1-20 valid UUIDs." }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

    const { data: records, error } = await admin
      .from("accounting_sync_records")
      .select("id, entity_type, sync_status, sync_errors")
      .in("id", recordIds);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const allowed = new Set(
      (records ?? [])
        .filter(
          (r) =>
            r.entity_type === "expense" &&
            r.sync_status === "failed" &&
            String(r.sync_errors ?? "").startsWith("zoho_account_not_found:"),
        )
        .map((r) => r.id),
    );

    if (allowed.size !== recordIds.length) {
      return NextResponse.json(
        { ok: false, error: "One or more records are not eligible failed expense mapping records." },
        { status: 409 },
      );
    }

    const results: Array<{ record_id: string; ok: boolean; error?: string }> = [];
    for (const recordId of recordIds) {
      const result = await retryAccountingSync(admin, recordId);
      results.push({ record_id: recordId, ...result });
    }

    return NextResponse.json({
      ok: results.every((result) => result.ok),
      attempted: results.length,
      succeeded: results.filter((result) => result.ok).length,
      failed: results.filter((result) => !result.ok).length,
      results,
    });
  }

  const result = await listZohoExpenseAccounts();
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });

  return NextResponse.json({
    ok: true,
    accounts: result.accounts.map(({ accountId, accountName }) => ({
      account_id: accountId,
      account_name: accountName,
    })),
  });
}
