import { describe, expect, it } from "vitest";
import { salesPipelineRevenueCents, salesPipelineStage, summarizeSalesPipeline } from "@/lib/admin/sales/salesPipeline";

const base = { id: "doc", document_type: "quote", status: "requested", source: "customer_request" };

describe("P7 sales pipeline", () => {
  it("derives lifecycle stages from the canonical quote and booking records", () => {
    expect(salesPipelineStage(base)).toBe("lead");
    expect(salesPipelineStage({ ...base, status: "draft" })).toBe("quote");
    expect(salesPipelineStage({ ...base, status: "sent", view_count: 1 })).toBe("follow_up");
    expect(salesPipelineStage({ ...base, status: "expired" })).toBe("lost");
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
});
