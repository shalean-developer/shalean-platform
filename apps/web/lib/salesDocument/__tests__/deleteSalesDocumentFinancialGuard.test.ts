import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("sales document unpaid booking cleanup vs financial delete guard", () => {
  it("proves the linked booking is unpaid and ledger-free before clearing the document link", () => {
    const src = read("lib/salesDocument/deleteSalesDocument.ts");

    expect(src).toContain("payment_completed_at, payment_status, amount_paid_cents, total_paid_cents, total_paid_zar, payment_transaction_id");
    expect(src).toContain('["paid", "success", "succeeded"].includes(paymentStatus)');
    expect(src).toContain('.from("payment_transactions")');
    expect(src).toContain("booking_id.eq.");
    expect(src).toContain("entity_type.eq.booking");
    expect(src).toContain('return { ok: false, error: "linked_paid_booking" }');
  });

  it("clears only sales_document_id before the validated unpaid hard delete", () => {
    const src = read("lib/salesDocument/deleteSalesDocument.ts");
    const unlinkPos = src.indexOf(".update({ sales_document_id: null })");
    const deletePos = src.indexOf('.from("bookings").delete().eq("id", row.id)');

    expect(unlinkPos).toBeGreaterThanOrEqual(0);
    expect(deletePos).toBeGreaterThan(unlinkPos);
  });
});
