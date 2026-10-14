import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrentPayoutVisitDate } from "@/lib/payout/payoutProcessingCutoff";
/** Before side effects; the database repeats the boundary transactionally. */
export async function assertCurrentPayoutBookingMutation(admin: SupabaseClient, bookingId: string): Promise<{ok:true}|{ok:false;error:string}> {
 const {data,error}=await admin.from("bookings").select("date").eq("id",bookingId).maybeSingle();
 if(error) return {ok:false,error:error.message};
 if(!data || !isCurrentPayoutVisitDate(String(data.date??"").trim())) return {ok:false,error:"historical_payout_item_deferred"};
 return {ok:true};
}
