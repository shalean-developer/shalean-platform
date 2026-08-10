import { ServiceSeoHealthDashboard } from "@/components/admin/seo-insights/ServiceSeoHealthDashboard";
import { ServiceQueryVisibility } from "@/components/admin/seo-insights/ServiceQueryVisibility";

export default function ServiceSeoHealthPage() {
  return <div className="space-y-6"><ServiceSeoHealthDashboard /><ServiceQueryVisibility /></div>;
}
