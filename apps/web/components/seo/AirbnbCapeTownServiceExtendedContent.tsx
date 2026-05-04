import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const SERVICES_HUB = "/services";
const DEEP = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const BOOKING = "/booking";

const AIRBNB_SEA_POINT = "/services/airbnb-cleaning-sea-point";
const AIRBNB_GREEN_POINT = "/services/airbnb-cleaning-green-point";
const AIRBNB_CLAREMONT = "/services/airbnb-cleaning-claremont";
const HUB_GARDENS = "/locations/gardens-cleaning-services";

const sectionClass = "mx-auto max-w-4xl px-4";
const ctaRowClass = "not-prose mt-8 flex flex-wrap gap-3";

export function AirbnbCapeTownServiceExtendedContent({ bookingPath }: { bookingPath: string }) {
  const airbnbPath = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

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
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="airbnb-turnover-process">
        <div className={sectionClass}>
          <h2 id="airbnb-turnover-process" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Turnover Cleaning in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Turnovers live or die on sequencing. In Cape Town, parking, estate rules, and coastal dust all steal minutes—so
            we stage work the same way experienced hosts do: clear handover, predictable arrival, then a reset that matches
            your listing photos.
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
            <Link href={DEEP} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              deep cleaning services
            </Link>{" "}
            so grout, ovens, and neglected corners do not surface in reviews after busy months.
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
            Holiday home cleaning often includes deeper fridge checks or linen bundles you supply; vacation rental cleaning
            may layer balcony sweeps or oven fronts when summer bookings stack. Tell us what your listing promises—we align time
            so <strong className="font-semibold text-zinc-900">rental property cleaning</strong> stays honest for your nightly
            rate, not a rushed wipe-down.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Pair recurring turnovers with an occasional deep clean when grout, ovens, or neglected corners start sneaking into
            reviews—steady cadence beats panic resets for any rental property cleaning schedule.
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
            <Link href="/blog/airbnb-cleaning-checklist-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Airbnb cleaning checklist for hosts in Cape Town
            </Link>{" "}
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
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_price_after_checklist"
              className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 bg-white px-5 text-sm font-semibold text-blue-800 transition hover:bg-blue-50"
            >
              Get instant price
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
            <Link href="/blog/airbnb-cleaning-cost-cape-town" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              how Airbnb cleaning cost works in Cape Town
            </Link>{" "}
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
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_availability_pricing"
              className="inline-flex min-h-11 items-center rounded-xl border border-blue-200 bg-white px-5 text-sm font-semibold text-blue-800 transition hover:bg-blue-50"
            >
              Check availability
            </GrowthCtaLink>
          </div>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="airbnb-recent-cleans">
        <div className={sectionClass}>
          <h2 id="airbnb-recent-cleans" className="text-2xl font-bold tracking-tight text-zinc-900">
            Recent Airbnb cleans in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Illustrative turnover scenarios—your scope still locks online from bedrooms, bathrooms, and the extras you
            select. These are the shapes of work crews budget when calendars compress.
          </p>
          <ul className="mt-6 space-y-4 text-base leading-relaxed text-zinc-700">
            <li>
              <strong className="text-zinc-900">Atlantic Seaboard two-bed, same-day flip.</strong> Sand in entry tracks,
              balcony rail dust after a southeaster week, and a kitchen photographed for check-in—teams sequence wet-to-dry so
              glass and chrome stay review-ready when humidity rebounds.
            </li>
            <li>
              <strong className="text-zinc-900">CBD-adjacent studio before a conference check-in.</strong> Compact footprint,
              heavy bathroom optics, and tight lift etiquette—notes carry visitor parking and intercom steps so the gap goes
              to scrubbing, not logistics.
            </li>
            <li>
              <strong className="text-zinc-900">Southern Suburbs family let after school holidays.</strong> Mudroom grit,
              multiple baths, and oven fingerprints from busy weeks—hosts pair honest dwell time with linen staging when
              bundles are supplied on site.
            </li>
          </ul>
          <h3 className="mt-10 text-lg font-semibold text-zinc-900">Trusted by hosts across Sea Point, Green Point, Claremont &amp; Gardens</h3>
          <p className="mt-3 text-base leading-relaxed text-zinc-600">
            Hosts repeat bookings where access notes match reality and turnovers mirror listing shots—whether you list near the
            Promenade, the stadium corridor, school-run suburbs, or the City Bowl edge in{" "}
            <Link href={HUB_GARDENS} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Gardens
            </Link>
            . Use suburb guides when you want guest-facing language; use location hubs when you need broader parking and area
            FAQs.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-blue-50/30 py-16" aria-labelledby="airbnb-areas-featured">
        <div className={sectionClass}>
          <h2 id="airbnb-areas-featured" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Cleaning in Cape Town Areas
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Short-stay demand clusters on the Atlantic Seaboard and Southern Suburbs corridors—each pocket has different
            parking, security, and dust profiles.
          </p>
          <div className="mt-8 rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-zinc-900">Also serving nearby areas</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-600">
              Turnover crews route across the Seaboard and City Bowl edges every week—start from suburb-specific guides when
              your listing sits in{" "}
              <Link href={AIRBNB_SEA_POINT} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Sea Point
              </Link>
              ,{" "}
              <Link href={AIRBNB_GREEN_POINT} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Green Point
              </Link>
              , or the{" "}
              <Link href={HUB_GARDENS} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                Gardens
              </Link>{" "}
              corridor (broader hub page for City Bowl-adjacent hosting).
            </p>
          </div>
          <ul className="mt-8 flex flex-wrap gap-3">
            {[
              { href: AIRBNB_SEA_POINT, label: "Sea Point Airbnb cleaning" },
              { href: AIRBNB_GREEN_POINT, label: "Green Point Airbnb cleaning" },
              { href: AIRBNB_CLAREMONT, label: "Claremont Airbnb cleaning" },
              { href: HUB_GARDENS, label: "Gardens hosting hub" },
              { href: "/locations/sea-point-cleaning-services", label: "Sea Point area hub" },
              { href: "/locations/green-point-cleaning-services", label: "Green Point area hub" },
              { href: "/locations/claremont-cleaning-services", label: "Claremont area hub" },
            ].map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-800 transition hover:border-blue-400 hover:bg-blue-50"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-base leading-relaxed text-zinc-600">
            Browse every suburb hub from our main{" "}
            <Link href="/locations" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Cape Town locations directory
            </Link>
            —each hub links back to this service guide so hosts keep scope consistent.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="professional-airbnb-cleaners-cpt">
        <div className={sectionClass}>
          <h2 id="professional-airbnb-cleaners-cpt" className="text-2xl font-bold tracking-tight text-zinc-900">
            Professional Airbnb Cleaners Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Professional cleaners on our turnover roster work from structured scope—not improvised chats—so Seaboard humidity,
            estate gates, and school-week traffic do not steal the minutes bathrooms need. Crews understand guest-facing
            optics: chrome that dries clear, cushions that match your hero photo, and bins that read ready before anyone
            unpacks.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            You still control access, linen, and consumables; we align dwell time to what you selected online and flag friction
            early when calendars lie about realistic gaps. That consistency is what keeps short-stay ratings steady across busy
            Cape Town months.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 py-16" aria-labelledby="why-shalean-airbnb">
        <div className={sectionClass}>
          <h2 id="why-shalean-airbnb" className="text-2xl font-bold tracking-tight text-zinc-900">
            Why Airbnb Hosts Choose Shalean
          </h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {[
              {
                title: "Reliable cleaners",
                body: "Vetted teams work from structured checklists—not ad-hoc WhatsApp lists—so quality survives busy months when you are travelling.",
              },
              {
                title: "Fast turnaround",
                body: "You book around real check-out and check-in buffers; crews arrive with access-first discipline so sand and humidity do not steal your gap.",
              },
              {
                title: "Consistent quality",
                body: "Guest-ready presentation stays repeatable: beds, bathrooms, and kitchens read the same in reviews across turnovers.",
              },
              {
                title: "Easy booking",
                body: "Bedrooms, bathrooms, and add-ons lock an upfront total before payment—then you adjust notes when calendars shift.",
              },
            ].map((card) => (
              <div key={card.title} className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{card.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-base leading-relaxed text-zinc-600">
            First-time setup? Walk through{" "}
            <Link href="/blog/prepare-airbnb-for-cleaning" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              how to prepare your Airbnb for cleaning between guests
            </Link>{" "}
            so access, supplies, and inventory photos stay aligned.
          </p>
        </div>
      </section>

      <section className="border-b border-blue-100 bg-zinc-50/80 py-16" aria-labelledby="airbnb-internal-links">
        <div className={sectionClass}>
          <h2 id="airbnb-internal-links" className="text-2xl font-bold tracking-tight text-zinc-900">
            Related cleaning guides in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Turnovers share DNA with residential cleans—but calendars and guest optics differ. Compare tiers on our{" "}
            <Link href={SERVICES_HUB} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              professional cleaning services in Cape Town
            </Link>{" "}
            hub, then layer{" "}
            <Link href={DEEP} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              deep cleaning services
            </Link>{" "}
            when kitchens, grout, or ovens need honest dwell time beyond a standard turnover.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Ready to route inventory damage or linen swaps without losing the slot? Keep booking notes updated on{" "}
            <Link href={airbnbPath} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              this Airbnb service page
            </Link>{" "}
            and jump straight to{" "}
            <Link href={BOOKING} className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              instant pricing
            </Link>{" "}
            when you are happy with scope.
          </p>
          <div className={ctaRowClass}>
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_bottom_primary"
              className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Book Airbnb cleaner
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_bottom_price"
              className="inline-flex min-h-12 items-center rounded-xl border border-blue-300 bg-white px-6 text-base font-semibold text-blue-800 transition hover:bg-blue-50"
            >
              Get instant price
            </GrowthCtaLink>
            <GrowthCtaLink
              href={bookingPath}
              source="seo_ct_airbnb_bottom_avail"
              className="inline-flex min-h-12 items-center rounded-xl border border-blue-300 bg-white px-6 text-base font-semibold text-blue-800 transition hover:bg-blue-50"
            >
              Check availability
            </GrowthCtaLink>
          </div>
        </div>
      </section>
    </>
  );
}
