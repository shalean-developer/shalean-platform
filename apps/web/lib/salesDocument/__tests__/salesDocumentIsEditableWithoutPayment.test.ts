import { describe, expect, it } from "vitest";

import { salesDocumentIsDeletable, salesDocumentIsEditableWithoutPayment } from "@/lib/salesDocument/types";

describe("salesDocumentIsEditableWithoutPayment", () => {
  it("allows draft and requested quotes", () => {
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "quote",
        status: "draft",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "quote",
        status: "requested",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
  });

  it("allows sent quotes and invoices with no payment", () => {
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "quote",
        status: "sent",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "invoice",
        status: "sent",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
  });

  it("allows accepted quotes and invoices with no payment", () => {
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "quote",
        status: "accepted",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "invoice",
        status: "draft",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
  });

  it("blocks paid documents", () => {
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "invoice",
        status: "paid",
        amount_paid_cents: 5000,
      }),
    ).toBe(false);
  });

  it("blocks when any payment was recorded", () => {
    expect(
      salesDocumentIsEditableWithoutPayment({
        document_type: "invoice",
        status: "sent",
        amount_paid_cents: 100,
      }),
    ).toBe(false);
  });
});

describe("salesDocumentIsDeletable", () => {
  it("matches unpaid editable rules", () => {
    expect(
      salesDocumentIsDeletable({
        document_type: "quote",
        status: "accepted",
        amount_paid_cents: 0,
      }),
    ).toBe(true);
    expect(
      salesDocumentIsDeletable({
        document_type: "invoice",
        status: "paid",
        amount_paid_cents: 100,
      }),
    ).toBe(false);
  });
});
