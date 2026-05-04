import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const DEEP = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const AIRBNB = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

/** Service types + semantic keywords — rendered immediately after the intro section. */
export function WindowCleaningServiceTypesSection() {
  return (
    <section className="border-b border-blue-100 py-16" aria-labelledby="window-service-types-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="window-service-types-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Types of Window Cleaning Services We Offer in Cape Town
        </h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Professional window cleaning in Cape Town covers more than a quick wipe—teams plan reach, access, and frames so
          glass stays clearer for longer. Below is how we scope common requests for homeowners, renters, and small
          workplaces.
        </p>

        <div className="mt-10 space-y-8">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Residential window cleaning Cape Town</h3>
            <p className="mt-2 text-base leading-7 text-zinc-600">
              Houses and freestanding homes usually mix lounge sliders, bedroom casements, and patio doors—often with more
              exterior exposure to windblown dust. We prioritise reachable glass first and confirm ladder-safe heights in your
              booking notes so professional window cleaning Cape Town visits stay realistic on the day.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Commercial window cleaning Cape Town</h3>
            <p className="mt-2 text-base leading-7 text-zinc-600">
              Small offices, studios, and street-facing suites benefit from predictable glass resets on reception panes,
              partition walls, and ground-floor storefronts where fingerprints stack fast. Share security and access rules;
              we align commercial window cleaning with the footprint your quote reflects—without promising rope-access
              high-rise work we do not perform.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Apartment window cleaning</h3>
            <p className="mt-2 text-base leading-7 text-zinc-600">
              Atlantic Seaboard and CBD apartments lean on balcony sliders and bedroom windows where salt mist and urban
              grime show first. Apartment window cleaning fits compact layouts well—mention lift codes, balcony limits, and
              estate rules so window cleaners Cape Town teams route without delays.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900">Office window cleaning</h3>
            <p className="mt-2 text-base leading-7 text-zinc-600">
              Meeting rooms and desk zones pick up glare-heavy smudges that cameras and clients notice in seconds. Office
              window cleaning stays focused on interior partitions plus any exterior glass your lease allows us to reach
              safely—often booked alongside wider workspace tidying when you want one coordinated visit.
            </p>
          </div>
        </div>

        <p className="mt-10 text-base leading-7 text-zinc-600">
          Pair glass detailing with a broader reset when kitchens and bathrooms need attention too—see{" "}
          <Link href={DEEP} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            deep cleaning services in Cape Town
          </Link>{" "}
          for scope. Hosting guests soon? Our{" "}
          <Link href={AIRBNB} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
            airbnb cleaning Cape Town
          </Link>{" "}
          turnovers layer hygiene on floors and wet rooms while you handle presentation extras like glass.
        </p>
      </div>
    </section>
  );
}

const pricingCtaClass =
  "inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700";

function WindowPricingMidCtas({ bookingPath }: { bookingPath: string }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <GrowthCtaLink href={bookingPath} source="seo_ct_window-cleaning-cape-town_mid_book" className={pricingCtaClass}>
        Book window cleaning
      </GrowthCtaLink>
      <GrowthCtaLink
        href={bookingPath}
        source="seo_ct_window-cleaning-cape-town_mid_price"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-200 bg-white px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
      >
        Get instant price
      </GrowthCtaLink>
      <GrowthCtaLink
        href={bookingPath}
        source="seo_ct_window-cleaning-cape-town_mid_avail"
        className="inline-flex min-h-12 items-center justify-center rounded-xl border border-blue-200 bg-white px-6 text-base font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
      >
        Check availability
      </GrowthCtaLink>
    </div>
  );
}

/** Pricing, primary quote CTA, mid-page conversion row, and trust framing — after benefits. */
export function WindowCleaningPricingTrustSection({ bookingPath }: { bookingPath: string }) {
  return (
    <>
      <section className="border-b border-blue-100 bg-blue-50/40 py-16" aria-labelledby="window-pricing-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="window-pricing-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Window Cleaning Prices in Cape Town
          </h2>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Window cleaning Cape Town quotes scale with how much glass we touch, whether work is interior or exterior, and
            how easy it is to reach each opening safely—your total is confirmed online before you pay.
          </p>
          <ul className="mt-6 space-y-3 text-base leading-7 text-zinc-600">
            <li>
              <strong className="font-semibold text-zinc-800">Typical ranges:</strong> compact apartments with a focused set
              of sliders often land roughly <strong className="font-semibold text-zinc-800">R350–R650</strong> for a
              once-off visit; larger homes with more openings or mixed interior/exterior work commonly sit around{" "}
              <strong className="font-semibold text-zinc-800">R550–R950+</strong> before heavy height or access factors.
              Commercial ground-floor glass is quoted per scope once we understand pane count and frequency.
            </li>
            <li>
              <strong className="font-semibold text-zinc-800">What changes the price:</strong> total pane count, interior vs
              exterior mix, balcony vs street-only access, ladder-safe height limits, estate parking or lift logistics, and
              bundling with standard or deep home cleaning.
            </li>
          </ul>
          <div className="mt-8">
            <GrowthCtaLink href={bookingPath} source="seo_ct_window-cleaning-cape-town_pricing_quote" className={pricingCtaClass}>
              Get instant quote
            </GrowthCtaLink>
          </div>
          <WindowPricingMidCtas bookingPath={bookingPath} />
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="window-trust-heading">
        <div className="mx-auto max-w-4xl px-4">
          <h2 id="window-trust-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
            Why Choose Professional Window Cleaning in Cape Town
          </h2>
          <ul className="mt-6 space-y-4 text-base leading-7 text-zinc-600">
            <li>
              <strong className="font-semibold text-zinc-800">Safety vs DIY:</strong> leaning out over balconies or stacking
              household stools introduces fall risk—our teams stay within agreed reach limits and use stable setups suited to
              Cape Town apartments and townhouses.
            </li>
            <li>
              <strong className="font-semibold text-zinc-800">Professional equipment:</strong> squeegees, scrubbers, and
              finishing cloths reduce streaking compared with supermarket sprays on warm glass—especially when coastal salt
              residue is in the mix.
            </li>
            <li>
              <strong className="font-semibold text-zinc-800">Better results:</strong> frames, tracks, and sills get
              attention where scoped, so openings slide smoothly and rooms feel brighter without smear marks under side
              lighting.
            </li>
            <li>
              <strong className="font-semibold text-zinc-800">Time saving:</strong> batching all openings into one booked
              visit beats losing a Saturday to ladders and redo passes—particularly before inspections, guests, or listing
              photos.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
