import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { SeoPageGroupDashboard } from "@/components/admin/seo-insights/SeoPageGroupDashboard";

export default function SeoPageGroupsPage() {
  return <div className="space-y-6"><SeoManagementNav /><SeoPageGroupDashboard /></div>;
}
