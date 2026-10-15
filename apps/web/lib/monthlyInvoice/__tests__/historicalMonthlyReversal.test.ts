import {beforeEach,describe,expect,it,vi} from 'vitest';
const provider=vi.hoisted(()=>vi.fn().mockResolvedValue({ok:true,refundReference:'verified-refund'}));
vi.mock('@/lib/paystack/refundPaystackTransaction',()=>({refundPaystackTransaction:provider}));
vi.mock('@/lib/booking/refund/recordGatewayRefund',()=>({recordGatewayRefund:vi.fn().mockResolvedValue({ok:true})}));
vi.mock('@/lib/accounting/recordUnifiedRefundAccounting',()=>({recordUnifiedRefundAccounting:vi.fn().mockResolvedValue({ok:true})}));
vi.mock('@/lib/monthlyInvoice/invoiceSnapshotEvents',()=>({appendMonthlyInvoiceSnapshotEvent:vi.fn().mockResolvedValue({ok:true})}));
vi.mock('@/lib/monthlyInvoice/refreshDraftMonthlyInvoiceDueDate',()=>({refreshDraftMonthlyInvoiceDueDate:vi.fn().mockResolvedValue(undefined)}));
vi.mock('@/lib/logging/systemLog',()=>({logSystemEvent:vi.fn()}));
vi.mock('@/lib/notifications/sendRefundConfirmationEmail',()=>({sendRefundConfirmationEmail:vi.fn().mockResolvedValue(undefined)}));
import {refundMonthlyInvoicePayment} from '@/lib/monthlyInvoice/refundMonthlyInvoicePayment';
import {revertManualPaidMonthlyInvoiceToDraft} from '@/lib/monthlyInvoice/revertManualPaidMonthlyInvoiceToDraft';
function database(options:{manual?:boolean;date?:string|null;readError?:boolean;writeError?:boolean;chargeAmount?:number}={}){
 const invoice={id:'invoice',customer_id:'customer',month:'2026-09',status:'paid',is_closed:true,total_amount_cents:1000,amount_paid_cents:1000,balance_cents:0,paystack_reference:'charge',snapshot_at_finalize:{bookings:[{id:'child',amount_paid_cents:0}]}};
 const child={id:'child',date:options.date===undefined?'2026-09-30':options.date,status:'completed',payment_status:'success',amount_paid_cents:1000,payout_status:'eligible',payout_frozen_cents:77,payout_id:null,payout_run_id:null,payout_paid_at:null,payment_completed_at:'2026-09-30T12:00:00Z'};
 const bookingWrites=vi.fn();const invoiceWrites:Record<string,unknown>[]=[];
 const admin={from:(table:string)=>{
  let patch:Record<string,unknown>|null=null;let inserted=false;let kind='';
  const result=()=>{
   if(inserted) return {data:[],error:null};
   if(table==='monthly_invoices'){
    if(patch){invoiceWrites.push(patch);if(!options.manual && child.date!=='2026-10-02'){child.payment_status='pending_monthly';child.amount_paid_cents=0;child.payout_status='pending';}return {data:[{id:'invoice'}],error:null};}
    return {data:invoice,error:null};
   }
   if(table==='bookings'){
    if(patch){bookingWrites(patch);return {data:[{id:'child'}],error:options.writeError?{message:'child write failed'}:null};}
    return {data:[child],error:options.readError?{message:'child read failed'}:null};
   }
   if(table==='monthly_invoice_paystack_charge_dedup') return {data:options.manual?[]:[{charge_reference:'charge',amount_cents:options.chargeAmount??1000}],count:options.manual?0:1,error:null};
   if(table==='payment_transactions') return {data:[],count:0,error:null};
   if(table==='monthly_invoice_events') return {data:kind==='admin_mark_paid'?[{id:'manual',payload:{amount_paid_cents_after:1000,amount_recorded_cents:1000}}]:[],count:0,error:null};
   throw new Error(table);
  };
  const q:any={select:()=>q,eq:(key:string,value:string)=>{if(key==='kind')kind=value;return q;},neq:()=>q,is:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>result(),update:(p:Record<string,unknown>)=>{patch=p;return q;},insert:()=>{inserted=true;return q;},then:(resolve:any,reject:any)=>Promise.resolve(result()).then(resolve,reject)};return q;
 }};
 return {admin,bookingWrites,invoiceWrites};
}
describe('historical monthly invoice reversals',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it.each(['2026-09-30',null,'bad-date'])('retains frozen historical fields after invoice refund: %s',async(date)=>{
  const db=database({date});expect(await refundMonthlyInvoicePayment(db.admin as never,{invoiceId:'invoice'})).toMatchObject({ok:true});
  expect(db.bookingWrites).not.toHaveBeenCalled();expect(db.invoiceWrites[0]).not.toHaveProperty('balance_cents');
 });
 it('surfaces child read errors after the refund ledger is retained',async()=>{
  const db=database({readError:true});expect(await refundMonthlyInvoicePayment(db.admin as never,{invoiceId:'invoice'})).toEqual({ok:false,error:'child read failed'});
 });
 it('surfaces current child write errors instead of claiming refund convergence',async()=>{
  const db=database({date:'2026-10-02',writeError:true});expect(await refundMonthlyInvoicePayment(db.admin as never,{invoiceId:'invoice'})).toEqual({ok:false,error:'child write failed'});
 });
 it('does not refund an entire statement charge for only one invoice',async()=>{
  const db=database({chargeAmount:2000});expect(await refundMonthlyInvoicePayment(db.admin as never,{invoiceId:'invoice'})).toEqual({ok:false,error:'statement_collection_refund_unsupported'});expect(provider).not.toHaveBeenCalled();
 });
 it('lets the invoice transaction reverse historical cash on guarded manual reopen',async()=>{
  const db=database({manual:true});expect(await revertManualPaidMonthlyInvoiceToDraft(db.admin as never,{invoiceId:'invoice',adminEmail:'admin@example.com',adminUserId:'admin',reason:'Correction'})).toMatchObject({ok:true,restoredBookingIds:['child']});expect(db.bookingWrites).not.toHaveBeenCalled();expect(db.invoiceWrites[0]).toMatchObject({status:'draft',amount_paid_cents:0});
 });
});
