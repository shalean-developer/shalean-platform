const FLOOR='2026-10-01';
export function seedFinanceCalendar(now=new Date()) {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const get=type=>parts.find(part=>part.type===type).value;
 const currentMonthStart=`${get('year')}-${get('month')}-01`;
 return {currentMonthStart,closedPeriod:currentMonthStart>'2026-10-01'?{period_start:'2026-10-01',period_end:'2026-10-31'}:null};
}
// Fixed fixture IDs keep their October visit dates across every reseed.
export function paidSeedBookingDate(day) {
 return '2026-10-'+String(day).padStart(2,'0');
}
export function closedSeedMonthTimestamp(date) {
 const [year,month]=date.split('-').map(Number);
 // First instant of the next month in Johannesburg (UTC+02:00).
 return new Date(Date.UTC(year,month,1)-2*3600000).toISOString();
}
export function buildFinanceSeedPlan({earnings,payouts,bookingDates,now=new Date()}) {
 const {currentMonthStart,closedPeriod}=seedFinanceCalendar(now);
 const safeEarnings=earnings.map(row=>{
  const date=bookingDates.get(row.booking_id);
  if(typeof date!=='string'||date<FLOOR||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new Error(`Finance seed booking ${row.booking_id} has no forward date`);
  if(['paid','approved','processing'].includes(row.status)&&date>=currentMonthStart){
   return {...row,status:'pending',approved_at:null,paid_at:null,disbursement_id:null};
  }
  return { ...row, ...(row.approved_at ? {approved_at:closedSeedMonthTimestamp(date)} : {}), ...(row.paid_at ? {paid_at:closedSeedMonthTimestamp(date)} : {}) };
 });
 return {earnings:safeEarnings,payouts:closedPeriod?payouts.map(row=>{
  // Runs are created through the normal application workflow, never pre-approved empty.
  const {payout_run_id,...unlinked}=row;
  return {...unlinked,...closedPeriod, ...(row.frozen_at ? {frozen_at:closedSeedMonthTimestamp(closedPeriod.period_start)} : {}), ...(row.approved_at ? {approved_at:closedSeedMonthTimestamp(closedPeriod.period_start)} : {}), ...(row.paid_at ? {paid_at:closedSeedMonthTimestamp(closedPeriod.period_start)} : {})};
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
