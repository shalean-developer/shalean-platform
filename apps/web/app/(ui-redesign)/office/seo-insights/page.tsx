"use client";

import { SeoManagementCommandCentre } from "@/components/admin/seo-insights/SeoManagementCommandCentre";
import { SeoDashboardOverview } from "@/components/admin/seo-insights/SeoDashboardOverview";

export default function SeoInsightsPage() {
  return (
    <div className="space-y-6">
      <SeoManagementCommandCentre />
      <SeoDashboardOverview />
    </div>
  );
}
