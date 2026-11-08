import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),load:vi.fn()}));
vi.mock('@/lib/admin/requirePermission',()=>({requireAdminPermissionFromRequest:mocks.auth}));
vi.mock('@/lib/payments/loadCashProviderEvidence',()=>({loadCashProviderEvidence:mocks.load}));
import {GET} from '../route';
afterEach(()=>vi.resetAllMocks());
it.each([401,403])('denies %s before reading providers',async status=>{mocks.auth.mockResolvedValue({ok:false,response:new Response('denied',{status})});expect((await GET(new Request('https://example.com/api/admin/cash-provider-evidence'))).status).toBe(status);expect(mocks.load).not.toHaveBeenCalled();});
it('validates dates before provider reads and disables shared caching',async()=>{
  mocks.auth.mockResolvedValue({ok:true});mocks.load.mockResolvedValue({synthetic:true});
  expect((await GET(new Request('https://example.com/api/admin/cash-provider-evidence?from=2026-02-31&to=2026-03-01'))).status).toBe(400);expect(mocks.load).not.toHaveBeenCalled();
  const request=new Request('https://example.com/api/admin/cash-provider-evidence?from=2026-11-01&to=2026-11-30');const response=await GET(request);
  expect(mocks.auth).toHaveBeenCalledWith(request,'payout.view');expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
