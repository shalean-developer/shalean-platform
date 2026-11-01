import { NextResponse } from 'next/server';
import { requireFinanceApi } from '@/lib/auth/requireFinanceApi';
import { requireAdminPermissionFromRequest } from '@/lib/admin/requirePermission';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { expenseMirrorOrganization, syncExpenseMirror } from '@/lib/zoho/syncExpenseMirror';
import { validateExpensePeriod } from '@/lib/zoho/expenseMirror';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export async function GET(request: Request) {
  const auth = await requireFinanceApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  try {
    const url = new URL(request.url), from = url.searchParams.get('from') ?? '', to = url.searchParams.get('to') ?? '';
    validateExpensePeriod(from, to);
    const org = expenseMirrorOrganization();
    const { data, error } = await admin.from('zoho_expense_period_mirror').select('records,last_success_at,last_attempt_at,last_error')
      .match({ organization_id: org, date_from: from, date_to: to }).maybeSingle();
    if (error) return NextResponse.json({ error: 'Expense mirror unavailable. Apply the reviewed migration in this environment.' }, { status: 503 });
    return NextResponse.json({ snapshot: data, organization_id: org, from, to });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Expense mirror unavailable.' }, { status: 400 }); }
}
export async function POST(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, 'expense.manage');
  if (!auth.ok) return auth.response;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Database unavailable.' }, { status: 503 });
  try {
    const body = await request.json();
    const from = String(body.from ?? ''), to = String(body.to ?? '');
    return NextResponse.json({ ok: true, ...await syncExpenseMirror(admin, from, to) });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Expense sync failed.' }, { status: 409 }); }
}
