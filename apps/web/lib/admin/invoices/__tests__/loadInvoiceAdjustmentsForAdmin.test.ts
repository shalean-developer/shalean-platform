import { describe, expect, it, vi } from "vitest";

import { loadInvoiceAdjustmentsForAdmin } from "@/lib/admin/invoices/loadAdminInvoiceBundle";

function mockAdmin(responses: {
  applied?: { data: unknown[]; error: null };
  pending?: { data: unknown[]; error: null };
}) {
  const applied = responses.applied ?? { data: [], error: null };
  const pending = responses.pending ?? { data: [], error: null };
  const eqColumns: string[] = [];

  return {
    from: vi.fn((table: string) => {
      if (table !== "invoice_adjustments") throw new Error(`unexpected table ${table}`);
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn((column: string) => {
          eqColumns.push(column);
          return chain;
        }),
        is: vi.fn(() => chain),
        order: vi.fn(async () => {
          if (eqColumns.includes("applied_to_invoice_id")) return applied;
          return pending;
        }),
      };
      return chain;
    }),
   } as unknown as Parameters<typeof loadInvoiceAdjustmentsForAdmin>[0];
}

describe("loadInvoiceAdjustmentsForAdmin", () => {
  it("merges applied and pending draft-month adjustments", async () => {
    const admin = mockAdmin({
      applied: { data: [{ id: "a1", created_at: "2026-06-02T10:00:00Z" }], error: null },
      pending: { data: [{ id: "a2", created_at: "2026-06-03T10:00:00Z" }], error: null },
    });

    const rows = await loadInvoiceAdjustmentsForAdmin(
      admin,
      "inv-1",
      "cust-1",
      "2026-06",
      "draft",
    );

    expect(rows.map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("returns only applied rows for sent invoices", async () => {
    const admin = mockAdmin({
      applied: { data: [{ id: "a1", created_at: "2026-06-02T10:00:00Z" }], error: null },
    });

    const rows = await loadInvoiceAdjustmentsForAdmin(
      admin,
      "inv-1",
      "cust-1",
      "2026-06",
      "sent",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("a1");
  });
});
