import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentJson } from "@/lib/blog/content-json";

export type LocationTemplateVars = {
  areaName: string;
  cityName?: string;
  serviceName?: string;
};

/** Location guide: intro → quick answer → pricing → services → FAQ → nearby → CTA */
export function buildLocationGuideTemplate(vars: LocationTemplateVars): BlogContentJson {
  const area = vars.areaName.trim() || "your area";
  const city = (vars.cityName ?? "Cape Town").trim();
  const service = (vars.serviceName ?? "Home cleaning").trim();

  return {
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks: [
      {
        id: "tpl-loc-intro",
        type: "intro",
        content: `Planning ${service.toLowerCase()} in ${area}, ${city}? This guide explains typical scope, what affects pricing, and how to book a vetted Shalean team with clear checkout totals.`,
      },
      {
        id: "tpl-loc-qa",
        type: "quick_answer",
        content: `${service} in ${area} is priced from home size, bathrooms, add-ons, and timing—book online to see an itemised quote before you pay.`,
      },
      {
        id: "tpl-loc-pricing",
        type: "section",
        title: `Pricing notes for ${area}`,
        heading_level: 2,
        content: `Rates reflect realistic time on-site for ${service.toLowerCase()}, travel within ${city}, and supplies. Larger homes, ovens/fridges, or carpet treatments add line items you approve before payment.`,
      },
      {
        id: "tpl-loc-services",
        type: "section",
        title: `What ${service.toLowerCase()} covers`,
        heading_level: 2,
        content: `Kitchens, bathrooms, dusting, floors, and high-touch surfaces are prioritised using a checklist—scoped to your rooms and add-ons. Mention lifts, parking, and pets in booking notes.`,
      },
      {
        id: "tpl-loc-faq",
        type: "faq",
        items: [
          {
            question: `Do you serve ${area}?`,
            answer: `Yes—start a booking with your ${area} address to confirm coverage and slot availability across ${city}.`,
          },
          {
            question: "How fast can I get a quote?",
            answer: "You’ll see an itemised total at checkout before payment—adjust bedrooms, bathrooms, and add-ons to match your visit.",
          },
          {
            question: "Can I reschedule?",
            answer: "Yes—use your booking confirmation flow to pick another slot when capacity allows.",
          },
        ],
      },
      {
        id: "tpl-loc-nearby",
        type: "service_area",
        locations: [`${area}`, `${city} surrounds`],
      },
      {
        id: "tpl-loc-cta",
        type: "cta",
        title: `Book ${service} in ${area}`,
        description: "Transparent pricing at checkout—vetted teams across Cape Town.",
        button_text: "Get instant quote",
        link: "/book",
        variant: "primary",
      },
    ],
  };
}
