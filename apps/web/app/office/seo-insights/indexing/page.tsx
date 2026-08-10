import { IndexingManagementDashboard } from "@/components/admin/seo-insights/IndexingManagementDashboard";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function IndexingManagementPage(){
  return <div className="space-y-6"><SeoManagementNav/><IndexingManagementDashboard/></div>;
}
