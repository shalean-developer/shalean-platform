import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, House, Luggage, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import { ServicesBookingExtrasSection } from "@/components/services/ServicesBookingExtrasSection";
import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
  afterCards?: ReactNode;
  layout?: "grouped" | "individual";
};

type ServiceGroup = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  serviceIds: readonly MarketingHomeServiceCard["id"][];
};

const SERVICE_GROUPS: readonly ServiceGroup[] = [
  {
    id: "home-cleaning",
    title: "Home Cleaning",
    description: "Everyday cleaning and deeper whole-home care.",
    icon: House,
    serviceIds: ["standard", "deep"],
  },
  {
    id: "moving-stays",
    title: "Moving & Stays",
    description: "Move cleans and guest-ready Airbnb turnovers.",
    icon: Luggage,
    serviceIds: ["move", "airbnb"],
  },
  {
    id: "workplace-specialist",
    title: "Workplace & Specialist",
    description: "Office cleaning and specialist carpet care.",
    icon: Building2,
    serviceIds: ["office", "carpet"],
  },
] as const;

export function MarketingHomeCoreServicesSection({ cards, afterCards, layout = "grouped" }: Props) {
  if (cards.length === 0) return null;

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const groups = SERVICE_GROUPS.map((group) => ({
    ...group,
    services: group.serviceIds
      .map((serviceId) => cardsById.get(serviceId))
      .filter((service): service is MarketingHomeServiceCard => Boolean(service)),
  })).filter((group) => group.services.length > 0);

  return (
    <HomeSection
      id="our-services"
      containerSize="marketing"
      className="scroll-mt-24 !bg-[#F4F6FA] md:py-[var(--ui-space-20)]"
      aria-label="Cleaning services"
    >
      <span id="service-options" className="sr-only" aria-hidden />
      <MarketingSectionHeader
        eyebrow="Services"
        title="What do you need cleaned?"
        description="Choose the type of cleaning that best matches your space."
      />

      {layout === "individual" ? (
        <>
          <div className="mt-[var(--ui-space-12)] grid gap-[var(--ui-space-6)] sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(({ id, title, description, priceLabel, href, image, imageAlt, icon: ServiceIcon }) => (
              <article
                key={id}
                className="group flex overflow-hidden rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-card text-card-foreground shadow-[var(--ui-shadow-sm)] transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--ui-shadow-md)]"
              >
                <div className="flex w-full flex-col">
                  <Link
                    href={href}
                    aria-label={`View ${title}`}
                    className="relative block aspect-[16/9] overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Image
                      src={image}
                      alt={imageAlt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <span className="absolute left-[var(--ui-space-4)] top-[var(--ui-space-4)] flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-primary shadow-[var(--ui-shadow-sm)]" aria-hidden>
                      <ServiceIcon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    {priceLabel ? (
                      <span className="absolute right-[var(--ui-space-4)] top-[var(--ui-space-4)] rounded-[var(--ui-radius-pill)] bg-white/95 px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-medium text-primary shadow-[var(--ui-shadow-sm)]">
                        From {priceLabel}
                      </span>
                    ) : null}
                  </Link>

                  <div className="flex flex-1 flex-col px-6 pb-7 pt-5 md:px-7 md:pb-8 md:pt-6">
                    <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
                      {title}
                    </h3>
                    <p className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                      {description}
                    </p>

                    <div className="mt-auto pt-6">
                      <Link
                        href={href}
                        className="inline-flex min-h-11 items-center gap-[var(--ui-space-2)] font-medium text-primary hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        View service
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-[var(--ui-space-8)]">
            <ServicesBookingExtrasSection />
          </div>
        </>
      ) : (
        <>
          <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-3">
          {groups.map((group) => {
            const GroupIcon = group.icon;

            return (
              <article
                key={group.id}
                className="flex min-h-[400px] flex-col rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-card p-[var(--ui-space-8)] text-card-foreground shadow-[var(--ui-shadow-md)] transition-transform duration-200 hover:-translate-y-1"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#EFF6FF] text-primary" aria-hidden>
                  <GroupIcon className="h-8 w-8" strokeWidth={1.7} />
                </div>

                <h3 className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
                  {group.title}
                </h3>
                <p className="mt-[var(--ui-space-3)] max-w-sm text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
                  {group.description}
                </p>

                <div className="mt-auto pt-[var(--ui-space-8)]">
                  <div className="space-y-[var(--ui-space-3)]">
                    {group.services.map(({ id, title, priceLabel, href }) => (
                      <Link
                        key={id}
                        href={href}
                        className="group/service flex min-h-14 items-center justify-between gap-[var(--ui-space-3)] rounded-[var(--ui-radius-xl)] border border-[#DBEAFE] bg-background px-[var(--ui-space-4)] text-[length:var(--ui-text-small)] transition hover:border-primary/40 hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <span className="font-medium text-foreground">{title}</span>
                        <span className="flex shrink-0 items-center gap-[var(--ui-space-2)] text-[length:var(--ui-text-caption)] text-muted-foreground transition-colors group-hover/service:text-primary">
                          {priceLabel ? `From ${priceLabel}` : "View"}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover/service:translate-x-0.5" aria-hidden />
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

          <div className="mt-[var(--ui-space-8)] flex justify-center">
            <Link
              href="/services"
              className="inline-flex min-h-12 items-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-pill)] border border-border bg-card px-[var(--ui-space-6)] text-[length:var(--ui-text-small)] font-medium text-foreground shadow-[var(--ui-shadow-sm)] transition hover:border-primary/30 hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Compare all cleaning services
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </>
      )}

      {afterCards ? <div className="mt-[var(--ui-space-8)]">{afterCards}</div> : null}
    </HomeSection>
  );
}
