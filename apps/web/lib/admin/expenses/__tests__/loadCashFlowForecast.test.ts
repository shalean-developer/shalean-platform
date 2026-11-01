import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCashFlowForecast } from "../loadCashFlowForecast";
function database(fail = false) {
  const range = vi.fn(async (a: number) => ({data: a === 0 ? Array.from({length:500},(_,i)=>({id:String(i),status:"sent",currency_code:"ZAR",due_date:"2026-11-01",balance_cents:101})) : [{id:"last",status:"sent",currency_code:"ZAR",due_date:"2026-11-01",balance_cents:202}],error:fail?{message:"Read failed"}:null}));
  const empty = vi.fn(async()=>({data:[],error:null}));
  const admin = {from:(table:string)=>{ const q:Record<string,unknown>={};
    for (const method of ["select","in","eq","not","lte","order"]) q[method]=()=>q;
    q.range=table==="monthly_invoices"?range:empty; return q;
  }} as unknown as SupabaseClient;
  return {admin,range};
}
describe("forecast source loading",()=>{
  it("paginates beyond the first database page",async()=>{
    const {admin,range}=database(); const result=await loadCashFlowForecast(admin,"2026-11-01","2026-11-30");
    expect(result.income_cents).toBe(50702); expect(range.mock.calls.map(x=>x[0])).toEqual([0,500]);
  });
  it("fails visibly on query errors",async()=>{ await expect(loadCashFlowForecast(database(true).admin,"2026-11-01","2026-11-30")).rejects.toThrow("Read failed"); });
});
