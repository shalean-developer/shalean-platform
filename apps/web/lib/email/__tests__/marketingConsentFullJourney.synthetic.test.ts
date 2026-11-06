import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCustomerMarketingDecision } from "../marketingConsentService";
import { reconcilePendingMarketingEnrollments } from "../reconcilePendingMarketingEnrollments";

// Fully in-memory synthetic customer, provider and PostgREST-style fixtures.
// No credentials, network, production project or real recipients.
type Row=Record<string,unknown>;
const customerId="00000000-0000-4000-8000-000000000777";
const email="synthetic@example.test";
const segmentId="00000000-0000-4000-8000-000000000999";
const old="2026-11-01T00:00:00.000Z";
function fixture(){
  const tables:Record<string,Row[]>={
    user_profiles:[{id:customerId,role:"customer",billing_email:email,
      marketing_emails_unsubscribed_at:null}],
    marketing_email_consent_events:[],
    marketing_email_enrollment_jobs:[],
    marketing_email_reconciliation_jobs:[],
    email_suppressions:[],
  };
  let sequence=0;
  class Query{
    private op:"select"|"update"="select";
    private payload:Row={};
    private predicates:((r:Row)=>boolean)[]=[];
    private orders:{key:string,ascending:boolean}[]=[];
    private max=Infinity;
    constructor(private table:string){}
    select(_cols?:string){if(this.op!=="update")this.op="select";return this;}
    update(p:Row){this.op="update";this.payload=p;return this;}
    eq(key:string,val:unknown){this.predicates.push(r=>r[key]===val);return this;}
    lte(key:string,val:string){this.predicates.push(r=>String(r[key]??"")<=val);return this;}
    order(key:string,opts?:{ascending?:boolean}){
      this.orders.push({key,ascending:opts?.ascending!==false});return this;
    }
    limit(n:number){this.max=n;return this;}
    private matching(){
      const found=tables[this.table]!.filter(r=>this.predicates.every(fn=>fn(r)));
      return found.sort((a,b)=>{
        for(const order of this.orders){
          const cmp=String(a[order.key]??"").localeCompare(String(b[order.key]??""));
          if(cmp)return order.ascending?cmp:-cmp;
        }
        return 0;
      }).slice(0,this.max);
    }
    private execute(){
      const found=this.matching();
      if(this.op==="update")for(const row of found)Object.assign(row,this.payload);
      return {data:this.op==="select"?found.map(x=>({...x})):found.length?{id:found[0]!.id}:null,error:null};
    }
    async maybeSingle(){const out=this.execute();const data=Array.isArray(out.data)?out.data[0]??null:out.data;return {data,error:null};}
    then(resolve:(value:unknown)=>void){resolve(this.execute());}
    async insert(payload:Row){
      const row={...payload,id:`synthetic-${++sequence}`,occurred_at:new Date(Date.now()+sequence*1000).toISOString(),
        created_at:new Date(Date.now()+sequence*1000).toISOString()};
      tables[this.table]!.push(row);return {data:row,error:null};
    }
    async upsert(payload:Row){
      const list=tables[this.table]!;
      let current=list.find(x=>x.customer_id===payload.customer_id&&x.email===payload.email
        &&(payload.action===undefined||x.action===payload.action));
      if(current)Object.assign(current,payload);
      else {
        current={id:`synthetic-job-${++sequence}`,...payload};
        list.push(current);
      }
      return {data:current,error:null};
    }
  }
  const db = {
  from: (table: string) => new Query(table),
  rpc: async (name: string, args: Record<string,unknown>) => {
    if (name !== "marketing_record_consent_decision_atomic")
      return {data:null,error:{message:"Unexpected RPC"}};

    const id = String(args.p_customer_id);
    const email = String(args.p_email);
    const decision = String(args.p_decision);
    const profile = tables.user_profiles.find(
      r => r.id === id && r.role === "customer" &&
           r.billing_email === email
    );

    if (!profile)
      return {data:null,error:{code:"42501"}};

    if (decision === "granted" && args.p_explicit_opt_in !== true)
      return {data:null,error:{code:"22023"}};

    const timestamp = new Date().toISOString(); sequence++;

    tables.marketing_email_consent_events.push({
      id: `synthetic-event-${sequence}`,
      customer_id:id,
      email,
      purpose:"promotional_email",
      decision,
      source:args.p_source,
      evidence_reference:args.p_evidence_reference,
      occurred_at:timestamp,
      created_at:timestamp,
    });

    if (decision === "granted") {
      const existing = tables.marketing_email_enrollment_jobs.find(
        r => r.customer_id === id && r.email === email
      );
      if (existing) {
        if (existing.status !== "processing") {
          Object.assign(existing,{
            status:"pending",
            attempt_count:0,
            next_attempt_at:timestamp,
          });
        }
      } else {
        tables.marketing_email_enrollment_jobs.push({
          id:`synthetic-job-${++sequence}`,
          customer_id:id,
          email,
          status:"pending",
          attempt_count:0,
          next_attempt_at:timestamp,
        });
      }
    } else {
      if (profile.marketing_emails_unsubscribed_at == null)
        profile.marketing_emails_unsubscribed_at = timestamp;

      const existing = tables.marketing_email_reconciliation_jobs.find(
        r => r.customer_id === id && r.email === email &&
             r.action === "unsubscribe"
      );
      if (!existing) {
        tables.marketing_email_reconciliation_jobs.push({
          id:`synthetic-job-${++sequence}`,
          customer_id:id,
          email,
          action:"unsubscribe",
          status:"pending",
          next_attempt_at:timestamp,
        });
      }
    }

    return {data:[{outcome:"new"}],error:null};
  },
} as unknown as SupabaseClient;
  const provider={fail:true,failureStatus:503,segmentFail:false,contact:false,member:false,posts:0,segmentPosts:0};
  const response=(status:number,data?:unknown)=>({status,ok:status>=200&&status<300,
    json:async()=>data}) as Response;
  const fetchMock=vi.fn(async(url:string|URL|Request,init?:RequestInit)=>{
    const path=String(url),method=init?.method??"GET";
    if(path.includes("/suppressions/"))return response(404);
    if(path.endsWith("/contacts")&&method==="POST"){
      provider.posts++;
      if(provider.fail)return response(provider.failureStatus);
      provider.contact=true;
      return response(201,{id:"synthetic-contact"});
    }
    if(path.includes("/contacts/")&&path.endsWith("/segments")&&method==="GET")
      return response(200,{data:provider.member?[{id:segmentId}]:[]});
    if(path.includes("/segments/")&&method==="POST"){
      provider.segmentPosts++;
      if(provider.segmentFail)return response(429);
      provider.member=true;return response(200,{id:segmentId});
    }
    if(path.includes("/contacts/")&&method==="GET")
      return provider.contact?response(200,{id:"synthetic-contact",unsubscribed:false}):response(404);
    throw Error("Unexpected synthetic provider request");
  });
  vi.stubGlobal("fetch",fetchMock);
  const grant=()=>recordCustomerMarketingDecision(db,{
    customerId,authenticatedEmail:email,decision:"granted",explicitOptIn:true,
    evidenceReference:"synthetic-grant",source:"authenticated_preferences",
  });
  const withdraw=()=>recordCustomerMarketingDecision(db,{
    customerId,authenticatedEmail:email,decision:"withdrawn",explicitOptIn:false,
    evidenceReference:"synthetic-withdraw",source:"authenticated_preferences",
  });
  const reconcile=()=>reconcilePendingMarketingEnrollments(db,"synthetic-api-key",segmentId);
  const readyAgain=()=>{tables["marketing_email_enrollment_jobs"]![0]!.next_attempt_at=old;};
  return {db,tables,provider,fetchMock,grant,withdraw,reconcile,readyAgain};
}
describe("Gate 3 full synthetic consent -> provider failure -> retry -> withdrawal",()=>{
  // Exercise explicitly authorised provider behavior against mocked fetch only.
  // Staging remains denied by the separate provider-boundary regression tests.
  beforeEach(()=>{
    vi.clearAllMocks();
    vi.stubEnv("SHALEAN_APP_ENV","production");
    vi.stubEnv("RESEND_CONTACT_WRITES_DISABLED","false");
  });
  afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
  it.each([429,503])("consent queues first, provider %s defers, and a later retry reconciles membership",async status=>{
    const f=fixture();f.provider.failureStatus=status;
    expect(await f.grant()).toMatchObject({ok:true,providerSync:"retry_required"});
    expect(f.provider.posts).toBe(0); // consent request itself cannot contact provider
    expect(f.tables["marketing_email_enrollment_jobs"]![0]).toMatchObject({status:"pending"});
    expect(await f.reconcile()).toMatchObject({attempted:1,deferred:1,completed:0});
    expect(f.tables["marketing_email_enrollment_jobs"]![0]).toMatchObject({status:"pending",attempt_count:1});
    f.provider.fail=false;f.readyAgain();
    expect(await f.reconcile()).toMatchObject({attempted:1,completed:1});
    expect(f.provider.member).toBe(true);
    expect(f.tables["marketing_email_enrollment_jobs"]![0]).toMatchObject({status:"completed",attempt_count:2});
    expect(f.fetchMock.mock.calls.every(args=>String(args[0]).startsWith("https://api.resend.com/"))).toBe(true);
  });
  it("an ambiguous failed create is recovered by read-before-create without duplicate contact writes",async()=>{
    const f=fixture();await f.grant();expect((await f.reconcile()).deferred).toBe(1);
    f.provider.contact=true;f.provider.fail=false;f.readyAgain();
    const writes=f.provider.posts;
    expect((await f.reconcile()).completed).toBe(1);
    expect(f.provider.posts).toBe(writes);expect(f.provider.member).toBe(true);
  });
  it("segment-write rate limiting is retried without recreating the contact",async()=>{
    const f=fixture();await f.grant();f.provider.fail=false;f.provider.segmentFail=true;
    expect((await f.reconcile()).deferred).toBe(1);
    expect(f.provider.contact).toBe(true);expect(f.provider.member).toBe(false);
    const creates=f.provider.posts;
    f.provider.segmentFail=false;f.readyAgain();
    expect((await f.reconcile()).completed).toBe(1);
    expect(f.provider.posts).toBe(creates);expect(f.provider.member).toBe(true);
  });
  it("withdrawal after provider failure prevents enrollment on next retry",async()=>{
    const f=fixture();await f.grant();
    expect((await f.reconcile()).deferred).toBe(1);
    const outboundBefore=f.provider.posts;
    expect(await f.withdraw()).toMatchObject({ok:true,providerSync:"retry_required"});
    f.provider.fail=false;f.readyAgain();
    expect(await f.reconcile()).toMatchObject({attempted:1,blocked:1,completed:0});
    expect(f.provider.posts).toBe(outboundBefore);
    expect(f.provider.member).toBe(false);
    expect(f.tables["marketing_email_enrollment_jobs"]![0]?.status).toBe("blocked");
  });
});
