import { NextResponse } from "next/server";
import { requireAdminPermissionFromRequest } from "@/lib/admin/requirePermission";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, "expense.manage");
  if (!auth.ok) return auth.response;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => null)) as { account_id?: unknown; balance_cents?: unknown } | null;
  const accountId = String(body?.account_id ?? "").trim();
  const balanceCents = Number(body?.balance_cents);
  if (!accountId || !Number.isFinite(balanceCents) || balanceCents < 0 || !Number.isInteger(balanceCents)) {
    return NextResponse.json({ error: "account_id and a non-negative integer balance_cents are required." }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await admin
    .from("expense_accounts")
    .select("id, name, account_type, balance_cents")
    .eq("id", accountId)
    .eq("is_active", true)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Finance account not found." }, { status: 404 });

  const accountType = String(existing.account_type ?? "").toLowerCase();
  if (accountType !== "bank" && accountType !== "petty_cash") {
    return NextResponse.json({ error: "Only bank and petty-cash balances may be refreshed manually." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await admin
    .from("expense_accounts")
    .update({ balance_cents: balanceCents, updated_at: now })
    .eq("id", accountId)
    .select("id, name, account_type, balance_cents, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  void logSystemEvent({
    level: "info",
    source: "finance_account_balance_refresh",
    message: "Finance account balance refreshed manually",
    context: {
      account_id: accountId,
      account_name: existing.name ?? null,
      account_type: accountType,
      previous_balance_cents: existing.balance_cents ?? 0,
      balance_cents: balanceCents,
      actor_user_id: auth.user.id,
    },
  });

  return NextResponse.json({ ok: true, account: updated });
}
