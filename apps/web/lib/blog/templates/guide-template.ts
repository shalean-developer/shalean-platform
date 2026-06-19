import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentJson } from "@/lib/blog/content-json";

export type GuideTemplateVars = {
  topic: string;
  cityName?: string;
};

/** General guide: intro → H2 sections → FAQ → CTA */
export function buildGuideTemplate(vars: GuideTemplateVars): BlogContentJson {
  const topic = vars.topic.trim() || "home cleaning";
  const city = (vars.cityName ?? "Cape Town").trim();

  return {
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks: [
      {
        id: "tpl-g-intro",
        type: "intro",
        content: `A practical ${topic} guide for ${city} households—what to expect, how booking works, and how to keep results consistent between visits.`,
      },
      {
        id: "tpl-g-s1",
        type: "section",
        title: "How booking works",
        heading_level: 2,
        content:
          "Share bedrooms, bathrooms, and add-ons online. You’ll see an itemised total before payment, with notes for access, pets, and parking.",
      },
      {
        id: "tpl-g-s2",
        type: "section",
        title: "What affects results",
        heading_level: 2,
        content:
          "Scope, clutter, and supply-heavy tasks change dwell time. Clear counters and accurate room counts keep the visit aligned with your quote.",
      },
      {
        id: "tpl-g-faq",
        type: "faq",
        items: [
          {
            question: "Do cleaners bring supplies?",
            answer: "Teams arrive prepared for the booked scope—note special surfaces or preferences at checkout.",
          },
          {
            question: "Can I book recurring cleans?",
            answer: "Yes—choose cadence where offered, or start once-off and extend after your first visit.",
          },
        ],
      },
      {
        id: "tpl-g-cta",
        type: "cta",
        title: "Book your clean",
        description: `Shalean serves ${city} with vetted teams and transparent checkout.`,
        button_text: "Get instant quote",
        link: "/book",
        variant: "primary",
      },
    ],
  };
}
