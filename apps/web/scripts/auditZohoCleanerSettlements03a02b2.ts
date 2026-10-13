/**
 * AUDIT-03A-02B.2 — READ ONLY evidence discovery (NOT proof of non-payment).
 *
 * Run from apps/web with the *existing production* Zoho + Supabase credentials:
 *   npx tsx scripts/auditZohoCleanerSettlements03a02b2.ts
 *
 * No API routes, database writes, Zoho writes or stored exports.
 * This script deliberately reports only anonymized per-cleaner candidate counts.
 * Do not run until operator confirms production URL/environment and read scopes.
 */
import { createClient } from "@supabase/supabase-js";
import { zohoBooksClient } from "../lib/zoho/zohoBooksClient";
import {
  candidateCleanerMatches, withinWindow, zarCents, uniqueEvidence, potentiallySettled,
  type ZohoEvidence,
} from "./zohoCleanerEvidenceMatching";

const EXPECTED_REF = "paqjwfulwywtsyyvdxrq";
const ids = [
  "ecb13764-01f7-490a-bd06-aacaf992c5f5",
  "9c87c65f-e847-4157-b0dd-ea4f14edb6e9",
  "7cd9b6b8-22ee-497c-9b4c-357d40aee71c",
  "2933f61b-3380-4149-95ab-8f05875f90b6",
  "5eb7d0b4-b8bf-4c2e-a975-7aea7fd4515f",
  "24dff648-ea7b-470e-8d22-69966b193c8e",
  "47924352-5bf0-40f9-bd6f-4ee04c2464a7",
  "629da654-ad55-4b1c-83e4-33c57a103211",
  "62b33aa3-8a97-48fe-8781-35be046e5b09",
  "e2fb83a5-fcd3-4183-8f2b-7473b32b0389",
  "76b1eee2-bd8b-42e9-b9e1-17e3f9a19cb0",
] as const;

type Page = { expenses?: ZohoEvidence[]; banktransactions?: ZohoEvidence[];
  page_context?: {has_more_page?: boolean} };

async function pages(endpoint: "expenses" | "banktransactions") {
  const all: ZohoEvidence[] = [];
  for (let page = 1; page <= 20; page++) {
    const path = `/${endpoint}?date_start=2026-06-01&date_end=2026-07-31&per_page=200&page=${page}`;
    const result = await zohoBooksClient.get<Page>(path);
    const rows = result[endpoint];
    if (!Array.isArray(rows)) throw new Error(`Zoho response missing ${endpoint} array`);
    all.push(...rows.map((r) => ({...r, source: endpoint})));
    if (!result.page_context || typeof result.page_context.has_more_page !== "boolean") {
      throw new Error(`Zoho ${endpoint} pagination shape unknown; fail closed`);
    }
    if (!result.page_context.has_more_page) return all;
  }
  throw new Error(`Zoho ${endpoint} exceeded 20 pages; incomplete audit refused`);
}

async function main() {
  if (process.env.AUDIT_03A02B2_READ_ONLY !== "YES") {
    throw new Error("Explicit AUDIT_03A02B2_READ_ONLY=YES required");
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (new URL(url).hostname !== `${EXPECTED_REF}.supabase.co` || !key) {
    throw new Error("Production Supabase project ref mismatch / no service role key");
  }
  if (!process.env.ZOHO_ORGANIZATION_ID) throw new Error("Missing Zoho organization ID");
  const db = createClient(url,key,{auth:{persistSession:false}});
  const {data:bookings,error} = await db.from("bookings").select(
    "id,cleaner_id,cleaner_earnings_total_cents,completed_at"
  ).in("id",[...ids]);
  if (error || bookings?.length !== 11) throw new Error("Allowlist DB query incomplete");
  const cleanerIds = [...new Set(bookings.map(b => b.cleaner_id).filter(Boolean))];
  if (cleanerIds.length !== 6) throw new Error("Expected six cleaner IDs");
  const {data:cleaners,error:cleanerError} = await db.from("cleaners")
    .select("id,full_name").in("id",cleanerIds);
  if (cleanerError || cleaners?.length !== 6) throw new Error("Cleaner name lookup incomplete");
  const names = cleaners.map(c=>({id:c.id,name:c.full_name ?? ""}));
  if (names.some(c=>!c.name.trim())) throw new Error("Missing cleaner identity");
  // Make both Zoho GET calls before printing any results. Errors fail closed.
  const expenses = await pages("expenses");
  const bank = await pages("banktransactions");
  const { rows: all, unknownIdentity } = uniqueEvidence([...expenses,...bank].filter(x=>withinWindow(x.date)));
  console.log(JSON.stringify({
    audit:"AUDIT-03A-02B.2",read_only:true,
    window:"2026-06-01..2026-07-31",bookings:11,cleaners:6,
    zoho_expense_rows:expenses.length,zoho_bank_rows:bank.length,
    identity_missing_records:unknownIdentity,
    all_unmatched_records:all.filter(e=>candidateCleanerMatches(e,names).length===0).length,
    all_ambiguous_records:all.filter(e=>candidateCleanerMatches(e,names).length>1).length,
    results:names.map((c,index)=>{
      const matches = all.filter(e=>candidateCleanerMatches(e,[c]).length>0);
      return {
        cleaner_alias:`cleaner_${index+1}`, bookings:bookings.filter(b=>b.cleaner_id===c.id).length,
        expected_earnings_cents:bookings.filter(b=>b.cleaner_id===c.id)
          .reduce((sum,b)=>sum+Number(b.cleaner_earnings_total_cents??0),0),
        possible_zoho_matches:matches.length,
        comparable_zar_matches:matches.filter(e=>zarCents(e)!==null).length,
        possible_cleared_bank_records:matches.filter(e=>potentiallySettled(e)).length,
        expense_only_records:matches.filter(e=>e.source==="expenses").length,
        // These are candidate counts, NOT paid/unpaid classifications.
        classification:"UNPROVEN_EXTERNAL_SETTLEMENT"
      };
    }),
    caveat:"Zoho candidate matching cannot prove an EFT was made or absent. Independently verify bank settlement before repair."
  },null,2));
}

main().catch(error=>{console.error("Audit blocked:",error instanceof Error?error.message:String(error));process.exitCode=1;});
