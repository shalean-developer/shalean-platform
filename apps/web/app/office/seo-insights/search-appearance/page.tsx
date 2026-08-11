import { SearchAppearanceDashboard } from "@/components/admin/seo-insights/SearchAppearanceDashboard";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function SearchAppearancePage(){
  return <div className="space-y-6"><SeoManagementNav/><SearchAppearanceDashboard/></div>;
}
