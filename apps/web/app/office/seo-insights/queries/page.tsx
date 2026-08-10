import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { SeoQueryManagementDashboard } from "@/components/admin/seo-insights/SeoQueryManagementDashboard";

export default function SeoQueriesPage(){
  return <div className="space-y-6"><SeoManagementNav /><SeoQueryManagementDashboard /></div>;
}
