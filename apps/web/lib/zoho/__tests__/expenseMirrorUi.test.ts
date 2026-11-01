// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ZohoExpenseMirror} from '@/components/admin/expenses/ZohoExpenseMirror';
const mock = vi.hoisted(() => ({ response: {} as Record<string,unknown>, refetch: vi.fn(), adminFetch: vi.fn() }));
vi.mock('@/hooks/useAdminData',() => ({ useAdminData: (_endpoint: string, options: {params:{from:string;to:string}}) => ({
  data:{ ...options.params, organization_id:'123',snapshot:mock.response.snapshot },loading:false,error:null,refetch:mock.refetch,
}),adminFetch:mock.adminFetch }));
let root:Root, container:HTMLDivElement;
beforeEach(() => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); mock.refetch.mockReset(); mock.adminFetch.mockReset();
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 mock.response={snapshot:{last_success_at:'2026-11-01T08:00:00Z',last_attempt_at:'2026-11-01T08:00:00Z',last_error:null,records:[
 {id:'101',date:'2026-10-30',category:'Fuel',description:'Synthetic fuel',reference:'ref-101',vendor:'Vendor',paid_through:'Daily Expenses',currency:'ZAR',amount_cents:45613,operating:true},
 {id:'102',date:'2026-10-29',category:'Internal Transfers Clearing',description:'Synthetic transfer',paid_through:'Savings',currency:'ZAR',amount_cents:50000,operating:false},
 ]}};
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
it('shows cents and complete filter choices, while excluding transfers from operating totals',async()=>{
 await act(async()=>root.render(createElement(ZohoExpenseMirror)));
 expect(container.textContent).toContain('456,13');expect(container.textContent).not.toContain('Synthetic transfer');
 expect(container.querySelector('select[aria-label="Zoho expense category"]')?.textContent).toContain('Internal Transfers Clearing');
 expect(container.querySelector('select[aria-label="Zoho payment account"]')?.textContent).toContain('Savings');
 expect(container.querySelector('a')?.href).toBe('https://books.zoho.com/app/123#/expenses/101');
});
it('shows never-imported state without claiming a zero total',async()=>{
 mock.response={snapshot:null};await act(async()=>root.render(createElement(ZohoExpenseMirror)));
 expect(container.textContent).toContain('has not been imported');expect(container.textContent).toContain('Never');expect(container.textContent).not.toContain('R 0');
});
it('surfaces an actionable sync failure and retains the displayed complete result',async()=>{
 mock.adminFetch.mockResolvedValue({ok:false,error:'Missing expenses.READ permission'});
 await act(async()=>root.render(createElement(ZohoExpenseMirror)));
 const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Sync from Zoho')!;
 await act(async()=>button.click());expect(container.querySelector('[role="alert"]')?.textContent).toContain('expenses.READ');
 expect(container.textContent).toContain('456,13');expect(mock.refetch).toHaveBeenCalledOnce();
 expect(mock.adminFetch.mock.calls[0][1].method).toBe('POST');
});

it('clamps the current page after a snapshot shrinks',async()=>{
 const snapshot=mock.response.snapshot as {records:Record<string,unknown>[]};
 const original=snapshot.records[0];snapshot.records=Array.from({length:26},(_,i)=>({...original,id:String(100+i),description:'Row '+i}));
 await act(async()=>root.render(createElement(ZohoExpenseMirror)));
 await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Next')!.click());
 expect(container.textContent).toContain('Page 2 of 2');
 snapshot.records=[original];await act(async()=>root.render(createElement(ZohoExpenseMirror)));
 expect(container.textContent).toContain('Page 1 of 1');expect(container.textContent).toContain('Synthetic fuel');
});
