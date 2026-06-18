import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { AirbnbHostGuidePost } from "@/lib/blog/airbnbHostGuidePosts";
import { AIRBNB_SERVICE_HREF, getAirbnbGuideCrossLinkBundle } from "@/lib/blog/airbnbHostGuideCrossLinks";
import {
  CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF,
  CANONICAL_BEST_AIRBNB_TIPS_CAPE_TOWN_HREF,
  CANONICAL_DEEP_VS_STANDARD_BLOG_HREF,
} from "@/lib/blog/canonicalEditorialBlogLinks";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

/** Parent `BlogContent prose` supplies typography — avoid nested `prose` here. */
const articleStack = "mx-auto w-full";

const ctaBtnClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-8 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700";

const AIRBNB_SERVICE = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;
const BOOKING = "/book";

function NeedHelpCta() {
  return (
    <section className="not-prose my-10 rounded-2xl border border-blue-100 bg-blue-50/70 p-8 text-center">
      <h2 className="text-xl font-bold tracking-tight text-zinc-900">Need professional help?</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Lock turnover scope online and choose a slot that respects your check-out and check-in buffer.
      </p>
      <GrowthCtaLink
        href={AIRBNB_SERVICE}
        source="blog_airbnb_host_guide_service_cta"
        blogAnalyticsPlacement="airbnb_host_guide_professional_help"
        className={`${ctaBtnClass} mt-5`}
      >
        View Airbnb cleaning service
      </GrowthCtaLink>
      <p className="mt-4 text-sm text-zinc-600">
        Prefer to jump straight to pricing?{" "}
        <GrowthCtaLink
          href={BOOKING}
          source="blog_airbnb_host_guide_booking_cta"
          blogAnalyticsPlacement="airbnb_host_guide_booking_secondary"
          className="font-semibold text-blue-700 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-800"
        >
          Get instant price
        </GrowthCtaLink>
        {" · "}
        <GrowthCtaLink
          href={BOOKING}
          source="blog_airbnb_host_guide_availability"
          blogAnalyticsPlacement="airbnb_host_guide_availability"
          className="font-semibold text-blue-700 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-800"
        >
          Check availability
        </GrowthCtaLink>
      </p>
    </section>
  );
}

function ServiceAnchorParagraph() {
  return (
    <p>
      When you want crews aligned to guest expectations—not just a residential tidy—start from{" "}
      <SafeInternalLink href={AIRBNB_SERVICE}>airbnb cleaning services in cape town</SafeInternalLink> so bedrooms, bathrooms, and turnover extras
      match what your listing promises.
    </p>
  );
}

