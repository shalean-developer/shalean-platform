import type { FaqCategoryGroup, FaqStructuredItem } from "@/lib/faq/faq-page-types";
import { CUSTOMER_SUPPORT_EMAIL, CUSTOMER_SUPPORT_WHATSAPP_URL } from "@/lib/site/customerSupport";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const STD = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
const DEEP = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const MOVE = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
const AIRBNB = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

/** Top conversion FAQs — always visible, expanded (not inside accordion). */
export const FAQ_FEATURED: readonly FaqStructuredItem[] = [
  {
    id: "feat-cost",
    question: "How much does cleaning cost in Cape Town?",
    lead: "Cleaning services in Cape Town typically cost between R300 and R900 depending on home size, service tier, bathrooms, and add-ons.",
    paragraphs: [
      "Your total is calculated online from bedrooms, bathrooms, service type (standard, deep, move-out, Airbnb, etc.), and extras—so you approve a locked quote before we dispatch.",
      "Coastal and premium-band suburbs can trend higher when scope or routing is heavier; see any hub like [Sea Point cleaning services](/locations/sea-point-cleaning-services) for local context, then open [Get your exact price](/book) with your address.",
    ],
    bullets: [
      "Small apartments often start lower; larger homes and deep cleans need more crew time.",
      "Move-out and inventory-focused scopes usually sit at the upper end—ovens, fridges, and wet zones take longer.",
    ],
    keywords: ["price", "cost", "how much", "rates", "rand", "expensive", "cheap"],
    showInlineCta: true,
  },
  {
    id: "feat-standard",
    question: "What's included in a standard clean?",
    lead: "Standard cleaning is a maintenance visit focused on kitchens, bathrooms, living areas, and floors using an agreed checklist—not a full detail reset.",
    paragraphs: [
      "It’s designed for weekly or fortnightly upkeep: surfaces wiped, floors vacuumed/mopped where booked, bathrooms sanitised, and kitchens refreshed to a predictable baseline.",
      "Compare scope with [deep cleaning](/services/deep-cleaning-cape-town) when grease, grout, or built-up dust needs extra dwell time.",
    ],
    bullets: [
      "Exact inclusions follow what you select at checkout—room counts and add-ons matter.",
      "Tell us about pets, lifts, or parking in notes so time on site targets cleaning—not logistics.",
    ],
    keywords: ["standard", "included", "what's included", "checklist", "regular"],
    showInlineCta: true,
  },
  {
    id: "feat-sameday",
    question: "Can I book same-day cleaning?",
    lead: "Yes—when cleaner availability and routing allow, same-day slots can appear in the online booking flow.",
    paragraphs: [
      "Popular corridors (Atlantic Seaboard, Southern Suburbs hubs) fill faster—booking earlier in the day improves match quality.",
      "If you need urgent turnover, add access codes, parking, and scope notes so teams quote realistic time.",
    ],
    keywords: ["same day", "today", "urgent", "fast", "last minute"],
    showInlineCta: true,
  },
  {
    id: "feat-supplies",
    question: "Do cleaners bring supplies?",
    lead: "Yes—teams arrive with professional-grade products and equipment aligned to the scope you confirmed.",
    paragraphs: [
      "If you prefer specific eco brands or fragrance-free products, mention it in booking notes—we’ll align where possible.",
      "Rare speciality finishes (untreated wood, delicate stone) should be called out so crews bring the right approach.",
    ],
    keywords: ["supplies", "products", "equipment", "vacuum", "mop", "chemicals"],
    showInlineCta: false,
  },
];

