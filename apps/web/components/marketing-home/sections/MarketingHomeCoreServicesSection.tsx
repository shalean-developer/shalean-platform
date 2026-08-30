import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Building2, House, Luggage, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";
import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
  afterCards?: ReactNode;
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

export function MarketingHomeCoreServicesSection({ cards, afterCards }: Props) {
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
      <MarketingSectionHeader
        eyebrow="Services"
        title="What do you need cleaned?"
        description="Choose the type of cleaning that best matches your space."
      />

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

      {afterCards ? <div className="mt-[var(--ui-space-8)]">{afterCards}</div> : null}
    </HomeSection>
  );
}
