import { NextResponse } from 'next/server';
import { requireAdminPermissionFromRequest } from '@/lib/admin/requirePermission';
import { loadCashProviderEvidence } from '@/lib/payments/loadCashProviderEvidence';
import { validCashPeriod } from '@/lib/payments/cashProviderEvidence';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const auth=await requireAdminPermissionFromRequest(request,'payout.view');
  if(!auth.ok) return auth.response;
  const url=new URL(request.url); const from=url.searchParams.get('from')??''; const to=url.searchParams.get('to')??'';
  if(!validCashPeriod(from,to)) return NextResponse.json({error:'Choose a valid date range of up to 367 days.'},{status:400});
  return NextResponse.json(await loadCashProviderEvidence(from,to),{headers:{'Cache-Control':'private, no-store'}});
}
