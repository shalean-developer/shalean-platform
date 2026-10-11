import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("sales document unpaid booking cleanup vs financial delete guard", () => {
  it("delegates booking cleanup to the atomic database boundary", () => {
    const src = read("lib/salesDocument/deleteSalesDocument.ts");

    expect(src).toContain('admin.rpc("delete_unpaid_sales_document_booking"');
    expect(src).toContain("p_invoice_id: invoiceId");
    expect(src).not.toContain(".update({ sales_document_id: null })");
    expect(src).not.toContain('.from("bookings").delete()');
  });

  it("propagates a financial cleanup rejection instead of continuing document deletion", () => {
    const src = read("lib/salesDocument/deleteSalesDocument.ts");

    expect(src).toContain("if (result?.ok === false)");
    expect(src).toContain("linked_booking_delete_blocked");
    expect(src).toContain("if (!bookingResult.ok) return bookingResult");
  });
});
