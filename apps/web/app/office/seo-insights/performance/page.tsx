import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { SeoDashboardOverview } from "@/components/admin/seo-insights/SeoDashboardOverview";

export default function SeoPerformancePage() {
  return <div className="space-y-6"><SeoManagementNav /><div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><strong>Scored location cohort:</strong> the health score and legacy page table below cover the location pages with sufficient scoring inputs. Whole-site GSC coverage is managed under <strong>Pages</strong> and includes Core, Service, Blog, Location and Recruitment URLs.</div><SeoDashboardOverview /></div>;
}
