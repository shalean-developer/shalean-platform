import type { AdminDashboardRevenueRow } from "@/lib/admin/dashboardRevenue";
import { adminDashboardRevenueCents, isAdminDashboardRevenueEligible } from "@/lib/admin/dashboardRevenue";

export type SalesPipelineStage = "lead" | "quote" | "follow_up" | "won" | "lost";

export type SalesPipelineBooking = AdminDashboardRevenueRow & {
  id: string;
  status?: string | null;
};

export type SalesPipelineDocument = {
  id: string;
  document_type: string;
  status: string;
  source?: string | null;
  converted_from_id?: string | null;
  first_viewed_at?: string | null;
  view_count?: number | null;
  linked_booking?: SalesPipelineBooking | null;
};

export function salesPipelineStage(document: SalesPipelineDocument): SalesPipelineStage {
  const status = String(document.status ?? "").trim().toLowerCase();
  if (["void", "expired", "refunded"].includes(status)) return "lost";
  if (document.linked_booking || status === "paid") return "won";
  if (document.document_type === "invoice" || status === "accepted") return "won";
  if (status === "sent" || Number(document.view_count ?? 0) > 0 || document.first_viewed_at) return "follow_up";
  if (status === "draft") return "quote";
  return "lead";
}

export function salesPipelineRevenueCents(document: SalesPipelineDocument): number {
  const booking = document.linked_booking;
  if (!booking || !isAdminDashboardRevenueEligible(booking)) return 0;
  return adminDashboardRevenueCents(booking);
}

export function summarizeSalesPipeline(documents: SalesPipelineDocument[]) {
  const counts: Record<SalesPipelineStage, number> = { lead: 0, quote: 0, follow_up: 0, won: 0, lost: 0 };
  let completedRevenueCents = 0;
  for (const document of documents) {
    counts[salesPipelineStage(document)] += 1;
    if (String(document.linked_booking?.status ?? "").trim().toLowerCase() === "completed") {
      completedRevenueCents += salesPipelineRevenueCents(document);
    }
  }
  return { counts, completed_revenue_cents: completedRevenueCents };
}