function AirbnbGuideCrossLinkFooter({ slug }: { slug: string }) {
  const bundle = getAirbnbGuideCrossLinkBundle(slug);
  if (!bundle) return null;
  return (
    <section className="not-prose my-12 rounded-2xl border border-zinc-200 bg-zinc-50/90 p-6">
      <h2 className="text-lg font-bold text-zinc-900">Keep exploring this cluster</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Anchor turnover decisions on our central{" "}
        <SafeInternalLink href={AIRBNB_SERVICE_HREF} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
          Airbnb cleaning Cape Town
        </SafeInternalLink>{" "}
        service hub—then pair suburb context from your location guide below with two related articles.
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {bundle.peerGuides.map((g) => (
          <li key={g.href}>
            <SafeInternalLink href={g.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              {g.label}
            </SafeInternalLink>
          </li>
        ))}
        <li>
          <SafeInternalLink href={bundle.locationHub.href} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            {bundle.locationHub.label}
          </SafeInternalLink>
        </li>
      </ul>
    </section>
  );
}

export function AirbnbHostGuideBlogTemplate({ post }: { post: AirbnbHostGuidePost }) {
  const checklistHref = CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF;
  const costHref = "/blog/airbnb-cleaning-cost-cape-town";
  const prepareHref = "/blog/prepare-airbnb-for-cleaning";

  return (
    <div className={articleStack}>
      {post.slug === "airbnb-cleaning-checklist-cape-town" ? (
        <>
          <p className="lead text-lg leading-relaxed text-zinc-700">
            Cape Town turnovers compete on photos, reviews, and clock pressure—especially when Atlantic Seaboard humidity
            meets beach sand or when Southern Suburb gates slow the first ten minutes on site. This checklist keeps hosts
            aligned with crews so nothing obvious disappears between check-out and the next guest&apos;s first impression.
          </p>
          <ServiceAnchorParagraph />
          <p>
            Treat the checklist as a visual QA layer: walk the unit once as if you are taking booking photos again. If a
            zone would annoy you in wide-angle shots, it will annoy guests sooner—usually bathrooms, kitchen glare on
            counters, floor streaking, and cushions that read sloppy from the doorway.
          </p>

          <h2>Kitchen: reset that reads &quot;ready to cook&quot;</h2>
          <p>
            Run hob and sink first so grease does not migrate backwards onto finished counters. Empty bins, replace liners,
            and align dishwasher tabs where guests expect them. If you advertise coffee or snacks, surface-level neatness
            matters—sticky jars and mystery fridge smells tank ratings faster than a dusty shelf guests never photograph.
          </p>
          <ul>
            <li>Hob, splashbacks, and reachable appliance fronts degreased and dry.</li>
            <li>Sink polished; dried metal avoids immediate water spots in photos.</li>
            <li>Bins refreshed; recycling separated if your house manual promises it.</li>
          </ul>

          <h2>Bathrooms: hotel-fresh in twenty minutes of honest work</h2>
          <p>
            Guests forgive dated tiles—they rarely forgive hair in drains, streaked glass, or damp smells that hit them at
            the door. Mirror clarity and fixture sparkle carry disproportionate weight because smartphones amplify contrast.
          </p>
          <ul>
            <li>Toilet, basin, shower glass, and taps sanitised with dry-down on chrome.</li>
            <li>Floors vacuumed to edges before mopping—sand tracks everywhere after windy Cape weeks.</li>
            <li>Towels folded consistently with your gallery shots when linen service is on you.</li>
          </ul>

          <NeedHelpCta />

          <h2>Living areas and bedrooms: camera-ready calm</h2>
          <p>
            Straighten decor minimally—your listing style should repeat, not &quot;redecorate daily.&quot; Vacuum traffic
            lanes first; mop last on hard floors so footprints do not return during exit photos. Remote controls, cables,
            and throws belong in predictable places so reviews describe consistency instead of chaos.
          </p>

          <h2>Final walk-through before you release the calendar</h2>
          <p>
            Stand in the doorway of each room with your phone on wide angle. Adjust lighting if shadows exaggerate dust,
            confirm neutral scent, and verify consumables you advertise are visible—not hidden in cupboards guests never
            open during a two-night stay.
          </p>
          <p>
            Budgeting the week? Pair this checklist with{" "}
            <SafeInternalLink href={costHref}>how Airbnb cleaning cost works in Cape Town</SafeInternalLink>, then read{" "}
            <SafeInternalLink href={prepareHref}>how to prepare your Airbnb for cleaning between guests</SafeInternalLink> so access notes and
            supplies do not steal crew time.
          </p>
        </>
      ) : null}

      {post.slug === "airbnb-cleaning-cost-cape-town" ? (
        <>
          <p className="lead text-lg leading-relaxed text-zinc-700">
            Airbnb cleaning prices in Cape Town are not mysterious—they track bedrooms, bathrooms, realistic scrub time,
            and the extras you promise on your listing. What feels &quot;expensive&quot; is often just honest dwell time on
            kitchens and bathrooms after busy guest weeks.
          </p>
          <ServiceAnchorParagraph />
          <p>
            Use illustrative bands as planning tools only. Your locked total should always come from an online scope that
            counts wet rooms and add-ons—not from copying a neighbour&apos;s screenshot from another suburb with different
            parking and dust loads.
          </p>

          <h2>Baseline drivers hosts underestimate</h2>
          <p>
            Two bathrooms routinely need more crew minutes than one large bedroom. Balconies after windy stretches, pet
            hair seasons, and kitchens used heavily between stays all consume time that standard residential quotes rarely
            capture unless notes explain reality.
          </p>
          <ul>
            <li>
              <strong>Bedrooms &amp; bathrooms:</strong> Primary counters for quote accuracy—confirm counts before pay.
            </li>
            <li>
              <strong>Add-ons:</strong> Inside fridge, oven polish, linen staging, or deeper grout-adjacent work.
            </li>
            <li>
              <strong>Access:</strong> Estates, lifts, remote keys, and parking friction shrink effective on-site minutes.
            </li>
          </ul>

          <h2>Illustrative Cape Town turnover bands</h2>
          <p>
            Compact Atlantic Seaboard studios often fit lower illustrative bands when kitchens stay disciplined between
            guests. Family-sized Southern Suburb homes jump faster because bathrooms multiply and routing includes stairs,
            side gates, and school-week traffic around arrivals.
          </p>
          <p>
            After damage-heavy stays, budget a reset visit or accept that the next turnover needs longer dwell time—trying
            to compress serious mess into a minimum quote trains bad reviews, not savings.
          </p>

          <NeedHelpCta />

          <h2>How to lock an exact total without surprises</h2>
          <p>
            Enter address-level notes honestly—crew planning depends on it. Adjust bedrooms, bathrooms, and extras until
            the quote reflects what your listing photos promise. If you are comparing service tiers, revisit{" "}
            <SafeInternalLink href={CANONICAL_DEEP_VS_STANDARD_BLOG_HREF}>deep vs standard cleaning in Cape Town</SafeInternalLink> before you
            assume a turnover can absorb deferred kitchen build-up.
          </p>
          <p>
            Operational detail belongs alongside pricing: follow{" "}
            <SafeInternalLink href={checklistHref}>the Airbnb cleaning checklist for Cape Town hosts</SafeInternalLink> and{" "}
            <SafeInternalLink href={prepareHref}>prep steps between guests</SafeInternalLink> so your next quote matches how the unit actually
            behaves during peak season.
          </p>
        </>
      ) : null}

      {post.slug === "prepare-airbnb-for-cleaning" ? (
        <>
          <p className="lead text-lg leading-relaxed text-zinc-700">
            Preparation is how hosts buy back turnover minutes. Cape Town crews lose less time to access mysteries and
            supply hunts—meaning more of your booking goes to actual cleaning before the next guest rolls suitcases in.
          </p>
          <ServiceAnchorParagraph />
          <p>
            Think in three layers: access clarity, consumables visibility, and honest damage documentation. Skip any layer
            and you risk either a rushed reset or a dispute that spills into your calendar—not your cleaner&apos;s fault.
          </p>

          <h2>Access: instructions that survive real-world arrivals</h2>
          <p>
            Gate codes change. Batteries die. Parking bays move when neighbours swap cars. Refresh booking notes when any
            of those shift—especially before Friday turnovers when estates run peak visitor traffic.
          </p>
          <ul>
            <li>Exact entrance, intercom steps, and Wi-Fi only if needed for equipment.</li>
            <li>Parking bay labels plus photos when bays look identical after dark.</li>
            <li>Remote keys or lockbox codes tested after guest departure—not assumed.</li>
          </ul>

          <h2>Supplies and linen: make the invisible visible</h2>
          <p>
            If guests expect stocked detergents, toiletries, or spare bags, stage them where crews can replenish without
            opening private cupboards. Linen bundles should be labelled by bed count when swaps are booked—ambiguous piles
            waste the gap you paid for.
          </p>

          <NeedHelpCta />

          <h2>Damage and inventory: photograph before the mop touches tile</h2>
          <p>
            Walk high-risk zones first: dining tables, countertops, electronics, and bathrooms. Timestamp photos protect
            deposits and keep turnover scope focused on cleaning—not forensic debates mid-slot.
          </p>

          <h2>Calendar hygiene</h2>
          <p>
            Buffer realistic gaps between check-out and check-in when coastal humidity slows floor drying or when lifts
            bottleneck midday. If calendars lie, cleaners inherit impossible promises—and guests inherit disappointment.
          </p>
          <p>
            Pair prep with{" "}
            <SafeInternalLink href={checklistHref}>the Cape Town Airbnb cleaning checklist</SafeInternalLink> and{" "}
            <SafeInternalLink href={costHref}>cost guidance for turnovers</SafeInternalLink> so budgets and expectations stay aligned through peak
            weeks.
          </p>
        </>
      ) : null}

      {post.slug === "best-airbnb-cleaning-tips-cape-town" ? (
        <>
          <p className="lead text-lg leading-relaxed text-zinc-700">
            Cape Town hosts win or lose on fast optics: bathrooms that photograph bright, kitchens that smell neutral on
            check-in, and floors that survive wide-angle shots. These tips prioritise review-heavy zones first—without
            pretending a turnover can absorb deferred deep work forever.
          </p>
          <ServiceAnchorParagraph />
          <p>
            Start wet-to-dry in kitchens: hob and sink before counters, then bins, then floors—otherwise grease migrates
            backwards onto finished surfaces. In Atlantic Seaboard apartments, add door tracks and balcony thresholds early;
            sand returns overnight after Promenade walks even when guests swear they wiped feet.
          </p>
          <h2>Tip stack: bathrooms before lounge fluff</h2>
          <p>
            Mirrors, glass, and chrome carry disproportionate weight in smartphone photos—dry chrome properly so spots do
            not bloom an hour later when humidity spikes. Hair in drains still tops complaint lists; vacuum edges before
            mopping so grit does not streak into grout lines.
          </p>
          <p>
            Cross-check cadence with{" "}
            <SafeInternalLink href="/blog/how-often-to-clean-airbnb-cape-town">how often to clean an Airbnb in Cape Town</SafeInternalLink> before
            you assume bi-weekly “touch-ups” replace full turnovers between paying guests.
          </p>
          <NeedHelpCta />
          <h2>Brief access like a logistics partner—not a mystery guest</h2>
          <p>
            Intercom sequences, lift fobs, and visitor parking behave differently across CBD-adjacent blocks and Southern
            Suburb estates. Minutes spent decoding access come out of bathroom dwell time unless notes are precise—see how
            preparation discipline compounds in{" "}
            <SafeInternalLink href="/blog/prepare-airbnb-for-cleaning">how to prepare your Airbnb for cleaning between guests</SafeInternalLink>.
          </p>
          <p>
            Ground neighbourhood friction using the{" "}
            <SafeInternalLink href="/locations/gardens-cleaning-services">Gardens cleaning services hub</SafeInternalLink> when your listing sits near
            the City Bowl—parking and loading rules shift block by block.
          </p>
        </>
      ) : null}

      {post.slug === "how-often-to-clean-airbnb-cape-town" ? (
        <>
          <p className="lead text-lg leading-relaxed text-zinc-700">
            Most Cape Town short-stay calendars book a full turnover after each checkout—guests pay for a reset that matches
            photos, not a compressed tidy that hopes nobody opens the oven. Cadence questions really mean: when do you layer
            deeper resets without punishing the next guest window?
          </p>
          <ServiceAnchorParagraph />
          <p>
            Seasonality matters: December-January and long weekends tighten slots—if you compress drying time on coastal
            humidity days, floors telegraph streaks in reviews even when crews executed scope faithfully.
          </p>
          <h2>Per-checkout baseline vs quarterly “truth resets”</h2>
          <p>
            Treat kitchens and bathrooms as every-checkout priorities; treat ovens, grout-adjacent buildup, and balcony glass
            as rotating deep targets when listings start drifting from gallery shots. Pair planning with{" "}
            <SafeInternalLink href="/blog/airbnb-cleaning-cost-cape-town">Airbnb cleaning cost guidance</SafeInternalLink> so budget matches honest
            dwell time.
          </p>
          <NeedHelpCta />
          <h2>Signals you are overdue for deeper scope</h2>
          <p>
            Lingering odours, recurring dust films after turnovers, or repeatable hair/drain complaints mean your baseline
            tier no longer matches guest intensity—either extend turnover time or schedule an intentional deep visit before
            ratings slip.
          </p>
          <p>
            Avoid the mistakes we outline in{" "}
            <SafeInternalLink href="/blog/airbnb-cleaning-mistakes-hosts-make">Airbnb cleaning mistakes hosts make</SafeInternalLink>—especially
            optimistic calendars that steal minutes from high-impact zones.
          </p>
          <p>
            Claremont-style family homes often show wear differently than compact Sea Point flats—compare notes with the{" "}
            <SafeInternalLink href="/locations/claremont-cleaning-services">Claremont cleaning hub</SafeInternalLink> when routing predicts stairs,
            gates, and mudrooms.
          </p>
        </>
      ) : null}

      {post.slug === "airbnb-cleaning-mistakes-hosts-make" ? (
        <>
          <p className="lead text-lg leading-relaxed text-zinc-700">
            Most “cleaning failures” on Airbnb are expectation failures—calendars promise hotel-ready resets while notes hide
            parking friction, kitchens hide grease cameras amplify, and balconies advertised in photos collect grit hosts
            never scoped.
          </p>
          <ServiceAnchorParagraph />
          <p>
            Cape Town adds predictable wrinkles: southeaster dust, humid bathrooms that fog mirrors an hour after wipes,
            and estate security that consumes the first ten minutes on site. Fixing mistakes starts with honest scope—not
            louder reminders to crews already squeezed by time.
          </p>
          <h2>Mistake #1: optimistic changeover buffers</h2>
          <p>
            If check-out and check-in overlap lifts, drying floors, or linen swaps, someone inherits impossible promises.
            Buffer humidity drying on tiled Atlantic Seaboard stacks; budget stair carries in Southern Suburbs homes before you
            advertise same-day flips.
          </p>
          <h2>Mistake #2: hiding supplies behind “minimalist” staging</h2>
          <p>
            Guests notice missing dishwasher tabs faster than a slightly imperfect cushion angle—stage consumables where
            crews can replenish without unlocking private cupboards mid-slot. Reinforce habits via{" "}
            <SafeInternalLink href={CANONICAL_BEST_AIRBNB_TIPS_CAPE_TOWN_HREF}>best Airbnb cleaning tips for Cape Town hosts</SafeInternalLink>.
          </p>
          <NeedHelpCta />
          <h2>Mistake #3: skipping documentation before cleaners arrive</h2>
          <p>
            Timestamp simple photos when inventory or finishes change—so turnover crews stay focused on cleaning, not
            debates that belong between host and guest.
          </p>
          <p>
            Compare your rhythm against{" "}
            <SafeInternalLink href="/blog/how-often-to-clean-airbnb-cape-town">how often to clean an Airbnb here</SafeInternalLink>, then sanity-check
            surfaces against the{" "}
            <SafeInternalLink href={CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF}>room-by-room checklist article</SafeInternalLink> before peak weeks.
          </p>
          <p>
            Hosting near schools and family routes in the Southern Suburbs? Ground parking and gate habits using the{" "}
            <SafeInternalLink href="/locations/claremont-cleaning-services">Claremont cleaning hub</SafeInternalLink> alongside your turnover brief.
          </p>
        </>
      ) : null}

      <AirbnbGuideCrossLinkFooter slug={post.slug} />
    </div>
  );
}
