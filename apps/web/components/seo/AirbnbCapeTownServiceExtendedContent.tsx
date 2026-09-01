import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF } from "@/lib/blog/canonicalEditorialBlogLinks";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const SERVICES_HUB = "/services";
const DEEP = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const HUB_SEA_POINT_LOC = "/locations/sea-point-cleaning-services";
const HUB_GREEN_POINT_LOC = "/locations/green-point-cleaning-services";

const sectionClass = "mx-auto max-w-4xl px-4";
const ctaRowClass = "not-prose mt-8 flex flex-wrap gap-3";

export function AirbnbCapeTownServiceExtendedContent({ bookingPath }: { bookingPath: string }) {
  return (
    <>
      <section className="border-b border-blue-100 bg-blue-50/25 py-16" aria-labelledby="airbnb-str-cape-town">
        <div className={sectionClass}>
          <h2 id="airbnb-str-cape-town" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Cleaning for Short-Term Rentals in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Short-term rental cleaning is the rhythm behind calendars—holiday homes off school breaks, vacation rentals
            between flights, and guest turnover cleaning when check-out and check-in sit too close for comfort. We treat each
            visit as a reset guests photograph on arrival, not a stretched residential tidy.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-700">
            Whether you list one apartment or several units, Airbnb cleaning services Cape Town hosts book through Shalean tie
            together kitchens, bathrooms, floors, and staging—so every stay opens with guest-ready cleaning that matches your
            gallery and protects rental property cleaning budgets from surprise add-ons mid-turnover.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Booking locks bedrooms, bathrooms, and turnover extras before payment—notes carry estate rules and linen locations
            so holiday lettings and peak-season vacation rentals stay predictable.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Compare every{" "}
            <SafeInternalLink href={SERVICES_HUB} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Cape Town cleaning service
            </SafeInternalLink>{" "}
            tier from one hub—then keep turnovers on this page so guest-ready scope does not drift into residential assumptions.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-white py-10" aria-labelledby="airbnb-trust-strip">
        <div className={sectionClass}>
          <div className="grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 px-6 py-5 sm:grid-cols-3 sm:items-start">
            <p id="airbnb-trust-strip" className="text-base font-semibold text-emerald-950">
              Trusted by Airbnb hosts in Cape Town
            </p>
            <p className="text-base font-semibold text-emerald-950">Top-rated cleaning service</p>
            <p className="text-sm font-medium leading-relaxed text-emerald-900/90 sm:border-l sm:border-emerald-200 sm:pl-4">
              Reliable guest turnover cleaning for short-term rentals—same checklist discipline whether you manage one flat or
              a portfolio across Cape Town.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="airbnb-turnover-process">
        <div className={sectionClass}>
          <h2 id="airbnb-turnover-process" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Turnover Cleaning Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Turnovers live or die on sequencing. In Cape Town, parking, estate rules, and coastal dust all steal minutes—so
            we stage work the same way experienced hosts do: clear handover, predictable arrival, then a reset that matches
            your listing photos. Dense Seaboard corridors—see{" "}
            <SafeInternalLink href={HUB_SEA_POINT_LOC} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Sea Point cleaning services
            </SafeInternalLink>{" "}
            and{" "}
            <SafeInternalLink href={HUB_GREEN_POINT_LOC} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Green Point cleaning services
            </SafeInternalLink>
            —often need lift and parking notes baked into the brief before mops touch tile.
          </p>
          <ol className="mt-8 list-decimal space-y-5 pl-6 text-base leading-relaxed text-zinc-700 marker:font-semibold marker:text-blue-700">
            <li>
              <strong className="text-zinc-900">Guest checkout.</strong> Confirm the unit is vacant, keys or codes work, and
              bins are accessible. If check-out runs late, update booking notes so the team does not arrive into an occupied
              space.
            </li>
            <li>
              <strong className="text-zinc-900">Cleaner arrival.</strong> Crews use your access instructions first—gates,
              remotes, lift rules—then do a quick walk-through to spot damage or missing inventory before cleaning begins.
            </li>
            <li>
              <strong className="text-zinc-900">Full clean + inspection.</strong> Kitchens, bathrooms, floors, and
              high-touch points are worked in an order that avoids re-soiling finished zones. A short visual pass catches
              streaked glass, hair in drains, and sofa cushions that read messy on camera.
            </li>
            <li>
              <strong className="text-zinc-900">Linen change.</strong> When you add turnover extras, teams stage beds with
              your supplied linen and align pillow presentation with your gallery shots—guests notice mismatches fast.
            </li>
            <li>
              <strong className="text-zinc-900">Final reset for next guest.</strong> Bins lined, consumables visible,
              remotes aligned, and a neutral scent profile so check-in photos and first impressions stay consistent.
            </li>
          </ol>
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            Need a deeper baseline before peak season? Pair turnovers with{" "}
            <SafeInternalLink href={DEEP} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              deep cleaning in Cape Town
            </SafeInternalLink>{" "}
            —ideal when ovens, grout, or balconies need honest dwell time beyond a standard changeover—so reviews stay strong
            after busy months.
          </p>
          <div className={ctaRowClass}>
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_after_process"
              className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Check availability
            </GrowthCtaLink>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="airbnb-short-term-services">
        <div className={sectionClass}>
          <h2 id="airbnb-short-term-services" className="text-2xl font-bold tracking-tight text-zinc-900">
            Short-Term Rental Cleaning Services
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Scope scales with how guests actually use the space: coastal flats pick up sand and balcony grit; City Bowl
            walk-ups need stair-smart crews; Southern Suburb houses spread mess across mudrooms and multiple baths. The same
            short-term rental cleaning playbook still prioritises wet areas, high-touch points, and kitchens that read fresh
            on wide-angle listing shots.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Holiday home resets and portfolio-wide standards sit alongside turnovers on our{" "}
            <SafeInternalLink href={SERVICES_HUB} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              professional cleaning services hub
            </SafeInternalLink>
            —book the tier that matches guest promises, not guesswork.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Pair recurring turnovers with an occasional{" "}
            <SafeInternalLink href={DEEP} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              deep cleaning service for Cape Town homes
            </SafeInternalLink>{" "}
            when grout, ovens, or neglected corners start sneaking into reviews—steady cadence beats panic resets.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/25 py-16" aria-labelledby="airbnb-vacation-rental-cpt">
        <div className={sectionClass}>
          <h2 id="airbnb-vacation-rental-cpt" className="text-2xl font-bold tracking-tight text-zinc-900">
            Vacation Rental Cleaning Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Vacation rental cleaning spans beach-week sand, festival-season dust, and families tracking grit through passages—so
            scope has to flex without surprises on your payout. We align kitchens, bathrooms, and floors to what guests see in
            photos, then surface add-ons when balconies, fridges, or linen swaps need explicit time.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Coastal pockets such as{" "}
            <SafeInternalLink href={HUB_SEA_POINT_LOC} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Sea Point
            </SafeInternalLink>{" "}
            and{" "}
            <SafeInternalLink href={HUB_GREEN_POINT_LOC} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Green Point
            </SafeInternalLink>{" "}
            often stack humid bathrooms with salty balconies; Southern Suburb lets lean on mudrooms and multi-bath resets.
            Property managers can brief once per building template—individual hosts can dial bedrooms and baths per stay.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/40 py-16" aria-labelledby="airbnb-checklist-seo">
        <div className={sectionClass}>
          <h2 id="airbnb-checklist-seo" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Cleaning Checklist
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Use this as a host-facing QA layer—either you inspect against it or you brief our crew so expectations match your
            calendar pressure.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "Kitchen deep clean: hob, sink, counters, appliance fronts, and bins refreshed",
              "Bathroom sanitising: fixtures, mirrors, glass, and floors dried to a streak-free finish",
              "Floor cleaning: vacuum edges first, then mop hard floors to a photo-ready sheen",
              "Linen change: beds staged to match listing photos when supplied linen is on site",
              "Restocking essentials: dishwasher tabs, bin liners, and toiletries you leave for guests topped up visibly",
            ].map((item) => (
              <li
                key={item}
                className="rounded-2xl border border-blue-100 bg-white p-4 text-sm font-medium leading-relaxed text-zinc-700 shadow-sm"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            For a printable-style walkthrough, open our{" "}
            <SafeInternalLink href={CANONICAL_AIRBNB_CHECKLIST_CAPE_TOWN_HREF} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Airbnb cleaning checklist for hosts in Cape Town
            </SafeInternalLink>{" "}
            on the blog—then return here to lock scope in booking.
          </p>
          <div className={ctaRowClass}>
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_after_checklist"
              className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Book Airbnb cleaner
            </GrowthCtaLink>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="airbnb-pricing-cpt">
        <div className={sectionClass}>
          <h2 id="airbnb-pricing-cpt" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Cleaning Prices in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Illustrative bands help you budget marketing and nightly rates—your exact total still depends on bedrooms,
            bathrooms, add-ons, and the realistic time a turnover needs on your street.
          </p>
          <ul className="mt-6 space-y-3 text-base leading-relaxed text-zinc-700">
            <li>
              <strong className="text-zinc-900">Compact one-bed apartments</strong> often land roughly between{" "}
              <strong>R350–R650</strong> for a standard turnover when kitchens and bathrooms stay well maintained between
              guests.
            </li>
            <li>
              <strong className="text-zinc-900">Two-bed Atlantic Seaboard or CBD-style units</strong> frequently move into the{" "}
              <strong>R500–R900</strong> range when lifts, parking, and balcony dust add workflow time.
            </li>
            <li>
              <strong className="text-zinc-900">Larger homes or heavy reset weeks</strong>—think post-school-holiday sand,
              multiple bathrooms, or oven/fridge add-ons—can push toward <strong>R950+</strong> until scope is normalised
              again.
            </li>
          </ul>
          <h3 className="mt-8 text-lg font-semibold text-zinc-900">What moves the quote</h3>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Bedroom and bathroom counts set the foundation. Inside-fridge wipes, linen staging, and deeper kitchen work add
            honest minutes. Access friction—narrow streets in the Southern Suburbs, complex signage, or remote lockbox
            issues—belongs in your booking notes so we quote time that matches reality, not an optimistic postcode guess.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Read{" "}
            <SafeInternalLink href="/blog/airbnb-cleaning-cost-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              how Airbnb cleaning cost works in Cape Town
            </SafeInternalLink>{" "}
            for a longer breakdown—then come back for a locked total.
          </p>
          <div className={ctaRowClass}>
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_exact_price"
              className="inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Get exact price
            </GrowthCtaLink>
          </div>
        </div>
      </section>

    </>
  );
}
