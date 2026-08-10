import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { StructuredDataDashboard } from "@/components/admin/seo-insights/StructuredDataDashboard";

export default function StructuredDataPage(){
  return <div className="space-y-6"><SeoManagementNav/><StructuredDataDashboard/></div>;
}
