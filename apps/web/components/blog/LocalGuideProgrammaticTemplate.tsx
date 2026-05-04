import Link from "next/link";
import {
  getLocalGuideEditorialCrossLinks,
  hubAreaKebabFromHubSlug,
  getNearbySuburbsForProgrammaticPost,
  getProgrammaticFaqEntities,
  programmaticBlogHrefIfExists,
  LOCAL_GUIDE_DOC_ANCHOR_IDS,
  type ProgrammaticPost,
} from "@/lib/blog/programmaticPosts";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { capeTownLocationRowFromPlaceName, type CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { directAnswerHowMuchDoesCleaningCost } from "@/lib/seo/location-featured-snippet-copy";
import { getStructuredPricingForLocation } from "@/lib/seo/location-pricing-structured";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { hubSlugFromPlaceName, locationHubHrefFromPlaceName } from "@/lib/seo/location-hub-from-blog";

const proseArticle =
  "prose prose-lg prose-zinc mx-auto w-full max-w-[65ch] prose-headings:scroll-mt-28 prose-headings:font-bold prose-headings:text-zinc-900 prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline prose-li:marker:text-blue-600";

const ctaBtnClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700";

type GuideRegionTone = "seaboard" | "southern_suburbs" | "city_bowl" | "northern" | "general";

function guideRegionTone(loc: string): GuideRegionTone {
  if (loc === "Sea Point" || loc === "Green Point") return "seaboard";
  if (["Claremont", "Rondebosch", "Wynberg", "Constantia", "Observatory", "Newlands"].includes(loc))
    return "southern_suburbs";
  if (loc === "Gardens") return "city_bowl";
  if (loc === "Durbanville") return "northern";
  return "general";
}

/** Intent guides (pricing / best services / apartment tips) — links bidirectionally to `/locations/[slug]` hubs. */
export function LocalGuideProgrammaticTemplate({ post }: { post: ProgrammaticPost }) {
  const loc = post.location ?? "Cape Town";
  const variant = post.guideVariant;
  const tone = guideRegionTone(loc);
  const editorialCrossLinks = getLocalGuideEditorialCrossLinks(post);
  const nearby = getNearbySuburbsForProgrammaticPost(post.location);
  const hubHref = locationHubHrefFromPlaceName(post.location);
  const deep = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const standard = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const airbnb = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
  const moveOut = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;

  const nearbyHubPieces: { name: string; href: string }[] = [];
  const seen = new Set<string>();
  if (hubHref) {
    nearbyHubPieces.push({ name: loc, href: hubHref });
    seen.add(hubHref);
  }
  for (const n of nearby) {
    const href = locationHubHrefFromPlaceName(n);
    if (href && !seen.has(href)) {
      nearbyHubPieces.push({ name: n, href });
      seen.add(href);
    }
    if (nearbyHubPieces.length >= 6) break;
  }

  const pricingLocationRow = variant === "pricing" ? capeTownLocationRowFromPlaceName(loc) : null;
  const hubSlugForPricing = hubSlugFromPlaceName(post.location);

  const variantBody =
    variant === "pricing"
      ? pricingCopy(loc, standard, deep, tone, pricingLocationRow)
      : variant === "best_services"
        ? bestServicesCopy(loc, standard, deep, airbnb, moveOut, tone)
        : variant === "apartment_tips"
          ? apartmentTipsCopy(loc, standard, deep, airbnb, tone)
          : variant === "cleaning_frequency"
            ? cleaningFrequencyCopy(loc, standard, deep, airbnb, tone)
            : variant === "deep_checklist"
              ? deepChecklistCopy(loc, standard, deep, airbnb, tone)
              : variant === "move_out_cost"
                ? moveOutCostCopy(loc, standard, deep, airbnb, moveOut, tone)
                : apartmentTipsCopy(loc, standard, deep, airbnb, tone);

  return (
    <>
      <div className={proseArticle}>
        <p className="lead text-lg leading-relaxed text-zinc-700">{variantBody.lead}</p>

        {hubHref ? (
          <p>
            Start from the{" "}
            <Link href={hubHref}>cleaning services in {loc}</Link> hub for suburb FAQs, illustration pricing, and booking
            CTAs—this article expands on long-tail searches only.
          </p>
        ) : null}

        <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.overview}>{variantBody.overviewHeading}</h2>
        {variantBody.overviewParas.map((t, i) => (
          <p key={`ov-${i}`}>{t}</p>
        ))}

        {variant === "pricing" && pricingLocationRow && hubHref ? (
          <LocalGuidePricingDeepDive
            locationRow={pricingLocationRow}
            loc={loc}
            hubHref={hubHref}
            deepPath={deep}
            moveOutCostHref={
              hubSlugForPricing
                ? programmaticBlogHrefIfExists(
                    `move-out-cleaning-cost-${hubAreaKebabFromHubSlug(hubSlugForPricing)}-cape-town`,
                  )
                : null
            }
          />
        ) : null}

        {editorialCrossLinks && editorialCrossLinks.relatedBlogs.length > 0 ? (
          <p>
            Related guides:{" "}
            {editorialCrossLinks.relatedBlogs.map((b, i) => (
              <span key={b.href}>
                {i > 0 ? (i === editorialCrossLinks.relatedBlogs.length - 1 ? " and " : ", ") : null}
                <Link href={b.href}>{b.label}</Link>
              </span>
            ))}
            . Compare scope on our{" "}
            <Link href={editorialCrossLinks.serviceHref}>{editorialCrossLinks.serviceLabel}</Link>, then use the{" "}
            <Link href={editorialCrossLinks.hubHref}>{loc} cleaning services hub</Link> for illustration pricing and FAQs.
          </p>
        ) : null}

        {variantBody.midHeading ? (
          <>
            <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.pricingDrivers}>{variantBody.midHeading}</h2>
            {variantBody.midParas?.map((t, i) => (
              <p key={`mid-${i}`}>{t}</p>
            ))}
          </>
        ) : null}

        {variant === "best_services" ? (
          <>
            <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.picking}>Picking the right service tier</h2>
            <ul>
              <li>
                <Link href={standard}>Standard cleaning</Link> for repeatable upkeep between busy weeks.
              </li>
              <li>
                <Link href={deep}>Deep cleaning</Link> when kitchens, bathrooms, or detail zones need more dwell time.
              </li>
              <li>
                <Link href={airbnb}>Airbnb cleaning</Link> for guest-ready turnovers on a clock.
              </li>
              <li>
                <Link href={moveOut}>Move-out cleaning</Link> when inspections or deposits are in play.
              </li>
            </ul>
          </>
        ) : null}

        <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.trust}>Trust signals &amp; red flags</h2>
        <p>{variantBody.trust}</p>
        <ul>
          <li>Insured, vetted teams—not informal cash-only operators.</li>
          <li>Quotes that itemise bedrooms, bathrooms, and add-ons—not mystery hourly maths.</li>
          <li>Support when something verifiably misses the agreed checklist.</li>
        </ul>
        <p>
          Avoid providers who refuse written scope, dodge parking/lift realities in {loc}, or pressure payment before you
          confirm totals online.
        </p>

        <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.book}>Locked totals before payment</h2>
        <p>
          Shalean shows an itemised total for Cape Town addresses before you pay—adjust rooms and extras until the price
          matches your visit, then confirm when it feels right.
        </p>
        <GrowthCtaLink
          href="/booking/details"
          source={`blog_programmatic_${post.slug}_cta`}
          blogAnalyticsPlacement={`${post.slug}_guide_book`}
          className={ctaBtnClass}
        >
          Check pricing &amp; live availability for {loc}
        </GrowthCtaLink>

        <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.nearby}>Suburb hub &amp; nearby areas</h2>
        <p>
          Bookmark{" "}
          {hubHref ? (
            <Link href={hubHref}>cleaning services in {loc}</Link>
          ) : (
            <Link href="/locations/cape-town-cleaning-services">Cape Town cleaning hubs</Link>
          )}{" "}
          for the shortest path from search → quote → booking.
        </p>
        <p>
          Nearby hubs with overlapping routing:{" "}
          {nearbyHubPieces.length > 0 ? (
            <>
              {nearbyHubPieces.map((item, i) => (
                <span key={item.href}>
                  {i > 0 ? (i === nearbyHubPieces.length - 1 ? ", and " : ", ") : null}
                  <Link href={item.href}>cleaning services in {item.name}</Link>
                </span>
              ))}
            </>
          ) : (
            <Link href="/locations/cape-town-cleaning-services">Cape Town overview</Link>
          )}
          .
        </p>

        <h2 id={LOCAL_GUIDE_DOC_ANCHOR_IDS.faq}>Frequently asked questions</h2>
        {getProgrammaticFaqEntities(post).map((item, i) => (
          <div key={i}>
            <h3>{item.question}</h3>
            <p>{item.answer}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function LocalGuidePricingDeepDive({
  locationRow,
  loc,
  hubHref,
  deepPath,
  moveOutCostHref,
}: {
  locationRow: CapeTownLocationRow;
  loc: string;
  hubHref: string;
  deepPath: string;
  moveOutCostHref: string | null;
}) {
  const structured = getStructuredPricingForLocation(locationRow);
  return (
    <>
      <div className="not-prose my-8 overflow-x-auto rounded-2xl border border-zinc-200 shadow-sm">
        <table className="w-full min-w-[480px] border-collapse text-left text-sm">
          <caption className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-left font-medium text-zinc-800">
            {structured.caption}
          </caption>
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100/90">
              <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                Home type
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                Standard cleaning (typical)
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-zinc-900">
                Deep cleaning (typical)
              </th>
            </tr>
          </thead>
          <tbody>
            {structured.rows.map((row) => (
              <tr key={row.homeType} className="border-b border-zinc-100 bg-white last:border-b-0">
                <th scope="row" className="px-4 py-3 font-medium text-zinc-900">
                  {row.homeType}
                </th>
                <td className="px-4 py-3 text-zinc-700">{row.standardCleaning}</td>
                <td className="px-4 py-3 text-zinc-700">{row.deepCleaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm leading-relaxed text-zinc-600">{structured.deepCleaningSummary}</p>
      <h2 id="loc-guide-price-factors">What affects price in {loc}?</h2>
      <ul>
        <li>Bedroom and bathroom counts—wet zones usually move crew hours faster than postcode alone.</li>
        <li>
          Service tier: recurring standard visits budget less time than deep resets or inventory-grade move-out scopes.
        </li>
        <li>Add-ons such as ovens, interior fridges, balconies, or carpet work—each should be itemised before payment.</li>
        <li>Access and parking in {loc}—booms, lifts, or narrow lanes belong in booking notes so arrivals target cleaning.</li>
      </ul>
      <p>
        Keep reading:{" "}
        {moveOutCostHref ? (
          <>
            <Link href={moveOutCostHref}>Move-out cleaning cost in {loc}</Link>
            {" · "}
          </>
        ) : null}
        <Link href={deepPath}>Deep cleaning service guide (Cape Town)</Link>
        {" · "}
        <Link href={hubHref}>{loc} cleaning hub</Link>
      </p>
    </>
  );
}

function pricingCopy(
  loc: string,
  standard: string,
  deep: string,
  tone: GuideRegionTone,
  pricingLocationRow: CapeTownLocationRow | null,
): {
  lead: string;
  overviewHeading: string;
  overviewParas: string[];
  midHeading: string;
  midParas: string[];
  trust: string;
} {
  const scopeHint =
    tone === "seaboard"
      ? "bedrooms, bathrooms, coastal dust load, lifts"
      : tone === "southern_suburbs"
        ? "bedrooms, bathrooms, school-run traffic pockets, and mixed apartments-or-houses"
        : tone === "city_bowl"
          ? "bedrooms, bathrooms, steep access, and older conversions"
          : tone === "northern"
            ? "bedrooms, bathrooms, estate gates, and larger floor plates"
            : "bedrooms, bathrooms, access notes, and layout";

  const overviewParas =
    tone === "seaboard"
      ? [
          `Atlantic Seaboard apartments often quote lower entry points for compact standard scopes, while deep visits climb when kitchens and bathrooms need restoration-level attention.`,
          `Use ${loc}-specific booking notes for parking, remotes, and balconies—those details prevent rushed visits that later show up as “extras”.`,
        ]
      : tone === "southern_suburbs"
        ? [
            `Southern Suburbs homes swing from Main Road flats to larger houses—deep visits jump when ovens, grout-heavy showers, and multiple bathrooms stack crew time.`,
            `Call out shared drives, lane parking, or school-week peaks so ${loc} quotes assume realistic arrivals—not optimistic street guesses.`,
          ]
        : tone === "city_bowl"
          ? [
              `City Bowl flats often carry tighter kitchens and stair-heavy access; deep scopes rise when detail zones sat too long between lighter standard rounds.`,
              `Pin intercoms, visitor discs, and rear entrances in booking notes—ambiguous access eats booked hours fast in ${loc}.`,
            ]
          : tone === "northern"
            ? [
                `Northern suburbs layouts skew larger; deep cleans stretch when multiple living zones and estate security checks add non-cleaning minutes.`,
                `Note boom gates and preferred service gates so ${loc} crews clear security without burning the slot you paid for.`,
              ]
            : [
                `${loc} pricing still anchors on honest bedroom and bathroom counts—deep work climbs faster than postcode alone when kitchens carry heavy use.`,
                `Itemise parking, pets, and appliance add-ons before payment so totals stay aligned with what crews can complete in one visit.`,
              ];

  const lead = pricingLocationRow
    ? `${directAnswerHowMuchDoesCleaningCost(pricingLocationRow)} The table below sketches typical planning bands—checkout still locks your itemised total before payment.`
    : `${loc} cleaning prices hinge on verifiable scope—${scopeHint}, plus whether you need standard upkeep versus a deep reset. This guide explains what moves quotes so you can compare providers fairly.`;

  return {
    lead,
    overviewHeading: `How cleaning prices work in ${loc}`,
    overviewParas,
    midHeading: `What moves quotes in ${loc}`,
    midParas: [
      `Bathroom count and kitchen intensity matter more than postcode alone—two full bathrooms and a busy stove change crew time faster than an extra bedroom you barely use.`,
      `Deep cleaning premiums usually reflect ovens, grout-adjacent zones, and reachable dust-downs after windy weeks—not a vague “deep” label.`,
      `Compare ${loc} providers on itemised totals: open our ${standard} and ${deep} guides, then return to booking once the tier matches your week.`,
    ],
    trust: `Transparent ${loc} cleaners publish scope boundaries—what is included by default, what is an add-on, and how redo support works—before you pay.`,
  };
}

function bestServicesCopy(
  loc: string,
  standard: string,
  deep: string,
  airbnb: string,
  moveOut: string,
  tone: GuideRegionTone,
): {
  lead: string;
  overviewHeading: string;
  overviewParas: string[];
  midHeading: string | null;
  midParas: string[] | null;
  trust: string;
} {
  const lead =
    tone === "seaboard"
      ? `The best cleaning services in ${loc} combine honest quoting with crews briefed for Seaboard realities—lifts, grit, and tight turnovers. Use this checklist before you shortlist operators.`
      : tone === "southern_suburbs"
        ? `The best cleaning services in ${loc} pair transparent quoting with crews used to Main Road congestion, mixed housing stock, and realistic parking windows—shortlist with this checklist.`
        : tone === "city_bowl"
          ? `The best cleaning services in ${loc} respect steep access and compact layouts—look for itemised quotes and punctuality themes before you book.`
          : tone === "northern"
            ? `The best cleaning services in ${loc} navigate estates calmly—choose operators who document scope and security-friendly arrivals, not rushed cash crews.`
            : `The best cleaning services in ${loc} combine honest quoting with crews briefed for local access realities. Use this checklist before you shortlist operators.`;

  const overviewLead =
    tone === "seaboard"
      ? `Strong operators itemise bedrooms and bathrooms, confirm add-ons, and show totals before dispatch—especially important for apartments with coastal wear.`
      : tone === "southern_suburbs"
        ? `Strong operators itemise bedrooms and bathrooms before dispatch—critical when ${loc} mixes student flats, freestanding houses, and tight weekday parking.`
        : tone === "northern"
          ? `Strong operators respect larger layouts—call out soft furnishings, secondary living zones, and security steps so totals match crew hours.`
          : `Strong operators itemise bedrooms and bathrooms, confirm add-ons, and show totals before dispatch—especially when ${loc} access or parking is tight.`;

  return {
    lead,
    overviewHeading: `How to choose cleaning services in ${loc}`,
    overviewParas: [
      overviewLead,
      `Read reviews for punctuality and kitchen/bathroom thoroughfare; generic five-star averages matter less than repeated themes across ${loc} visits.`,
      `Cross-check service guides—${standard}, ${deep}, ${airbnb}, and ${moveOut}—so language in quotes matches what you actually book.`,
    ],
    midHeading: null,
    midParas: null,
    trust: `Trusted ${loc} teams carry insurance suited to home visits, vet staff, and document scope so expectations stay aligned when agents or guests are involved.`,
  };
}

function apartmentTipsCopy(
  loc: string,
  standard: string,
  deep: string,
  airbnb: string,
  tone: GuideRegionTone,
): {
  lead: string;
  overviewHeading: string;
  overviewParas: string[];
  midHeading: string;
  midParas: string[];
  trust: string;
} {
  const lead =
    tone === "seaboard"
      ? `${loc} apartments battle coastal dust, compact kitchens, and lift logistics daily. These apartment cleaning tips keep professional visits efficient and quotes accurate.`
      : `${loc} apartments mix lifts with walk-ups—mud from corridors, compact kitchens, and visitor parking still shape realistic crew time. These tips keep quotes accurate.`;

  const accessPara =
    tone === "seaboard"
      ? `Note lift codes, loading bays, and visitor parking before checkout—Atlantic Seaboard arrivals stall fastest when access is ambiguous.`
      : `Note lift codes, basement tags, and visitor parking before checkout—${loc} arrivals stall fastest when pins or remotes are vague.`;

  return {
    lead,
    overviewHeading: `Apartment cleaning checklist for ${loc}`,
    overviewParas: [
      accessPara,
      `Call out balconies or patios only when you want them in scope; outdoor grit changes mop and vacuum time materially.`,
    ],
    midHeading: `Hosts & busy households`,
    midParas: [
      `Turnovers pair well with ${airbnb} scope language—linen handling, staging, and checkout timing should match what guests see online.`,
      `Between deeper resets, ${standard} cycles maintain kitchens and bathrooms; step up to ${deep} after guest-heavy stretches or before handovers.`,
    ],
    trust: `Professional ${loc} apartment cleans should never rely on guesswork—if a provider waves away bathroom counts or oven scope, keep shopping.`,
  };
}

function cleaningFrequencyCopy(
  loc: string,
  standard: string,
  deep: string,
  airbnb: string,
  tone: GuideRegionTone,
): {
  lead: string;
  overviewHeading: string;
  overviewParas: string[];
  midHeading: string;
  midParas: string[];
  trust: string;
} {
  const overviewParas =
    tone === "seaboard"
      ? [
          `Atlantic Seaboard dust and salt mist reset floors faster; biweekly ${standard}-style cycles keep wet areas photo-ready without burning budget.`,
          `Studios with lighter cooking may stretch toward monthly visits if you maintain surfaces between rounds—still schedule ${deep} resets seasonally.`,
        ]
      : tone === "southern_suburbs"
        ? [
            `Pollen seasons and winter mud from gardens reset entry floors faster in ${loc}; biweekly standard cycles usually beat monthly catch-up scrambles.`,
            `Larger kitchens near schools often need consistent bathroom resets—still schedule seasonal ${deep} visits before inspections or handovers.`,
          ]
        : [
            `High-use kitchens and bathrooms in ${loc} set the cadence—not a generic monthly rule copied from quieter suburbs.`,
            `Studios with lighter cooking may stretch toward monthly visits if you maintain surfaces between rounds—still schedule ${deep} resets seasonally.`,
          ];

  const trustOutdoor =
    tone === "seaboard"
      ? `balcony scope`
      : tone === "southern_suburbs"
        ? `parking notes and outdoor zones`
        : `access notes`;

  return {
    lead: `Cleaning frequency in ${loc} should match how hard your kitchen and bathrooms work—not a generic “monthly” rule copied from quieter suburbs.`,
    overviewHeading: `How often to book home cleaning in ${loc}`,
    overviewParas,
    midHeading: `Hosts and packed calendars`,
    midParas: [
      `${airbnb} turnovers follow checkout clocks—book per guest cycle and add buffer notes for linen or staging.`,
      `After high-traffic guest weeks, swap one standard slot for ${deep} so grout-adjacent zones and ovens catch up before the next calendar crunch.`,
    ],
    trust: `If an operator quotes ${loc} sight-unseen without bathroom counts or ${trustOutdoor}, your frequency plan will not match realistic crew time.`,
  };
}

function deepChecklistCopy(
  loc: string,
  standard: string,
  deep: string,
  airbnb: string,
  tone: GuideRegionTone,
): {
  lead: string;
  overviewHeading: string;
  overviewParas: string[];
  midHeading: string;
  midParas: string[];
  trust: string;
} {
  const outdoorMid =
    tone === "seaboard"
      ? `Balconies and sliding-door tracks collect grit fast—include them only when you want them inside scope.`
      : tone === "southern_suburbs"
        ? `Patios, stoep rails, and sliding-door tracks collect grit after storms—include them only when you want them inside scope.`
        : `Outdoor-adjacent tracks and sills collect grit—include them only when you want them inside scope.`;

  const trustOutdoor = tone === "southern_suburbs" ? `patios or balconies` : `balconies`;

  return {
    lead: `Use this deep cleaning checklist before ${loc} handovers, guest-heavy months, or whenever standard cycles stop catching up.`,
    overviewHeading: `Deep cleaning checklist for ${loc}`,
    overviewParas: [
      `Kitchens: stovetops, reachable cupboard fronts, sinks, and appliances you explicitly add (oven/fridge) should appear in your booking—not assumed.`,
      `Bathrooms: showers, toilets, vanities, mirrors, and floors; mention grout-heavy stalls if they need extra dwell time.`,
      `Living zones: hard floors, skirting-adjacent dust, and reachable cobwebs—cross-check the Cape Town deep cleaning guide so booking language matches what inspectors photograph.`,
    ],
    midHeading: `Outdoor-adjacent zones`,
    midParas: [
      outdoorMid,
      `Between deep visits, lighter ${standard} rounds maintain gains so you are not repeatedly paying restoration premiums.`,
      `Hosts blending ${airbnb} turnovers with deeper resets should align linen + staging notes with the checklist above.`,
    ],
    trust: `Deep cleans fail reviews when ovens, fridges, or ${trustOutdoor} were “expected” but never itemised—keep scope written before payment.`,
  };
}

function moveOutCostCopy(
  loc: string,
  standard: string,
  deep: string,
  airbnb: string,
  moveOut: string,
  tone: GuideRegionTone,
): {
  lead: string;
  overviewHeading: string;
  overviewParas: string[];
  midHeading: string;
  midParas: string[];
  trust: string;
} {
  const accessPara =
    tone === "seaboard"
      ? `Lift logistics and basement parking still apply; crews need accurate pins so scheduled time targets cleaning, not circling blocks.`
      : tone === "southern_suburbs"
        ? `Main Road peaks and shared-drive lanes still apply; crews need accurate pins so scheduled time targets cleaning, not hunting bays.`
        : `Parking and access notes still apply; crews need accurate pins so scheduled time targets cleaning, not circling blocks.`;

  return {
    lead: `Move-out cleaning cost in ${loc} reflects deposit photography—bedrooms and bathrooms matter, but ovens, fridges, and edges separate quotes.`,
    overviewHeading: `Move-out cleaning cost in ${loc}`,
    overviewParas: [
      `Inventory-led scopes need honest bathroom counts and cupboard interiors when agencies expect them—generic ${standard} language usually under-budgets handovers.`,
      accessPara,
    ],
    midHeading: `What raises or lowers your quote`,
    midParas: [
      `Add ovens, fridges, and inside cupboards explicitly when your checklist demands them—each increases realistic crew hours.`,
      `Compare ${moveOut} guidance with your lease annex so nothing critical is missing before inspectors arrive.`,
      `Short-stay operators crossing into deposit cleans should still separate ${airbnb} turnovers from inventory-grade ${deep} detail.`,
    ],
    trust: `Transparent ${loc} operators itemise move-out scope before payment—avoid anyone who promises “full deposit clean” without room counts.`,
  };
}
