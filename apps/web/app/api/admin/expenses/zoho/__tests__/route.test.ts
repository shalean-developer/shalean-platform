import { beforeEach,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({finance:vi.fn(),manage:vi.fn(),admin:vi.fn(),sync:vi.fn(),org:vi.fn()}));
vi.mock('@/lib/auth/requireFinanceApi',()=>({requireFinanceApi:mock.finance}));
vi.mock('@/lib/admin/requirePermission',()=>({requireAdminPermissionFromRequest:mock.manage}));
vi.mock('@/lib/supabase/admin',()=>({getSupabaseAdmin:mock.admin}));
vi.mock('@/lib/zoho/syncExpenseMirror',()=>({expenseMirrorOrganization:mock.org,syncExpenseMirror:mock.sync}));
import {GET,POST} from '../route';
beforeEach(()=>vi.resetAllMocks());
it('denies unauthenticated reads before accessing the cache',async()=>{
 mock.finance.mockResolvedValue({ok:false,status:401,error:'Sign in'});
 expect((await GET(new Request('https://example.com/api/admin/expenses/zoho'))).status).toBe(401);
 expect(mock.admin).not.toHaveBeenCalled();expect(mock.org).not.toHaveBeenCalled();
});
it('denies imports without expense.manage before contacting Zoho or changing the cache',async()=>{
 mock.manage.mockResolvedValue({ok:false,response:new Response(null,{status:403})});
 expect((await POST(new Request('https://example.com',{method:'POST'}))).status).toBe(403);
 expect(mock.manage.mock.calls[0][1]).toBe('expense.manage');
 expect(mock.admin).not.toHaveBeenCalled();expect(mock.sync).not.toHaveBeenCalled();
});
it('rejects impossible date ranges before querying the mirror',async()=>{
 mock.finance.mockResolvedValue({ok:true});mock.admin.mockReturnValue({});
 expect((await GET(new Request('https://example.com?from=2026-02-30&to=2026-03-01'))).status).toBe(400);
 expect(mock.org).not.toHaveBeenCalled();
});
