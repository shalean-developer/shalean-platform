import Image from "next/image";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { marketingLandingImage, marketingHomeBookingHref } from "@/lib/marketing/marketingHomeAssets";
import { marketingPrimaryCtaClassName } from "@/lib/marketing/marketingHomeCtaClasses";

const mimg = marketingLandingImage;

const PEOPLE_IMG_MAIN = mimg("/images/marketing/professional-cleaner-vacuum-bedroom-cape-town.webp");
const PEOPLE_IMG_TOP = mimg("/images/marketing/cleaning-team-bright-space-cape-town.webp");
const PEOPLE_IMG_BOTTOM = mimg("/images/marketing/bright-living-room-after-cleaning-cape-town.webp");

export function MarketingHomeServicesSection() {
  const bookHref = marketingHomeBookingHref();

  return (
    <HomeSection
      id="why-choose-us"
      containerSize="marketing"
      className="scroll-mt-24 bg-background md:py-[var(--ui-space-20)]"
    >
      <div className="grid gap-[var(--ui-space-12)] lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-center lg:gap-[var(--ui-space-16)]">
        <div className="grid grid-cols-1 gap-[var(--ui-space-3)] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] sm:grid-rows-2">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--ui-radius-marketing)] bg-muted shadow-[var(--ui-shadow-md)] sm:row-span-2 sm:min-h-[500px] sm:aspect-auto">
            <Image
              src={PEOPLE_IMG_MAIN}
              alt="Professional cleaner vacuuming a bedroom in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 60vw, 36vw"
            />
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--ui-radius-marketing)] bg-muted shadow-[var(--ui-shadow-sm)]">
            <Image
              src={PEOPLE_IMG_TOP}
              alt="Shalean cleaning team working in a bright Cape Town space"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 40vw, 24vw"
            />
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--ui-radius-marketing)] bg-muted shadow-[var(--ui-shadow-sm)]">
            <Image
              src={PEOPLE_IMG_BOTTOM}
              alt="Clean bright living room after professional cleaning in Cape Town"
              fill
              className="object-cover object-center"
              sizes="(max-width: 1024px) 40vw, 24vw"
            />
          </div>
        </div>

        <div className="lg:pl-[var(--ui-space-4)]">
          <MarketingSectionHeader
            align="left"
            eyebrow="People behind the service"
            eyebrowTone="brand"
            title="Professional cleaning delivered by real people."
            description="Shalean matches customers with vetted cleaners and teams for regular homes, deep cleans, moves, Airbnb turnovers, offices and carpet care across Cape Town."
          />

          <div className="mt-[var(--ui-space-8)]">
            <GrowthCtaLink
              href={bookHref}
              source="marketing_why_choose_book"
              className={marketingPrimaryCtaClassName}
            >
              Book a cleaning
            </GrowthCtaLink>
          </div>
        </div>
      </div>
    </HomeSection>
  );
}
