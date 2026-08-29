import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
};

type ServiceGroup = {
  id: string;
  title: string;
  description: string;
  serviceIds: readonly MarketingHomeServiceCard["id"][];
};

const SERVICE_GROUPS: readonly ServiceGroup[] = [
  {
    id: "home-cleaning",
    title: "Home Cleaning",
    description: "For regular upkeep or a more detailed whole-home clean.",
    serviceIds: ["standard", "deep"],
  },
  {
    id: "moving-stays",
    title: "Moving & Stays",
    description: "Cleaning for handovers, moving days and guest-ready turnovers.",
    serviceIds: ["move", "airbnb"],
  },
  {
    id: "workplace-specialist",
    title: "Workplace & Specialist",
    description: "Professional workplace cleaning and focused carpet care.",
    serviceIds: ["office", "carpet"],
  },
] as const;

export function MarketingHomeCoreServicesSection({ cards }: Props) {
  if (cards.length === 0) return null;

  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const groups = SERVICE_GROUPS.map((group) => ({
    ...group,
    services: group.serviceIds
      .map((serviceId) => cardsById.get(serviceId))
      .filter((service): service is MarketingHomeServiceCard => Boolean(service)),
  })).filter((group) => group.services.length > 0);

  return (
    <HomeSection id="our-services" className="scroll-mt-24" aria-label="Cleaning services">
      <HomeSectionHeader
        eyebrow="Our services"
        title="Six services, grouped around what you need"
        description="Choose from three simple service groups, then open the cleaning option that fits your space."
        align="center"
      />

      <div className="mt-[var(--ui-space-10)] grid gap-[var(--ui-space-5)] lg:grid-cols-3">
        {groups.map((group) => {
          const imageCard = group.services[0];

          return (
            <article
              key={group.id}
              className="flex min-h-full flex-col overflow-hidden rounded-[var(--ui-radius-xl)] border border-border bg-card text-card-foreground shadow-[var(--ui-shadow-sm)]"
            >
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
                <Image
                  src={imageCard.image}
                  alt={imageCard.imageAlt}
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 33vw"
                />
              </div>

              <div className="flex flex-1 flex-col p-[var(--ui-space-5)]">
                <div>
                  <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
                    {group.title}
                  </h3>
                  <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                    {group.description}
                  </p>
                </div>

                <div className="mt-[var(--ui-space-5)] divide-y divide-border border-t border-border">
                  {group.services.map(({ id, icon: Icon, title, priceLabel, href }) => (
                    <Link
                      key={id}
                      href={href}
                      className="group/service flex items-center gap-[var(--ui-space-3)] py-[var(--ui-space-4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-lg)] bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[length:var(--ui-text-body)] font-semibold text-foreground">
                          {title}
                        </span>
                        <span className="mt-[var(--ui-space-1)] block text-[length:var(--ui-text-caption)] text-muted-foreground">
                          {priceLabel ? (
                            <>
                              From <span className="font-semibold text-primary">{priceLabel}</span>
                            </>
                          ) : (
                            "View service details"
                          )}
                        </span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover/service:translate-x-0.5 group-hover/service:text-primary"
                        aria-hidden
                      />
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
          className="inline-flex min-h-11 items-center justify-center gap-[var(--ui-space-2)] rounded-[var(--ui-radius-lg)] border border-border bg-background px-[var(--ui-space-5)] text-[length:var(--ui-text-small)] font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          View all services
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </HomeSection>
  );
}
