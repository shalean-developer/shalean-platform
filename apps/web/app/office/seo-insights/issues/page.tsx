import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";
import { SeoRecommendationWorkflowDashboard } from "@/components/admin/seo-insights/SeoRecommendationWorkflowDashboard";

export default function SeoIssueWorkflowPage(){
  return <div className="space-y-6"><SeoManagementNav /><SeoRecommendationWorkflowDashboard /></div>;
}
