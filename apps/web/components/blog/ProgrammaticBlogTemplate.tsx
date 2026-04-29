import Link from "next/link";
import {
  getNearbySuburbsForProgrammaticPost,
  getProgrammaticFaqEntities,
  programmaticServiceLabel,
  type ProgrammaticPost,
} from "@/lib/blog/programmaticPosts";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";

const SERVICE_PATH_KEY = {
  deep: "deep-cleaning-cape-town",
  standard: "standard-cleaning-cape-town",
  airbnb: "airbnb-cleaning-cape-town",
  "move-out": "move-out-cleaning-cape-town",
  carpet: "carpet-cleaning-cape-town",
} as const;

const proseArticle =
  "prose prose-zinc max-w-3xl prose-headings:scroll-mt-24 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline";

const ctaBtnClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700";

const h1Class =
  "text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.35rem] lg:leading-tight";

function servicePath(service: ProgrammaticPost["service"]): string {
  return CAPE_TOWN_SERVICE_SEO[SERVICE_PATH_KEY[service]].path;
}

function whatIsHeading(loc: string, service: ProgrammaticPost["service"]): string {
  const phrase: Record<ProgrammaticPost["service"], string> = {
    deep: "deep cleaning",
    standard: "standard cleaning",
    airbnb: "Airbnb cleaning",
    "move-out": "move-out cleaning",
    carpet: "carpet cleaning",
  };
  return `What is ${phrase[service]} in ${loc}?`;
}

