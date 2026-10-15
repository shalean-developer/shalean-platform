import type {SupabaseClient} from '@supabase/supabase-js';
import {fetchAllPayoutRows} from '@/lib/payout/payoutQueryPagination';
import {isCurrentPayoutVisitDate,normalizePayoutVisitDate} from '@/lib/payout/payoutProcessingCutoff';
/** Filter legacy text dates after loading, so padded current visits cannot disappear. */
export async function loadCurrentTeamBookings(admin:SupabaseClient,teamId:string):Promise<Array<{id:string;date:string}>> {
 const rows=await fetchAllPayoutRows((from,to)=>admin.from('bookings').select('id, date')
  .eq('team_id',teamId).eq('is_team_job',true).is('cleaner_line_earnings_finalized_at',null)
  .order('id',{ascending:true}).range(from,to));
 return rows.filter(row=>isCurrentPayoutVisitDate(row.date)).map(row=>({id:String(row.id),date:normalizePayoutVisitDate(row.date)!}));
}
