import type { BlogContentJson } from "@/lib/blog/content-json";
import { buildComparisonTemplate, type ComparisonTemplateVars } from "@/lib/blog/templates/comparison-template";
import { buildGuideTemplate, type GuideTemplateVars } from "@/lib/blog/templates/guide-template";
import { buildLocationGuideTemplate, type LocationTemplateVars } from "@/lib/blog/templates/location-template";

export type BlogTemplateId = "location" | "comparison" | "guide";

export type BlogTemplateVarsUnion =
  | { template: "location"; vars: LocationTemplateVars }
  | { template: "comparison"; vars: ComparisonTemplateVars }
  | { template: "guide"; vars: GuideTemplateVars };

export function buildBlogTemplateContent(spec: BlogTemplateVarsUnion): BlogContentJson {
  switch (spec.template) {
    case "location":
      return buildLocationGuideTemplate(spec.vars);
    case "comparison":
      return buildComparisonTemplate(spec.vars);
    case "guide":
      return buildGuideTemplate(spec.vars);
  }
}

export { buildLocationGuideTemplate, type LocationTemplateVars };
export { buildComparisonTemplate, type ComparisonTemplateVars };
export { buildGuideTemplate, type GuideTemplateVars };

export const BLOG_TEMPLATE_OPTIONS: { id: BlogTemplateId; label: string; description: string }[] = [
  {
    id: "location",
    label: "Location guide",
    description: "Intro, quick answer, pricing, services, FAQ, nearby areas, CTA",
  },
  {
    id: "comparison",
    label: "Comparison",
    description: "Overview, comparison table, when to choose, FAQ, CTA",
  },
  {
    id: "guide",
    label: "Guide",
    description: "Intro, H2 sections, FAQ, CTA",
  },
];
