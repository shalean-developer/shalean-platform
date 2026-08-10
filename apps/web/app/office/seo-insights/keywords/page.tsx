import { KeywordPortfolioDashboard } from "@/components/admin/seo-insights/KeywordPortfolioDashboard";
import { SeoManagementNav } from "@/components/admin/seo-insights/SeoManagementNav";

export default function SeoKeywordPortfolioPage(){
  return <div className="space-y-6"><SeoManagementNav/><KeywordPortfolioDashboard/></div>;
}
