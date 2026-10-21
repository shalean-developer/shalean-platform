import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getZohoInvoice = vi.hoisted(() => vi.fn());
vi.mock("@/lib/zoho/zohoBooksService", () => ({ getZohoInvoice }));

import { syncInvoiceStatusesFromZoho } from "../syncInvoiceMetadata";

type Invoice = { id: string; entity_type: "monthly_invoice"; entity_id: string; zoho_invoice_id: string; sync_status: string | null; last_synced_at: string | null };
function createAdmin(rows: Invoice[], failWrites = false) {
  let clock = 0;
  const writes: string[] = [];
  const admin = {
    from(table: string) {
      if (table !== "accounting_invoice_sync") throw new Error("unexpected table");
      return {
        select() {
          const query = {
            or() { return query; },
            not() { return query; },
            order() { return query; },
            async limit(n: number) {
              return { data: rows
                .filter(r => r.sync_status !== "ignored" && r.zoho_invoice_id)
                .sort((a,b) => (a.last_synced_at ?? "").localeCompare(b.last_synced_at ?? "") || a.id.localeCompare(b.id))
                .slice(0,n), error: null };
            },
          };
          return query;
        },
        async upsert(row: Record<string, unknown>) {
          writes.push(String(row.entity_id));
          if (failWrites) return { error: { message: "database unavailable" } };
          const target = rows.find(r => r.entity_id === row.entity_id);
          if (target) { target.last_synced_at = new Date(2026,9,21,0,0,clock++).toISOString(); target.sync_status = "synced"; }
          return { error: null };
        },
      };
    },
  };
  return { admin: admin as never, writes };
}

describe("Stage 03 Zoho status refresh behaviour", () => {
  beforeEach(() => {
    getZohoInvoice.mockReset();
    getZohoInvoice.mockImplementation(async (id: string) => ({
      ok: true, zohoInvoiceId: id, invoiceNumber: id, customerId: "customer",
      status: "paid", totalCents: 40000, taxCents: 0, balanceCents: 0,
    }));
  });

  it("progresses across consecutive bounded batches, including null status", async () => {
    const rows: Invoice[] = Array.from({length: 7},(_,i) => ({
      id: String(i), entity_type: "monthly_invoice", entity_id: String(i),
      zoho_invoice_id: "z"+i, sync_status: i === 0 ? null : "synced", last_synced_at: null,
    }));
    const {admin,writes} = createAdmin(rows);
    expect(await syncInvoiceStatusesFromZoho(admin,5)).toEqual({synced:5,failed:0});
    expect(await syncInvoiceStatusesFromZoho(admin,5)).toEqual({synced:5,failed:0});
    expect(new Set(writes).size).toBe(7);
    expect(writes[0]).toBe("0");
  });

  it("counts Zoho API errors without falsely acknowledging metadata writes", async () => {
    getZohoInvoice.mockResolvedValue({ok:false,error:"zoho unavailable"});
    const {admin,writes} = createAdmin([{id:"1",entity_type:"monthly_invoice",entity_id:"1",zoho_invoice_id:"z1",sync_status:"synced",last_synced_at:null}]);
    expect(await syncInvoiceStatusesFromZoho(admin,5)).toEqual({synced:0,failed:1});
    expect(writes).toHaveLength(0);
  });

  it("returns a failed outcome if the database rejects an upsert", async () => {
    const {admin} = createAdmin([{id:"1",entity_type:"monthly_invoice",entity_id:"1",zoho_invoice_id:"z1",sync_status:"synced",last_synced_at:null}],true);
    expect(await syncInvoiceStatusesFromZoho(admin,5)).toEqual({synced:0,failed:1});
  });
});
