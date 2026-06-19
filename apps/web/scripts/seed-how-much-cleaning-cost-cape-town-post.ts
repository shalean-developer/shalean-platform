/**
 * Commercial SEO post: Cape Town cleaning costs (2026).
 * Slug avoids cannibalization with marketing hub `/cleaning-prices-cape-town`.
 *
 * Row conventions match other `blog_posts` guides in `supabase/migrations/2026089*_*.sql`:
 * `source: programmatic`, `search_intent: informational`, booking CTAs use `/book`.
 *
 *   npx tsx scripts/seed-how-much-cleaning-cost-cape-town-post.ts
 *   npx tsx scripts/seed-how-much-cleaning-cost-cape-town-post.ts --dry-run
 */

import "./load-apps-web-env";

import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { countWordsInContent } from "@/lib/blog/seo/publish-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const dryRun = process.argv.includes("--dry-run");

/** Canonical blog slug (informational); marketing conversion page stays `/cleaning-prices-cape-town`. */
const SLUG = "how-much-does-cleaning-cost-cape-town";

/** Earlier draft slug — migrated on upsert so one row remains. */
const LEGACY_SLUG = "cleaning-prices-cape-town";

const content_json = {
  schema_version: 1 as const,
  blocks: [
    {
      type: "intro" as const,
      content:
        "If you have been comparing cleaning prices in Cape Town and still feel unsure what is fair, you are not alone. This guide explains typical house cleaning costs, what moves the price up or down, and how to book without surprises.",
    },
    {
      type: "quick_answer" as const,
      content:
        "💡 Quick Answer:\nCleaning services in Cape Town typically cost between R250 and R2000 depending on the type of cleaning, home size, and condition. Standard cleaning starts from around R250, while deep cleaning and move-out cleaning can range from R500 to R2000.",
    },
    {
      type: "paragraph" as const,
      content:
        "At Shalean Cleaning Services, we provide transparent, upfront pricing across Cape Town suburbs including Sea Point, Claremont, and Gardens.",
    },
    {
      type: "paragraph" as const,
      content:
        "👉 Get an instant quote and book online in under 2 minutes: [Book now](/book).",
    },
    {
      type: "paragraph" as const,
      content:
        "Cape Town’s mix of apartments, freestanding homes, and short-stay units means “average” pricing can swing widely. The fastest way to cut through the noise is to separate **service type** (standard vs deep vs move-out), **home size**, and **extras**—then compare providers who show clear totals before dispatch.",
    },
    {
      type: "paragraph" as const,
      content:
        "Windborne dust near the coast, seasonal pollen inland, and high-traffic kitchens during hosting months all change how long a realistic clean takes—so treat any single number you hear at a braai as anecdotal until it is matched to your rooms, finishes, and last clean date.",
    },
    {
      type: "heading" as const,
      level: 2 as const,
      content: "Average Cleaning Prices in Cape Town",
    },
    {
      type: "paragraph" as const,
      content:
        "Use the ranges below as a planning baseline for professional home cleaning in Cape Town. Your quote should reflect bedrooms, bathrooms, interior square metres (where relevant), and how long it has been since the last thorough clean.",
    },
    {
      type: "comparison_table" as const,
      columns: ["Service type", "Typical price range", "When households usually book it"],
      rows: [
        ["Standard cleaning", "R250 – R500", "Regular upkeep after work weeks and busy family schedules"],
        ["Deep cleaning", "R500 – R1500", "Seasonal resets, post-renovation dust, or kitchens and bathrooms needing extra attention"],
        ["Move-out cleaning", "R800 – R2000", "End-of-lease handovers when cupboards, appliances, and fixtures must pass inspection"],
      ],
    },
    {
      type: "paragraph" as const,
      content:
        "If your priority is predictable totals, pair this table with service pages that explain scope—start with [standard cleaning in Cape Town](/services/standard-cleaning-cape-town) for weekly-style visits and [deep cleaning in Cape Town](/services/deep-cleaning-cape-town) when you need a full reset.",
    },
    {
      type: "paragraph" as const,
      content:
        "Want suburb-by-suburb context before you commit? Browse coverage on our [Cape Town cleaning services overview](/cleaning-services-cape-town), then return here to compare pricing bands with your address in mind.",
    },
    {
      type: "heading" as const,
      level: 2 as const,
      content: "What Affects Cleaning Costs?",
    },
    {
      type: "paragraph" as const,
      content:
        "Reliable cleaners price honestly because time-on-site is the main driver. In Atlantic Seaboard apartments, Southern Suburbs family homes, and CBD lock-up-and-go units, the same named service can still take different hours.",
    },
    {
      type: "bullet_list" as const,
      title: "The biggest price movers",
      items: [
        "Size and layout: more bedrooms and bathrooms usually mean more sanitising, detailing, and floor time.",
        "Condition and build-up: grease, lime scale, pet hair, and neglected grout extend scrubbing time considerably.",
        "Extras and access: inside ovens and fridges, interior windows, balcony rails, or tricky parking can add scope.",
        "Frequency: first visits often cost more because crews establish a baseline; recurring cleans can stabilise spend.",
      ],
    },
    {
      type: "paragraph" as const,
      content:
        "When you book online, add accurate notes about pets, stairs, load shedding considerations, and parking—those details prevent mid-job scope creep and protect both you and the cleaning team.",
    },
    {
      type: "paragraph" as const,
      content:
        "If you are budgeting monthly, multiply your chosen cadence by the realistic per-visit band above, then add one deep clean per quarter for kitchens and wet areas—most Cape Town households find that rhythm balances sparkle with spend.",
    },
    {
      type: "heading" as const,
      level: 2 as const,
      content: "Standard vs Deep Cleaning",
    },
    {
      type: "paragraph" as const,
      content:
        "Standard cleaning keeps a home consistently liveable: kitchens and bathrooms sanitised, surfaces dusted, floors vacuumed and mopped, and bins emptied—ideal when you want dependable weekly or fortnightly support.",
    },
    {
      type: "paragraph" as const,
      content:
        "Deep cleaning targets accumulated grime and detail work—think skirting boards, cupboard fronts, appliance exteriors, shower buildup, and thorough dusting of neglected zones. It costs more because it is slower and more chemical-and-tool intensive.",
    },
    {
      type: "paragraph" as const,
      content:
        "Still deciding? If you are prepping for guests, a rental inspection, or a seasonal refresh, deep cleaning usually pays for itself in time saved. For maintenance after that reset, switch back to [standard cleaning](/services/standard-cleaning-cape-town) to protect your monthly budget.",
    },
    {
      type: "heading" as const,
      level: 2 as const,
      content: "Hourly vs Fixed Pricing",
    },
    {
      type: "paragraph" as const,
      content:
        "Hourly rates can look simple, but they hide uncertainty—you only know the final bill after the clock stops. Fixed pricing tied to a confirmed checklist gives you a defendable number before anyone arrives, which is why conversion-focused Cape Town households increasingly prefer quote-first booking flows.",
    },
    {
      type: "paragraph" as const,
      content:
        "Ask any provider how they handle overruns: do they confirm extras in writing, and can you adjust scope without penalty? Transparency matters more than a catchy hourly sticker price.",
    },
    {
      type: "paragraph" as const,
      content:
        "At Shalean we bias toward quote-first flows because commercial buyers—landlords, busy parents, and professionals booking between meetings—need certainty. You should always know what “done” includes before a team drives to Sea Point, Claremont, or Constantia.",
    },
    {
      type: "heading" as const,
      level: 2 as const,
      content: "How to Choose the Right Cleaning Service",
    },
    {
      type: "paragraph" as const,
      content:
        "Commercial-intent readers are not hunting trivia—they want proof, reliability, and an easy path to checkout. Use this checklist before you press “book”.",
    },
    {
      type: "bullet_list" as const,
      items: [
        "Reviews and consistency: look for patterns across Google feedback—punctuality, thoroughness, communication—not one glowing anecdote.",
        "Vetting and professionalism: insured, trained teams with clear escalation paths beat informal cash-only arrangements.",
        "Cancellation and rescheduling policies: life in Cape Town shifts quickly; fair policies signal operational maturity.",
        "Secure payment: paying after scope confirmation reduces disputes and protects both sides.",
      ],
    },
    {
      type: "paragraph" as const,
      content:
        "When you are ready to compare suburbs and services side by side, anchor your research with our [Cape Town locations hub](/cleaning-services-cape-town)—it links local context back to the exact booking paths on this site.",
    },
    {
      type: "paragraph" as const,
      content:
        "Finally, align expectations with access: complexes with lift codes, estates with strict contractor rules, or homes with alarm systems need five extra minutes at check-in—booking platforms that capture those nuances produce fewer cancelled slots and cleaner outcomes.",
    },
    {
      type: "paragraph" as const,
      content:
        "You should not need three phone calls and a spreadsheet to understand house cleaning costs in Cape Town. Pick your service, confirm your address details, and lock a total that matches the checklist—then meet vetted cleaners who arrive prepared.",
    },
    {
      type: "paragraph" as const,
      content:
        "Hosts juggling Airbnb changeovers should pair pricing discipline with turnover templates—document linen swaps, stock checks, and priority surfaces so each quote stays apples-to-apples even when guest schedules slide.",
    },
    {
      type: "paragraph" as const,
      content:
        "👉 Get an instant quote and book online in under 2 minutes: [Book cleaning online](/book). Want a heavier reset first? Open [deep cleaning](/services/deep-cleaning-cape-town); for upkeep after that visit, bookmark [standard cleaning](/services/standard-cleaning-cape-town).",
    },
    {
      type: "faq" as const,
      omit_section_heading: false,
      items: [
        {
          question: "How much does a cleaner cost per hour in Cape Town?",
          answer:
            "Most cleaners charge between R100–R200 per hour depending on experience and services included. Many households still prefer a fixed quote per visit so the total is locked before the team arrives—especially for deep or move-out work.",
        },
        {
          question: "Is deep cleaning worth it?",
          answer:
            "Yes. Deep cleaning is ideal for first-time bookings or homes that have not been cleaned in a while. It restores kitchens, bathrooms, and neglected surfaces before you switch back to lighter recurring visits.",
        },
        {
          question: "How long does cleaning take?",
          answer:
            "Standard cleaning usually takes 2–4 hours depending on the size of the home. Deep cleans and move-outs often run longer because detailing, cupboards, and fixtures need inspection-ready attention.",
        },
        {
          question: "Do supplies and equipment affect the price?",
          answer:
            "Usually they are bundled into professional quotes so teams arrive with tested products and tools. If you require hypoallergenic products or want crews to use your supplies, mention it during booking—small changes can affect time or materials.",
        },
        {
          question: "Can I trust online quotes for Cape Town cleaning services?",
          answer:
            "Trust quotes that translate bedrooms, bathrooms, and selected extras into a locked total before payment—not vague estimates. Pair that with verified reviews and clear reschedule policies for peace of mind.",
        },
      ],
    },
    {
      type: "internal_links" as const,
      title: "Helpful links",
      links: [
        { label: "Standard cleaning in Cape Town", url: "/services/standard-cleaning-cape-town" },
        { label: "Deep cleaning in Cape Town", url: "/services/deep-cleaning-cape-town" },
        { label: "Cape Town cleaning services by area", url: "/cleaning-services-cape-town" },
        { label: "Book a clean", url: "/book" },
      ],
    },
    {
      type: "cta" as const,
      title: "Book your cleaning service today",
      description:
        "Get an instant quote and book your cleaning service in Cape Town in under 2 minutes.",
      button_text: "Get instant quote",
      link: "/book",
      variant: "primary" as const,
    },
  ],
};

