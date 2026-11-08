import { NextResponse } from 'next/server';
import { requireAdminPermissionFromRequest } from '@/lib/admin/requirePermission';
import { loadCashReconciliation } from '@/lib/zoho/loadCashReconciliation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, 'payout.view');
  if (!auth.ok) return auth.response;
  const scenario = new URL(request.url).searchParams.get('scenario') ?? 'differences';
  const payload = await loadCashReconciliation(scenario);
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } });
}
