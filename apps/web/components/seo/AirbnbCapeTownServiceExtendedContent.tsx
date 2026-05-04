import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

const SERVICES_HUB = "/services";
const DEEP = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
const BOOKING = "/booking";

const sectionClass = "mx-auto max-w-4xl px-4";
const ctaRowClass = "not-prose mt-8 flex flex-wrap gap-3";

export function AirbnbCapeTownServiceExtendedContent({ bookingPath }: { bookingPath: string }) {
  const airbnbPath = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

  return (
    <>
      <section className="border-b border-blue-100 py-16" aria-labelledby="airbnb-turnover-process">
        <div className={sectionClass}>
          <h2 id="airbnb-turnover-process" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Turnover Cleaning Process in Cape Town
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

      <section className="border-b border-blue-100 bg-blue-50/30 py-16" aria-labelledby="airbnb-areas-featured">
        <div className={sectionClass}>
          <h2 id="airbnb-areas-featured" className="text-2xl font-bold tracking-tight text-zinc-900">
            Airbnb Cleaning in Cape Town Areas
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Short-stay demand clusters on the Atlantic Seaboard and Southern Suburbs corridors—each pocket has different
            parking, security, and dust profiles.
          </p>
          <ul className="mt-8 flex flex-wrap gap-3">
            {[
              { href: "/locations/sea-point-cleaning-services", label: "Sea Point turnover cleans" },
              { href: "/locations/green-point-cleaning-services", label: "Green Point turnover cleans" },
              { href: "/locations/claremont-cleaning-services", label: "Claremont turnover cleans" },
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
