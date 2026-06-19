import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentJson } from "@/lib/blog/content-json";

export type ComparisonTemplateVars = {
  topicA: string;
  topicB: string;
  cityName?: string;
};

/** Comparison: overview → table → when to choose → FAQ → CTA */
export function buildComparisonTemplate(vars: ComparisonTemplateVars): BlogContentJson {
  const a = vars.topicA.trim() || "Option A";
  const b = vars.topicB.trim() || "Option B";
  const city = (vars.cityName ?? "Cape Town").trim();

  return {
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks: [
      {
        id: "tpl-cmp-intro",
        type: "intro",
        content: `Choosing between ${a} and ${b} in ${city}? Compare scope, timing, and outcomes—then book the tier that matches your home and schedule.`,
      },
      {
        id: "tpl-cmp-table",
        type: "comparison_table",
        columns: ["Topic", a, b],
        rows: [
          ["Best for", `Homes that match ${a}`, `Homes that match ${b}`],
          ["Time on-site", "Varies by rooms/add-ons", "Varies by rooms/add-ons"],
          ["Ideal moment", "Maintenance cadence", "Deeper reset / detail"],
        ],
      },
      {
        id: "tpl-cmp-when",
        type: "section",
        title: "When to choose each option",
        heading_level: 2,
        content: `Pick ${a} when you want a lighter, faster reset between visits. Choose ${b} when kitchens, bathrooms, or detail zones need more dwell time or it has been longer since a professional clean.`,
      },
      {
        id: "tpl-cmp-faq",
        type: "faq",
        items: [
          {
            question: `Is ${a} cheaper than ${b}?`,
            answer:
              "Pricing depends on rooms and add-ons—compare line items at checkout for your exact home rather than assuming a fixed rule.",
          },
          {
            question: "Can I switch tiers later?",
            answer: "Yes—adjust service tier and add-ons on your next booking as needs change.",
          },
        ],
      },
      {
        id: "tpl-cmp-cta",
        type: "cta",
        title: "Ready to book?",
        description: `See scope and pricing for ${city} before you confirm.`,
        button_text: "Book a cleaner",
        link: "/book",
        variant: "primary",
      },
    ],
  };
}
