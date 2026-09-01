import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { AirbnbCapeTownServiceExtendedContent } from "@/components/seo/AirbnbCapeTownServiceExtendedContent";
import { StandardCleaningCapeTownEnhancements } from "@/components/seo/StandardCleaningCapeTownEnhancements";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import type { PrimaryCapeTownServiceSlug } from "./PrimaryCapeTownServicePageTemplate";

export type PrimaryCapeTownServiceExtensionSlots = {
  kind: "standard" | "deep" | "move" | "airbnb" | "office" | "carpet";
  heroTrustStrip?: ReactNode;
  heroPrimaryLabel?: string;
  afterHero?: ReactNode;
  overviewLead?: ReactNode;
  overviewTail?: ReactNode;
  afterIncluded?: ReactNode;
  afterBenefits?: ReactNode;
  beforeAreas?: ReactNode;
  areasLead?: ReactNode;
  faqHeading?: string;
  faqDescription?: ReactNode;
  benefitsHeading: string;
  finalCta: {
    title: string;
    description: string;
    primaryLabel: string;
  };
};

const linkClass =
  "font-semibold text-blue-700 underline-offset-2 hover:underline";

function StandardAfterHero({ bookingPath }: { bookingPath: string }) {
  return (
    <>
      <section
        className="border-b border-blue-100 bg-blue-50/25 py-12"
        aria-labelledby="std-trust-block-heading"
      >
        <div className="mx-auto max-w-4xl px-4">
          <h2
            id="std-trust-block-heading"
            className="text-2xl font-bold tracking-tight text-zinc-900"
          >
            Cleaning services built for Cape Town homes
          </h2>
          <ul className="mt-6 grid gap-4 text-base leading-relaxed text-zinc-700 sm:grid-cols-2">
            {[
              ["Clear checklists", "scope confirmed online before the visit."],
              [
                "Transparent totals",
                "bedrooms, bathrooms, and add-ons update your quote before checkout.",
              ],
              [
                "Suburb coverage",
                "Seaboard, City Bowl, Southern Suburbs, and beyond where routing allows.",
              ],
              [
                "Easy rebooking",
                "return for the same rhythm when your schedule needs it.",
              ],
            ].map(([title, body]) => (
              <li
                key={title}
                className="flex gap-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm"
              >
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-blue-600"
                  aria-hidden
                />
                <span>
                  <strong className="font-semibold text-zinc-900">
                    {title}
                  </strong>{" "}
                  — {body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <StandardCleaningCapeTownEnhancements bookingPath={bookingPath} />
    </>
  );
}

function StandardComparisonContent() {
  const deepPath = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const moveOutPath = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  return (
    <section
      className="border-b border-blue-100 py-16"
      aria-labelledby="std-compare-deep-heading"
    >
      <div className="mx-auto max-w-4xl space-y-14 px-4">
        <div>
          <h2
            id="std-compare-deep-heading"
            className="text-2xl font-bold tracking-tight text-zinc-900"
          >
            Standard vs deep cleaning in Cape Town
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            <strong className="text-zinc-800">Standard cleaning</strong>{" "}
            maintains kitchens, bathrooms, floors, and dusting on a predictable
            rhythm—best when your home needs steady upkeep rather than a heavy
            reset.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            <strong className="text-zinc-800">Deep cleaning</strong> spends
            extra time on build-up—grout lines, appliance fronts, detail
            zones—and usually costs more because visits run longer. Book deep
            when you&apos;re recovering from hosting, moving in, or skipping
            cleans for a while.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Compare full scope on our{" "}
            <SafeInternalLink href={deepPath} className={linkClass}>
              deep cleaning services in Cape Town
            </SafeInternalLink>{" "}
            page, then align bedrooms and bathrooms in the quote builder.
          </p>
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
            One-off vs recurring cleaning
          </h2>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            <strong className="text-zinc-800">Once-off standard cleans</strong>{" "}
            suit move-ins, guest arrivals, or catching up between busy weeks—no
            commitment to a schedule.
          </p>
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            <strong className="text-zinc-800">Recurring visits</strong> (weekly,
            bi-weekly, or monthly) keep mess from compounding and often cost
            less per session because maintenance is lighter. For domestic rhythm
            and maid-style cadence copy, see{" "}
            <SafeInternalLink
              href={CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path}
              className={linkClass}
            >
              recurring standard cleaning in Cape Town
            </SafeInternalLink>
            .
          </p>
        </div>
      </div>
    </section>
  );
}

function MovePricingContent({
  bookingPath,
  slug,
}: {
  bookingPath: string;
  slug: PrimaryCapeTownServiceSlug;
}) {
  return (
    <section className="border-b border-blue-100 py-16">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-900">
          Move Out Cleaning Prices in Cape Town
        </h2>
        <p className="mt-3 font-medium text-zinc-900">Pricing depends on:</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-600">
          <li>Property size</li>
          <li>Level of dirt</li>
          <li>Additional services (carpet, upholstery, windows)</li>
        </ul>
        <p className="mt-6 text-base leading-relaxed text-zinc-600">
          Get an instant quote online or book a cleaner in minutes.
        </p>
        <div className="mt-6">
          <GrowthCtaLink
            href={bookingPath}
            source={`seo_ct_${slug}_pricing_instant_price`}
            className="inline-flex min-h-12 items-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Get instant price
          </GrowthCtaLink>
        </div>
      </div>
    </section>
  );
}

export function buildPrimaryCapeTownServiceExtensionSlots(
  slug: PrimaryCapeTownServiceSlug,
  bookingPath: string,
): PrimaryCapeTownServiceExtensionSlots {
  switch (slug) {
    case "standard-cleaning-cape-town":
      return {
        kind: "standard",
        heroTrustStrip: (
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold tracking-tight text-zinc-800">
            <span>Transparent online quotes</span>
            <span className="hidden text-zinc-300 sm:inline" aria-hidden>
              ·
            </span>
            <span>Checklist confirmed before arrival</span>
            <span className="hidden text-zinc-300 sm:inline" aria-hidden>
              ·
            </span>
            <span>Book when a slot suits you</span>
          </p>
        ),
        afterHero: <StandardAfterHero bookingPath={bookingPath} />,
        overviewLead: (
          <p>
            If you&apos;re looking for reliable{" "}
            <SafeInternalLink href="#included" className={linkClass}>
              cleaning services in Cape Town
            </SafeInternalLink>
            , Shalean matches you with a checklist you confirm online—ideal for
            busy households that want predictable maintenance between deeper
            resets. If you need a more intensive service, see our{" "}
            <SafeInternalLink
              href={CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path}
              className={linkClass}
            >
              deep cleaning services in Cape Town
            </SafeInternalLink>
            .
          </p>
        ),
        overviewTail: (
          <>
            <p>
              If you list on Airbnb, compare dedicated{" "}
              <SafeInternalLink
                href={CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path}
                className={linkClass}
              >
                airbnb cleaning Cape Town
              </SafeInternalLink>{" "}
              turnovers alongside recurring standard visits—guest expectations
              are closer to hospitality than weekly home upkeep.
            </p>
            <p>
              For ongoing weekly cleaning, see our{" "}
              <SafeInternalLink
                href={CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path}
                className={linkClass}
              >
                recurring standard cleaning in Cape Town
              </SafeInternalLink>
              .
            </p>
          </>
        ),
        afterBenefits: <StandardComparisonContent />,
        areasLead: (
          <>
            <p className="mt-4 text-base leading-relaxed text-zinc-600">
              High-demand areas include Sea Point, Claremont, and
              Observatory—add your suburb at checkout for parking, layout, and
              short-stay context before your team arrives.
            </p>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">
                  Sea Point
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  High-rise apartments, Airbnb turnovers, and coastal dust along
                  the Promenade and Main Road—fast access notes for lifts and
                  parking before you book.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">
                  Claremont
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Family homes, townhouses, and student-adjacent rentals—good
                  mix of weekly upkeep and deeper seasonal resets near schools
                  and malls.
                </p>
              </div>
              <div className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-zinc-900">
                  Observatory
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                  Shared houses and compact flats with frequent move-outs—ideal
                  for flexible once-offs or tighter recurring scopes.
                </p>
              </div>
            </div>
          </>
        ),
        benefitsHeading: "Why choose Shalean cleaning services",
        faqHeading: "Booking & scope details",
        faqDescription: (
          <>
            See the single FAQ section below for recurring visits, supplies,
            scope upgrades, and booking conditions.
          </>
        ),
        finalCta: {
          title: "Book a cleaner in Cape Town today",
          description:
            "Choose a slot that works for your schedule—lock bedrooms, bathrooms, and add-ons in one transparent total.",
          primaryLabel: "Get instant quote",
        },
      };
    case "airbnb-cleaning-cape-town":
      return {
        kind: "airbnb",
        heroPrimaryLabel: "Book Airbnb cleaner",
        overviewTail: (
          <>
            <p>
              Bundle{" "}
              <SafeInternalLink
                href={CAPE_TOWN_SERVICE_SEO["carpet-cleaning-cape-town"].path}
                className={linkClass}
              >
                carpet and upholstery care
              </SafeInternalLink>{" "}
              when high-traffic fibres need extraction between peak bookings.
            </p>
            <p>
              Hosting near the Promenade or Main Road corridor? Sea Point
              turnovers often need tight parking and lift notes—add them at
              checkout alongside this Cape Town-wide Airbnb scope.
            </p>
            <p>
              Running a listing in Green Point? Plan for Atlantic Seaboard
              humidity and realistic turnover buffers—share check-out and
              check-in times when you book turnover cleaning.
            </p>
          </>
        ),
        beforeAreas: (
          <AirbnbCapeTownServiceExtendedContent bookingPath={bookingPath} />
        ),
        areasLead: (
          <p className="mt-4 text-base leading-relaxed text-zinc-600">
            Popular turnover corridors include Sea Point, Green Point, and
            Claremont—share check-out times, remote access, and linen notes when
            you book.
          </p>
        ),
        benefitsHeading: "Benefits for Cape Town customers",
        finalCta: {
          title: "Ready to book Airbnb Cleaning?",
          description:
            "Confirm the turnover window, bedrooms, bathrooms, linen, restocking, and access notes before checkout.",
          primaryLabel: "Book Airbnb cleaner",
        },
      };
    case "move-out-cleaning-cape-town":
      return {
        kind: "move",
        overviewTail: (
          <p>
            Need a heavier reset before handover? Compare our{" "}
            <SafeInternalLink
              href={CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path}
              className={linkClass}
            >
              deep cleaning services
            </SafeInternalLink>{" "}
            for occupied homes, or{" "}
            <SafeInternalLink
              href={CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path}
              className={linkClass}
            >
              standard cleaning
            </SafeInternalLink>{" "}
            when you still live in the property before move-out day.
          </p>
        ),
        afterIncluded: (
          <MovePricingContent bookingPath={bookingPath} slug={slug} />
        ),
        benefitsHeading: "Benefits for Cape Town customers",
        finalCta: {
          title: "Ready to move out stress-free?",
          description:
            "Confirm the property condition, handover deadline, appliance scope, and access details before booking.",
          primaryLabel: "Book move-out cleaning",
        },
      };
    case "office-cleaning-cape-town":
      return {
        kind: "office",
        benefitsHeading: "Benefits for Cape Town customers",
        finalCta: {
          title: "Ready to book Office Cleaning?",
          description:
            "Tell us the office size, work areas, access requirements, and preferred service window to begin.",
          primaryLabel: "Book office cleaning",
        },
      };
    case "carpet-cleaning-cape-town":
      return {
        kind: "carpet",
        benefitsHeading: "Benefits for Cape Town customers",
        finalCta: {
          title: "Ready to book Carpet Cleaning?",
          description:
            "Select carpeted rooms, rugs, stains, furniture access, and any approved upholstery extras for your quote.",
          primaryLabel: "Book carpet cleaning",
        },
      };
    case "deep-cleaning-cape-town":
      return {
        kind: "deep",
        benefitsHeading: "Benefits for Cape Town customers",
        finalCta: {
          title: "Ready to book Deep Cleaning?",
          description:
            "Confirm property size, build-up level, priority areas, and access details for an intensive team clean.",
          primaryLabel: "Book deep cleaning",
        },
      };
  }
}
