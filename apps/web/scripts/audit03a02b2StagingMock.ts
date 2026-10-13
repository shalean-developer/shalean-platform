/**
 * AUDIT-03A-02B.2 isolated staging-mode smoke harness.
 * Zero imports of Zoho Books/Supabase clients; no network, secrets or writes.
 * Requires SHALEAN_APP_ENV=staging and the named staging branch ref.
 */
import {
  listZohoEvidencePages, candidateCleanerMatches, uniqueEvidence, zarCents,
} from "./zohoCleanerEvidenceMatching";

const STAGING_REF = "uwvnmluiqbczeduzjgse";
if (process.env.SHALEAN_APP_ENV !== "staging" ||
    process.env.AUDIT_STAGING_SUPABASE_REF !== STAGING_REF) {
  throw new Error("Mock smoke requires exact staging environment/ref");
}

let calls = 0;
const mockGet = async (path: string): Promise<Record<string,unknown>> => {
  calls++;
  if (path.startsWith("/expenses?")) return {
    expenses:[{expense_id:"synthetic-expense-1",date:"2026-06-20",description:"Jane Doe wages",total:250,currency_code:"ZAR"}],
    page_context:[{page:1,has_more_page:false,per_page:200}],
  };
  if (path.startsWith("/banktransactions?")) return {
    banktransactions:[{transaction_id:"synthetic-bank-1",date:"2026-06-21",payee:"DOE JANE",amount:250,currency_code:"ZAR",status:"categorized"}],
  };
  throw new Error("Unexpected mock-only endpoint");
};

async function mustReject(label: string, get: (path:string)=>Promise<Record<string,unknown>>) {
  try {
    await listZohoEvidencePages("expenses",get);
  } catch {
    return;
  }
  throw new Error("Fail-closed check accepted invalid response: " + label);
}

async function main() {
  const expenses = await listZohoEvidencePages("expenses",mockGet);
  const bank = await listZohoEvidencePages("banktransactions",mockGet);
  const combined = uniqueEvidence([...expenses,...bank]);
  if (combined.rows.length !== 2 || combined.unknownIdentity !== 0) throw new Error("Synthetic record reconciliation failed");
  const matches = combined.rows.map(r=>candidateCleanerMatches(r,[{id:"synthetic-cleaner",name:"Jane Mary Doe"}]));
  if (matches.some(m=>m.length!==1)) throw new Error("Synthetic name matching failed");
  if (combined.rows.some(r=>zarCents(r)!==25000)) throw new Error("Synthetic ZAR amount failed");
  await mustReject("missing array",async()=>({page_context:{has_more_page:false}}));
  await mustReject("replayed page",async()=>({
    expenses:Array.from({length:200},(_,i)=>({expense_id:String(i)})),page_context:{has_more_page:true},
  }));
  await mustReject("page mismatch",async()=>({
    expenses:[{expense_id:"synthetic"}],page_context:{page:9,has_more_page:false}
  }));
  if (calls !== 2) throw new Error("Mock GET count changed");
  console.log(JSON.stringify({
    audit:"AUDIT-03A-02B.2",mode:"staging-mock",project_ref:STAGING_REF,
    mock_get_calls:calls, synthetic_evidence_rows:combined.rows.length,
    positive_matching:"PASS",missing_array:"PASS",replayed_pages:"PASS",page_mismatch:"PASS",
    writes:0,network_calls:0, live_credentials_required:false,
  }));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
