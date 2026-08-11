import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { ContentRefreshDashboard } from "@/components/admin/seo-insights/ContentRefreshDashboard";

export default function ContentRefreshPage(){
  return <div className="space-y-6"><SeoManagementNav/><ContentRefreshDashboard/></div>;
}
