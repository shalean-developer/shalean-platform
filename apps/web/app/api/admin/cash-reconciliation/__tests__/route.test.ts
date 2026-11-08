import { afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/admin/requirePermission',()=>({requireAdminPermissionFromRequest:mocks.auth}));
vi.mock('@/lib/zoho/loadCashReconciliation',()=>({loadCashReconciliation:mocks.load}));
import { GET } from '../route';
afterEach(()=>vi.resetAllMocks());
it.each([401,403])('denies %i before accessing financial sources',async status=>{
  mocks.auth.mockResolvedValue({ok:false,response:new Response('denied',{status})});
  const response=await GET(new Request('https://example.com/api/admin/cash-reconciliation'));
  expect(response.status).toBe(status);expect(mocks.load).not.toHaveBeenCalled();
});
it('requires payout.view and prevents shared caching of financial data',async()=>{
  mocks.auth.mockResolvedValue({ok:true});mocks.load.mockResolvedValue({synthetic:true,accounts:[]});
  const req=new Request('https://example.com/api/admin/cash-reconciliation?scenario=stale');
  const response=await GET(req);expect(mocks.auth).toHaveBeenCalledWith(req,'payout.view');
  expect(mocks.load).toHaveBeenCalledWith('stale');expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
