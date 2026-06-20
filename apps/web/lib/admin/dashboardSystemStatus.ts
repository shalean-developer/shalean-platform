import type { OfficeOpsHealthSummary, OfficeOpsServiceId, OfficeOpsServiceStatus } from "@/lib/admin/officeOpsHealth";

export type DashboardSystemCheckStatus = "operational" | "degraded" | "down" | "warning";

export type DashboardSystemStatusPayload = {
  website: DashboardSystemCheckStatus;
  bookingEngine: DashboardSystemCheckStatus;
  paymentGateway: DashboardSystemCheckStatus;
  productionHealth: {
    generatedAt?: string;
    totals?: OfficeOpsHealthSummary["productionHealth"]["totals"];
    totalFindings?: number;
    topFindings?: Array<{
      code: string;
      severity: string;
      count: number;
      message: string;
    }>;
    error?: string;
  };
  cronErrorsLast24h: number;
};

export function mapOfficeOpsStatusToDashboard(status: OfficeOpsServiceStatus): DashboardSystemCheckStatus {
  if (status === "maintenance") return "degraded";
  return status;
}

function serviceCurrentStatus(summary: OfficeOpsHealthSummary, id: OfficeOpsServiceId): OfficeOpsServiceStatus {
  return summary.services.find((service) => service.id === id)?.currentStatus ?? "operational";
}

/** Maps unified `/office/ops-health` summary to the compact dashboard System status card. */
export function buildDashboardSystemStatusFromOfficeOps(
  summary: OfficeOpsHealthSummary,
  cronErrorsLast24h: number,
): DashboardSystemStatusPayload {
  const topFindings = summary.scanner.summaries.slice(0, 3).map((finding) => ({
    code: finding.code,
    severity: finding.severity,
    count: finding.count,
    message: finding.message,
  }));

  return {
    website: mapOfficeOpsStatusToDashboard(serviceCurrentStatus(summary, "website")),
    bookingEngine: mapOfficeOpsStatusToDashboard(serviceCurrentStatus(summary, "booking_engine")),
    paymentGateway: mapOfficeOpsStatusToDashboard(serviceCurrentStatus(summary, "payment_gateway")),
    productionHealth: summary.error
      ? { error: summary.error, totalFindings: 0 }
      : {
          generatedAt: summary.productionHealth.generatedAt,
          totals: summary.productionHealth.totals,
          totalFindings: summary.productionHealth.totalFindings,
          topFindings,
        },
    cronErrorsLast24h,
  };
}
