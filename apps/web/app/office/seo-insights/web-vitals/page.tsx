import { CoreWebVitalsDashboard } from "@/components/admin/seo-insights/CoreWebVitalsDashboard";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function CoreWebVitalsPage(){
  return <div className="space-y-6"><SeoManagementNav/><CoreWebVitalsDashboard/></div>;
}
