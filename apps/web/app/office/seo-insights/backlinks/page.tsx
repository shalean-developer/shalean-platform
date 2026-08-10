import { BacklinkManagementDashboard } from "@/components/admin/seo-insights/BacklinkManagementDashboard";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function BacklinkManagementPage(){
  return <div className="space-y-6"><SeoManagementNav/><BacklinkManagementDashboard/></div>;
}