export function ProgrammaticBlogTemplate({ post }: { post: ProgrammaticPost }) {
  const loc = post.location ?? "Cape Town";
  const svc = programmaticServiceLabel(post.service);
  const svcPath = servicePath(post.service);
  const nearby = getNearbySuburbsForProgrammaticPost(post.location);

  const deep = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const standard = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const airbnb = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  const moveOut = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const carpet = CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path;
  const office = CAPE_TOWN_SERVICE_SEO["office-cleaning-cape-town"].path;

  return (
    <>
      <div className="not-prose mb-8">
        <h1 className={h1Class}>{post.h1}</h1>
      </div>

      <div className={proseArticle}>
        <p className="lead text-lg text-zinc-700">
          {loc} sits in the middle of real Cape Town life—rentals, Airbnb turnover, school-week traffic, and homes that
          pick up coastal dust fast. This page explains how professional {svc} works here, what is typically included,
          and how to{" "}
          <GrowthCtaLink
            href="/booking?step=entry"
            source={`blog_programmatic_${post.slug}_intro`}
            className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-700"
          >
            check pricing and availability instantly
          </GrowthCtaLink>{" "}
          for your address.
        </p>
        <p>
          If you are comparing tiers city-wide, start with our{" "}
          <Link href="/blog/deep-vs-standard-cleaning-cape-town">deep vs standard cleaning guide</Link>, then return here
          for {loc}-specific context. Service scope for{" "}
          <Link href={svcPath}>{svc} in Cape Town</Link> always follows what you select during booking—this article sets
          expectations before you lock a slot.
        </p>

        <h2>{whatIsHeading(loc, post.service)}</h2>
        <p>
          On a typical visit to {loc}, {svc} focuses on the outcomes you book online: {describeInclude(post)}. Crews plan
          time around Western Cape realities—wind-blown grit, compact apartments near the CBD, and family homes in the
          Southern Suburbs that need predictable wet-area work.
        </p>
        <ul>
          <li>Scope is confirmed from bedrooms, bathrooms, and add-ons—not postcode alone.</li>
          <li>Access and parking notes for {loc} reduce delays so more minutes go to cleaning.</li>
          <li>
            Bundling with <Link href={deep}>deep cleaning</Link>, <Link href={standard}>standard cleaning</Link>,{" "}
            <Link href={carpet}>carpet cleaning</Link>, or <Link href={office}>office cleaning in Cape Town</Link> is
            available when your home or workspace needs more than one focus in a single trip.
          </li>
        </ul>

        <h2>When to use it</h2>
        <p>{whenBookBody(post)}</p>
        <p>
          Busy households, student digs, and furnished rentals around {loc} often align cleans with handovers, guests,
          or inspection calendars—book early in peak season when slots tighten across Cape Town.
        </p>

        <h2>Why choose professional cleaners</h2>
        <p>{whyProBody(post)}</p>
        <p>
          Compare{" "}
          <Link href={deep}>deep cleaning services in Cape Town</Link> and{" "}
          <Link href={standard}>standard cleaning services in Cape Town</Link> when you need a quick tier check before
          booking for {loc}.
        </p>
        <p>
          Shalean uses vetted cleaners and clear checklists so you are not guessing what &quot;done&quot; means. Read{" "}
          <Link href="/blog/cleaning-cost-cape-town">how cleaning pricing works in Cape Town</Link> if you want ranges
          before you open the booking flow.
        </p>

        <h2>Same-day availability</h2>
        <p>{sameDayBody(post)}</p>
        <p>
          <GrowthCtaLink
            href="/booking?step=entry"
            source={`blog_programmatic_${post.slug}_same_day`}
            className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-700"
          >
            Book your cleaning online
          </GrowthCtaLink>{" "}
          to see live availability for {loc}—adjust bedrooms, bathrooms, and extras until the quote matches what you
          need.
        </p>
        <div className="not-prose my-8 rounded-2xl border border-blue-100 bg-blue-50/60 p-6 text-center">
          <GrowthCtaLink
            href="/booking?step=entry"
            source={`blog_programmatic_${post.slug}_cta`}
            className={ctaBtnClass}
          >
            Check pricing and availability instantly
          </GrowthCtaLink>
        </div>

        <h2>Areas near {loc} we also serve</h2>
        <p>
          Teams working in {loc} regularly support nearby suburbs including {nearby.join(", ")}, and wider Cape Town
          routes when scheduling allows. Mention your exact complex or street notes during booking so arrival and loading
          stay smooth.
        </p>
        <p>
          Explore dedicated hubs when you need suburb-level context:{" "}
          <Link href="/locations/claremont-cleaning-services">Claremont cleaning</Link>,{" "}
          <Link href="/locations/rondebosch-cleaning-services">Rondebosch cleaning</Link>, and{" "}
          <Link href="/locations/wynberg-cleaning-services">Wynberg cleaning</Link>—plus{" "}
          <Link href={moveOut}>move-out cleaning in Cape Town</Link> and{" "}
          <Link href={airbnb}>Airbnb cleaning in Cape Town</Link> for adjacent use cases.
        </p>

        <h2>Frequently asked questions</h2>

        {getProgrammaticFaqEntities(post).map((item, i) => (
          <div key={i}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}

        <p>
          For service-specific scope, open{" "}
          <Link href={svcPath}>{svc} in Cape Town</Link> and cross-check add-ons—oven, fridge, carpet bundles, or{" "}
          <Link href={airbnb}>Airbnb turnover</Link> tasks when that matches how you use the home.
        </p>
      </div>
    </>
  );
}

function describeInclude(post: ProgrammaticPost): string {
  const byService: Record<ProgrammaticPost["service"], string> = {
    deep: "detail-focused kitchen and bathroom work, reachable dusting, hard-floor care, and add-ons you select such as oven or fridge interiors",
    standard:
      "repeatable upkeep on kitchens, bathrooms, dusting, and floors so the home stays livable between deeper resets",
    airbnb:
      "guest-ready turnover resets: wet areas, floors, presentation, linen where agreed, and supplies staged for the next check-in",
    "move-out":
      "inspection-led kitchens, bathrooms, floors, and high-touch surfaces aligned with typical Western Cape rental expectations",
    carpet: "agreed carpeted rooms and traffic lanes, with optional bundling alongside standard or deep home cleaning",
  };
  return byService[post.service];
}

function whenBookBody(post: ProgrammaticPost): string {
  const loc = post.location ?? "Cape Town";
  const parts: Record<ProgrammaticPost["service"], string> = {
    deep: `Book deep cleaning in ${loc} when kitchens or bathrooms need more dwell time than a standard visit allows, before guests, or after a long gap without professional help.`,
    standard: `Book standard cleaning in ${loc} when you want dependable weekly or fortnightly upkeep without paying for full detail work every time.`,
    airbnb: `Book Airbnb cleaning in ${loc} when turnovers must be guest-ready on a clock—especially same-day changeovers near the Atlantic Seaboard or CBD corridors.`,
    "move-out": `Book move-out cleaning in ${loc} once furniture is out and you are aligning to agent or landlord inspection photos—usually 24–48 hours before handover.`,
    carpet: `Book carpet cleaning in ${loc} after high-traffic weeks, pet-heavy months, or alongside a deep visit when soft floors need their own time allocation.`,
  };
  return parts[post.service];
}

function whyProBody(post: ProgrammaticPost): string {
  const loc = post.location ?? "Cape Town";
  return `Professional cleaners reduce rework: checklists match what ${loc} homes actually need, from rental sand to bathroom limescale, and teams arrive with the supplies to execute the scope you confirmed online.`;
}

function sameDayBody(post: ProgrammaticPost): string {
  const loc = post.location ?? "Cape Town";
  const parts: Record<ProgrammaticPost["service"], string> = {
    deep: `Same-day deep cleaning in ${loc} is limited by job length—large homes or heavy add-ons may need a scheduled day with more crew time.`,
    standard: `Same-day standard cleaning in ${loc} is often easier to place than deep or move-out work; still, book as early as you can on busy weekends.`,
    airbnb: `Same-day Airbnb cleaning in ${loc} hinges on checkout time, listing size, and cleaner availability—accurate bedroom and bathroom counts prevent rushed visits.`,
    "move-out": `Same-day move-out cleaning in ${loc} usually requires the unit to be empty and keys timing confirmed; agents often prefer photos from the cleaning day.`,
    carpet: `Same-day carpet cleaning in ${loc} depends on how many carpeted areas you select and whether the slot follows another long job that day.`,
  };
  return parts[post.service];
}