export const FAQ_CATEGORY_GROUPS: readonly FaqCategoryGroup[] = [
  {
    id: "pricing-booking",
    title: "Pricing & booking",
    description: "Costs, payment timing, and scheduling.",
    items: [
      {
        id: "pb-quote",
        question: "How do I get an accurate quote?",
        lead: "Enter your address, rooms, bathrooms, service tier, and add-ons online—the total updates instantly before you pay.",
        paragraphs: [
          "That locked figure is what you approve before dispatch—adjust selections until it matches your visit.",
          "Start here: [Get your exact price](/book).",
        ],
        keywords: ["quote", "estimate", "total", "checkout"],
        showInlineCta: true,
      },
      {
        id: "pb-pay",
        question: "When do I pay?",
        lead: "You pay securely online when you confirm the booking—after you’ve reviewed scope and price.",
        paragraphs: [
          "You’ll receive confirmation details by email, including what was selected for the crew.",
        ],
        keywords: ["payment", "pay", "card", "invoice"],
      },
      {
        id: "pb-schedule",
        question: "Can I reschedule?",
        lead: "Yes—use your confirmation flow or contact support as early as possible so we can re-route fairly.",
        paragraphs: [
          "Late changes may be limited by cleaner assignments—human support can advise on the best option.",
        ],
        keywords: ["reschedule", "change date", "move booking"],
      },
    ],
  },
  {
    id: "services-included",
    title: "Services & what's included",
    description: "Standard, deep, move-out, and short-stay scopes.",
    items: [
      {
        id: "svc-deep-vs-standard",
        question: "What's the difference between standard and deep cleaning?",
        lead: "Standard cleaning maintains a lighter weekly baseline; deep cleaning allocates extra time to detail zones like grout, appliance fronts, and built-up grease or limescale.",
        paragraphs: [
          `Read the full deep scope on our [deep cleaning guide](${DEEP}), then compare with [standard cleaning](${STD}).`,
        ],
        keywords: ["deep", "standard", "difference", "vs"],
        showInlineCta: true,
      },
      {
        id: "svc-moveout",
        question: "What's included in move-out cleaning?",
        lead: "Move-out cleaning targets handover-ready kitchens, bathrooms, floors, and the wet zones agents photograph—scope is driven by what you select online.",
        paragraphs: [
          `Pair expectations with our [move-out cleaning guide](${MOVE}) before you confirm ovens, fridges, and cupboards.`,
        ],
        bullets: [
          "Inventory photography cares about bathrooms, edges, and appliances you explicitly add.",
          "Add parking and access notes for estates or multi-level homes.",
        ],
        keywords: ["move out", "deposit", "landlord", "inspection"],
        showInlineCta: true,
      },
      {
        id: "svc-airbnb",
        question: "Do you clean Airbnb or short-stay units?",
        lead: "Yes—turnover-focused scopes prioritise presentation, hygiene, and speed between guests.",
        paragraphs: [`See [Airbnb cleaning](${AIRBNB}) for how we align notes with tight calendars.`],
        keywords: ["airbnb", "short stay", "guest", "turnover"],
      },
    ],
  },
  {
    id: "trust-safety",
    title: "Trust & safety",
    description: "Vetting, insurance, and satisfaction.",
    items: [
      {
        id: "trust-vetting",
        question: "Are cleaners vetted?",
        lead: "Yes—cleaners go through onboarding and reference checks suited to professional home visits.",
        paragraphs: [
          "Ratings and structured feedback after visits help us maintain consistent quality.",
        ],
        keywords: ["vetting", "background", "trust", "safe"],
      },
      {
        id: "trust-insurance",
        question: "Are you insured?",
        lead: "Shalean operates with coverage appropriate to professional home services—ask support if you need a formal certificate for your estate agent.",
        paragraphs: [
          "Always confirm scope in writing at checkout so expectations match the insured visit.",
        ],
        keywords: ["insurance", "insured", "liability"],
      },
      {
        id: "trust-satisfaction",
        question: "What if I'm not happy with the clean?",
        lead: "Contact us promptly with photos and specifics—we route structured support including redo paths where the scope was missed.",
        paragraphs: [
          "Fair outcomes depend on what was booked; disputed areas should match the checklist you confirmed.",
        ],
        keywords: ["complaint", "redo", "not happy", "refund"],
      },
    ],
  },
  {
    id: "logistics",
    title: "Logistics",
    description: "Timing, supplies, cancellations.",
    items: [
      {
        id: "log-duration",
        question: "How long does a clean take?",
        lead: "Visit length scales with rooms, bathrooms, tier, and add-ons—larger Southern Suburb homes and deep scopes need more crew time than compact flats.",
        paragraphs: [
          "The booking flow estimates duration from what you select; underestimating bathrooms or ovens is what stretches visits.",
        ],
        keywords: ["how long", "hours", "duration", "time"],
      },
      {
        id: "log-access",
        question: "What about parking, lifts, and access?",
        lead: "Add codes, boom gates, bay numbers, and pet notes in your booking so teams arrive prepared—not circling the block.",
        paragraphs: [
          "Suburb hubs like [Sea Point](/locations/sea-point-cleaning-services) spell out typical access patterns for coastal apartments.",
        ],
        keywords: ["parking", "access", "lift", "estate"],
      },
      {
        id: "log-cancel",
        question: "What's your cancellation policy?",
        lead: "Cancel or adjust as early as possible—fees depend on how close the visit is and whether a cleaner is already assigned.",
        paragraphs: [
          `Contact [support](mailto:${CUSTOMER_SUPPORT_EMAIL}) or [WhatsApp](${CUSTOMER_SUPPORT_WHATSAPP_URL}) for edge cases.`,
        ],
        keywords: ["cancel", "cancellation", "refund"],
      },
    ],
  },
];

export function flattenAllFaqItems(): FaqStructuredItem[] {
  return [...FAQ_FEATURED, ...FAQ_CATEGORY_GROUPS.flatMap((g) => g.items)];
}
