import { forwardSeedBookingDate } from './forwardSeedBookingDate.mjs';
const FLOOR='2026-10-01';
export function seedFinanceCalendar(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(part=>part.type===type).value;
 const currentMonthStart=`${get('year')}-${get('month')}-01`;
 const end=new Date(Date.parse(currentMonthStart+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 const start=end.slice(0,7)+'-01';
 return {currentMonthStart,closedPeriod:start>=FLOOR?{period_start:start,period_end:end}:null};
}
export function paidSeedBookingDate(day, fallbackOffset, now=new Date()) {
 const {closedPeriod}=seedFinanceCalendar(now);
 return closedPeriod?closedPeriod.period_start.slice(0,8)+String(day).padStart(2,'0'):forwardSeedBookingDate(fallbackOffset,now);
}
export function buildFinanceSeedPlan({earnings,payouts,bookingDates,now=new Date()}) {
 const {currentMonthStart,closedPeriod}=seedFinanceCalendar(now);
 const safeEarnings=earnings.map(row=>{
  const date=bookingDates.get(row.booking_id);
  if(typeof date!=='string'||date<FLOOR||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error(`Finance seed booking ${row.booking_id} has no forward date`);
  if(['paid','approved','processing'].includes(row.status)&&date>=currentMonthStart){
   return {...row,status:'pending',approved_at:null,paid_at:null,disbursement_id:null};
  }
  return { ...row, ...(row.approved_at ? {approved_at:date+'T12:00:00Z'} : {}), ...(row.paid_at ? {paid_at:date+'T12:00:00Z'} : {}) };
 });
 return {earnings:safeEarnings,payouts:closedPeriod?payouts.map(row=>{
  // Runs are created through the normal application workflow, never pre-approved empty.
  const {payout_run_id,...unlinked}=row;
  return {...unlinked,...closedPeriod, ...(row.approved_at ? {approved_at:closedPeriod.period_end+'T12:00:00Z'} : {}), ...(row.paid_at ? {paid_at:closedPeriod.period_end+'T12:00:00Z'} : {})};
 }):[],runs:[],deferredReason:closedPeriod?null:'No closed October-or-later month; payout fixtures deferred'};
}
export async function writeFinanceSeedPlan(admin,plan) {
 const counts={earningsCount:0,payoutsCount:0,runsCount:0,deferredReason:plan.deferredReason};
 for(const [table,rows,key] of [['cleaner_earnings',plan.earnings,'earningsCount'],['cleaner_payouts',plan.payouts,'payoutsCount']]){
  if(!rows.length)continue;
  const {data,error}=await admin.from(table).upsert(rows,{onConflict:'id'}).select('id');
  if(error)throw new Error(`Finance seed ${table}: ${error.message}`);
  if(!data||data.length!==rows.length)throw new Error(`Finance seed ${table}: expected ${rows.length} confirmed rows, got ${data?.length??0}`);
  counts[key]=data.length;
 }
 return counts;
}
