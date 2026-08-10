import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { SeoDashboardOverview } from "@/components/admin/seo-insights/SeoDashboardOverview";
import { SeoAutomationHistory } from "@/components/admin/seo-insights/SeoAutomationHistory";

export default function SeoPerformancePage() {
  return <div className="space-y-6"><SeoManagementNav /><div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800"><strong>Scored location cohort:</strong> the health score, momentum matrix and legacy page table below are directional diagnostics for location pages with scoring inputs. They are <strong>not</strong> the canonical whole-site issue count. Whole-site GSC coverage is managed under <strong>Pages</strong>, while accountable SEO work is managed under <strong>Issues</strong>.</div><SeoDashboardOverview /><SeoAutomationHistory /></div>;
}