const excerpt =
  "Real 2026 cleaning costs in Cape Town: standard, deep, and move-out price bands, what changes your quote, and how to book trusted cleaners with totals locked upfront.";

async function main() {
  const parsed = blogContentJsonSchema.safeParse(content_json);
  if (!parsed.success) {
    console.error(parsed.error.flatten());
    process.exitCode = 1;
    return;
  }

  const words = countWordsInContent(parsed.data);
  console.log(`Word count (approx): ${words}`);
  if (words < 1200) {
    console.warn("Warning: content is under 1200 words—expand before publishing.");
  }

  if (dryRun) {
    console.log("Dry run — no database writes.");
    return;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error("Missing Supabase admin client (service role env).");
    process.exitCode = 1;
    return;
  }

  const reading_time_minutes = computeReadingTimeMinutes(parsed.data);

  const row = {
    slug: SLUG,
    title: "How Much Does Cleaning Cost in Cape Town? Why Quotes Vary (2026)",
    h1: "How Much Does Cleaning Cost in Cape Town? Why Quotes Vary (2026)",
    excerpt,
    status: "draft" as const,
    source: "programmatic" as const,
    published_at: null as string | null,
    meta_title: "How Cape Town Cleaning Quotes Work (2026) | Shalean",
    meta_description:
      "Why cleaning quotes vary in Cape Town: rooms, tier, condition, and scope. Compare totals fairly—see live from-prices on the cleaning prices hub before you book.",
    canonical_url: `/blog/${SLUG}`,
    featured_image_url: "/images/marketing/cape-town-house-cleaning-kitchen.webp",
    featured_image_alt: "Professional home cleaning service in a Cape Town residence",
    content_json: parsed.data,
    reading_time_minutes,
    primary_keyword: "how much does cleaning cost Cape Town",
    secondary_keywords: [
      "why cleaning quotes vary",
      "standard vs deep cleaning cost",
      "how cleaners estimate time",
    ],
    search_intent: "informational",
    noindex: false,
  };

  const [{ data: legacy }, { data: current }] = await Promise.all([
    admin.from("blog_posts").select("id").eq("slug", LEGACY_SLUG).maybeSingle(),
    admin.from("blog_posts").select("id").eq("slug", SLUG).maybeSingle(),
  ]);

  const targetId = current?.id ?? legacy?.id;

  if (targetId) {
    const { error } = await admin.from("blog_posts").update(row).eq("id", targetId);
    if (error) {
      console.error("Update failed:", error.message);
      process.exitCode = 1;
      return;
    }
    console.log(`Upserted draft: ${SLUG} (id ${targetId})${legacy?.id && !current?.id ? ` — migrated slug from ${LEGACY_SLUG}` : ""}`);
  } else {
    const { data, error } = await admin.from("blog_posts").insert(row).select("id,slug").single();
    if (error) {
      console.error("Insert failed:", error.message);
      process.exitCode = 1;
      return;
    }
    console.log(`Inserted draft: ${SLUG}`, data);
  }
}

main();
