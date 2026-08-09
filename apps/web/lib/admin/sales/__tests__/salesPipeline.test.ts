import { describe, expect, it } from "vitest";
import { salesPipelineRevenueCents, salesPipelineSource, salesPipelineStage, summarizeSalesPipeline } from "@/lib/admin/sales/salesPipeline";

const base = { id: "doc", document_type: "quote", status: "requested", source: "customer_request" };

describe("P7 sales pipeline", () => {
  it("derives lifecycle stages from the canonical quote and booking records", () => {
    expect(salesPipelineStage(base)).toBe("lead");
    expect(salesPipelineStage({ ...base, status: "draft" })).toBe("quote");
    expect(salesPipelineStage({ ...base, status: "sent", view_count: 1 })).toBe("follow_up");
    expect(salesPipelineStage({ ...base, status: "expired" })).toBe("lost");
    expect(salesPipelineStage({ ...base, document_type: "invoice", status: "draft" })).toBe("quote");
    expect(salesPipelineStage({
      ...base,
      linked_booking: {
        id: "booking",
        status: "pending_payment",
        payment_status: null,
        payment_completed_at: null,
        total_paid_zar: null,
        amount_paid_cents: null,
      },
    })).toBe("won");
  });

  it("inherits website attribution across quote-to-invoice conversion", () => {
    expect(salesPipelineSource(
      { source: "admin" },
      { source: "customer_request" },
    )).toBe("website");
    expect(salesPipelineSource({ source: "admin" })).toBe("office");
  });

  it("counts only canonical eligible completed booking revenue", () => {
    const won = {
      ...base,
      linked_booking: {
        id: "booking",
        status: "completed",
        payment_status: "success",
        payment_completed_at: "2026-08-09T12:00:00Z",
        amount_paid_cents: 12345,
        total_paid_zar: null,
      },
    };
    expect(salesPipelineRevenueCents(won)).toBe(12345);
    expect(summarizeSalesPipeline([won]).completed_revenue_cents).toBe(12345);

    const refunded = {
      ...won,
      id: "refunded",
      linked_booking: { ...won.linked_booking, refunded_at: "2026-08-09T00:00:00Z" },
    };
    expect(salesPipelineRevenueCents(refunded)).toBe(0);
  });

  it("treats a converted quote and invoice as one opportunity", () => {
    const quote = { ...base, id: "quote", status: "accepted" };
    const invoice = {
      ...base,
      id: "invoice",
      document_type: "invoice",
      status: "paid",
      converted_from_id: "quote",
      linked_booking: {
        id: "booking",
        status: "completed",
        payment_status: "success",
        payment_completed_at: "2026-08-09T12:00:00Z",
        amount_paid_cents: 50000,
        total_paid_zar: null,
      },
    };

    const summary = summarizeSalesPipeline([quote, invoice]);
    expect(summary.counts.won).toBe(1);
    expect(Object.values(summary.counts).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(summary.completed_revenue_cents).toBe(50000);
  });
});
