import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { LocalSeoDashboard } from "@/components/admin/seo-insights/LocalSeoDashboard";

export default function LocalSeoPage(){
  return <div className="space-y-6"><SeoManagementNav/><LocalSeoDashboard/></div>;
}
