import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getZohoInvoice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/zoho/zohoBooksService", () => ({ getZohoInvoice }));
import { syncInvoiceStatusesFromZoho } from "../syncInvoiceMetadata";

type Invoice = { id: string; entity_type: "monthly_invoice"; entity_id: string; zoho_invoice_id: string; sync_status: string | null };
function createAdmin(rows: Invoice[], failingWrites = false) {
  let lastId = "00000000-0000-0000-0000-000000000000";
  const writes: string[] = [];
  const admin = {
    from(table: string) {
      if (table === "accounting_invoice_refresh_cursor") return {
        select() { return { eq() { return { async single() { return { data: { last_id: lastId }, error: null }; } }; } }; },
        update(values: {last_id:string}) { return { async eq() { lastId = values.last_id; return {error:null}; } }; },
      };
      if (table !== "accounting_invoice_sync") throw Error("unexpected table");
      return {
        select() {
          const query = {
            or() { return query; },
            not() { return query; },
            order() { return query; },
            async limit(n: number) { return {data: rows.filter(r => r.sync_status !== "ignored").slice(0,n),error:null}; },
            async gt(_field:string,id:string) { return {data: rows.filter(r => r.sync_status !== "ignored" && r.id > id).slice(0,5),error:null}; },
          };
          return query;
        },
        async upsert(value:Record<string,unknown>) {
          writes.push(String(value.entity_id));
          return {error: failingWrites ? {message:"DB failure"} : null};
        },
      };
    },
  };
  return {admin:admin as never,writes,get cursor(){return lastId;}};
}
function inv(n:number):Invoice { return { id:String(n).padStart(4,"0"), entity_id:String(n),entity_type:"monthly_invoice",zoho_invoice_id:"z"+n,sync_status:n===1?null:"synced" }; }

describe("Stage 03 durable Zoho cursor",()=>{
  beforeEach(()=>{
    vi.restoreAllMocks();
    getZohoInvoice.mockReset();
    getZohoInvoice.mockImplementation(async (id:string)=>({
      ok:true,zohoInvoiceId:id,invoiceNumber:id,customerId:"c",status:"paid",totalCents:40000,taxCents:0,balanceCents:0,
    }));
  });
  it("advances after missed schedules and wraps after the last ID",async()=>{
    const mock=createAdmin(Array.from({length:7},(_,i)=>inv(i+1)));
    expect(await syncInvoiceStatusesFromZoho(mock.admin,5)).toEqual({synced:5,failed:0});
    expect(mock.cursor).toBe("0005");
    // No dependence on Date.now or 15-minute cadence.
    expect(await syncInvoiceStatusesFromZoho(mock.admin,5)).toEqual({synced:2,failed:0});
    expect(mock.cursor).toBe("0007");
    expect(await syncInvoiceStatusesFromZoho(mock.admin,5)).toEqual({synced:5,failed:0});
    expect(new Set(mock.writes).size).toBe(7);
  });
  it("advances even when Zoho returns errors, avoiding starvation",async()=>{
    const mock=createAdmin([inv(1),inv(2),inv(3),inv(4),inv(5),inv(6)]);
    getZohoInvoice.mockResolvedValue({ok:false,error:"Zoho unavailable"});
    expect(await syncInvoiceStatusesFromZoho(mock.admin,5)).toEqual({synced:0,failed:5});
    expect(mock.cursor).toBe("0005");
    expect(await syncInvoiceStatusesFromZoho(mock.admin,5)).toEqual({synced:0,failed:1});
  });
  it("counts database-upsert failures, without claiming payment success",async()=>{
    const mock=createAdmin([inv(1)],true);
    expect(await syncInvoiceStatusesFromZoho(mock.admin,5)).toEqual({synced:0,failed:1});
  });
});
