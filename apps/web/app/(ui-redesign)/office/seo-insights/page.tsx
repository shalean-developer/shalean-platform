"use client";

import { SeoManagementCommandCentre } from "@/components/admin/seo-insights/SeoManagementCommandCentre";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function SeoInsightsPage() {
  return (
    <div className="space-y-6">
      <SeoManagementNav />
      <SeoManagementCommandCentre />
    </div>
  );
}
