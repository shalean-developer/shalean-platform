import { describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingCanonicalPayout } from "@/lib/payout/resolveBookingCanonicalPayout";
const lead="796e3ad7-07f3-44eb-b4cf-bed439a59f8b", member="cd36e0a6-10f9-452c-99fd-cc7318c76901";
function db({paired=false,error=false,basis=28000}:{paired?:boolean;error?:boolean;basis?:number}={}) {
 const queried:string[]=[];
 const admin={from:(table:string)=>{
   queried.push(table);
   const answer=()=>({data:table==="bookings"?{earnings_policy:"legacy_july",display_earnings_cents:basis}:table==="cleaners"?{joined_at:"2025-01-01"}:table==="booking_cleaners"&&paired?[{cleaner_id:lead,role:"lead"},{cleaner_id:member,role:"member"}]:[],error:table==="bookings"&&error?{message:"unavailable"}:null});
   const q={select:()=>q,eq:()=>q,order:()=>q,maybeSingle:async()=>answer(),then:(done:(x:unknown)=>unknown)=>Promise.resolve(answer()).then(done)};return q;
 }} as unknown as SupabaseClient;
 return {admin,queried};
}
function row(date="2026-10-15"){return {date,time:"09:00",cleaner_id:lead,is_team_job:false,base_amount_cents:66000,total_paid_cents:66000,service:"standard"};}
describe("recurring policy integration",()=>{
 it("uses R280 rather than the recalculated R300 for a current solo visit",async()=>{
  const {admin}=db();const r=await resolveBookingCanonicalPayout(admin,{bookingId:"booking",row:row()});
  expect(r.displayEarningsCents).toBe(28000);expect(r.earningsSummary?.per_cleaner_earnings[0].total_cents).toBe(28000);
 });
 it("uses R260 for both paired participants",async()=>{
  const {admin}=db({paired:true,basis:26000});const r=await resolveBookingCanonicalPayout(admin,{bookingId:"booking",row:row()});
  expect(r.earningsSummary?.per_cleaner_earnings.map(x=>x.total_cents)).toEqual([26000,26000]);expect(r.internalEarningsCents).toBe(52000);
 });
 it.each(["2026-05-15","2026-06-15","2026-07-15","2026-08-15","2026-09-30"])("leaves %s outside the new policy read",async date=>{
  const {admin,queried}=db({error:true});await resolveBookingCanonicalPayout(admin,{bookingId:"booking",row:row(date)});expect(queried).not.toContain("bookings");
 });
 it("fails closed if the policy cannot be read",async()=>{
  const {admin}=db({error:true});await expect(resolveBookingCanonicalPayout(admin,{bookingId:"booking",row:row()})).rejects.toThrow("Could not verify booking earnings policy");
 });
 it("does not turn an intentionally zeroed policy into fresh positive earnings",async()=>{
  const {admin}=db({basis:0});await expect(resolveBookingCanonicalPayout(admin,{bookingId:"booking",row:row()})).rejects.toThrow("locked_recurring_earnings_basis_invalid");
 });
});
