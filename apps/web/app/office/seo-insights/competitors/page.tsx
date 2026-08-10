import { CompetitorIntelligenceDashboard } from "@/components/admin/seo-insights/CompetitorIntelligenceDashboard";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function CompetitorIntelligencePage() {
  return <div className="space-y-6"><SeoManagementNav /><CompetitorIntelligenceDashboard /></div>;
}
