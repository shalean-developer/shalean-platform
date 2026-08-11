import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { OrganicRevenueDashboard } from "@/components/admin/seo-insights/OrganicRevenueDashboard";

export default function OrganicRevenuePage(){
  return <div className="space-y-6"><SeoManagementNav/><OrganicRevenueDashboard/></div>;
}
