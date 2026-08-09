import type { AdminDashboardRevenueRow } from "@/lib/admin/dashboardRevenue";
import { adminDashboardRevenueCents, isAdminDashboardRevenueEligible } from "@/lib/admin/dashboardRevenue";

export type SalesPipelineStage = "lead" | "qualified" | "quote" | "follow_up" | "won" | "lost";

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
  crm_stage?: SalesPipelineStage | null;
};

export type SalesPipelineSource = "website" | "office";

export function salesPipelineSource(
  document: Pick<SalesPipelineDocument, "source">,
  parent?: Pick<SalesPipelineDocument, "source"> | null,
): SalesPipelineSource {
  const source = String(parent?.source ?? document.source ?? "").trim().toLowerCase();
  return source === "customer_request" ? "website" : "office";
}

export function salesPipelineStage(document: SalesPipelineDocument): SalesPipelineStage {
  const status = String(document.status ?? "").trim().toLowerCase();
  if (["void", "expired", "refunded"].includes(status)) return "lost";
  if (document.linked_booking || status === "paid") return "won";
  if (status === "accepted" || (document.document_type === "invoice" && Boolean(document.converted_from_id))) return "won";
  if (document.crm_stage === "won" || document.crm_stage === "lost") return document.crm_stage;
  if (status === "sent" || Number(document.view_count ?? 0) > 0 || document.first_viewed_at) return "follow_up";
  if (document.crm_stage) return document.crm_stage;
  if (status === "draft") return "quote";
  return "lead";
}

export function salesPipelineRevenueCents(document: SalesPipelineDocument): number {
  const booking = document.linked_booking;
  if (!booking || !isAdminDashboardRevenueEligible(booking)) return 0;
  return adminDashboardRevenueCents(booking);
}

export function summarizeSalesPipeline(documents: SalesPipelineDocument[]) {
  const counts: Record<SalesPipelineStage, number> = { lead: 0, qualified: 0, quote: 0, follow_up: 0, won: 0, lost: 0 };
  let completedRevenueCents = 0;

  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const opportunities = new Map<string, SalesPipelineDocument[]>();
  for (const document of documents) {
    const convertedFromId = String(document.converted_from_id ?? "").trim();
    const rootId = convertedFromId && documentsById.has(convertedFromId) ? convertedFromId : document.id;
    const group = opportunities.get(rootId) ?? [];
    group.push(document);
    opportunities.set(rootId, group);
  }

  const stagePriority: Record<SalesPipelineStage, number> = { lead: 0, qualified: 1, quote: 2, follow_up: 3, lost: 4, won: 5 };
  for (const opportunity of opportunities.values()) {
    const stage = opportunity
      .map(salesPipelineStage)
      .sort((a, b) => stagePriority[b] - stagePriority[a])[0] ?? "lead";
    counts[stage] += 1;

    for (const document of opportunity) {
      if (String(document.linked_booking?.status ?? "").trim().toLowerCase() === "completed") {
        completedRevenueCents += salesPipelineRevenueCents(document);
      }
    }
  }
  return { counts, completed_revenue_cents: completedRevenueCents };
}
