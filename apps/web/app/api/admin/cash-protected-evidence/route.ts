import { NextResponse } from 'next/server';
import { requireAdminPermissionFromRequest } from '@/lib/admin/requirePermission';
import { loadProtectedCashEvidence } from '@/lib/zoho/loadProtectedCashEvidence';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const auth = await requireAdminPermissionFromRequest(request, 'payout.view');
  if (!auth.ok) return auth.response;
  return NextResponse.json(await loadProtectedCashEvidence(), { headers: { 'Cache-Control': 'private, no-store' } });
}
