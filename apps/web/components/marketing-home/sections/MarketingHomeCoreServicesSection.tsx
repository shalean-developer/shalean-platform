import Link from "next/link";
import { ArrowRight, Building2, House, Luggage, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
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
    description: "Regular home cleaning and deeper whole-home cleaning for everyday living.",
    icon: House,
    serviceIds: ["standard", "deep"],
  },
  {
    id: "moving-stays",
    title: "Moving & Stays",
    description: "Cleaning for move-ins, move-outs and guest-ready Airbnb turnovers.",
    icon: Luggage,
    serviceIds: ["move", "airbnb"],
  },
  {
    id: "workplace-specialist",
    title: "Workplace & Specialist",
    description: "Professional office cleaning and specialist carpet care for cleaner spaces.",
    icon: Building2,
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
    <HomeSection
      id="our-services"
      className="scroll-mt-24 rounded-t-[32px] !bg-[#f7f0e4] md:py-[var(--ui-space-20)] dark:!bg-[#171512]"
      aria-label="Cleaning services"
    >
      <header className="mx-auto max-w-5xl text-center">
        <p className="text-[length:var(--ui-text-body)] font-medium uppercase tracking-[0.08em] text-foreground/75">
          What we offer
        </p>
        <h2 className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
          Cleaning services for every kind of space.
        </h2>
        <p className="mx-auto mt-[var(--ui-space-4)] max-w-4xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-foreground/75">
          From regular home cleaning to moves, stays, workplaces and specialist carpet care, choose the group that fits what you need.
        </p>
      </header>

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-8)] md:grid-cols-3">
        {groups.map((group) => {
          const GroupIcon = group.icon;

          return (
            <article
              key={group.id}
              className="flex min-h-[360px] flex-col items-center rounded-[32px] bg-card px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-card-foreground shadow-[var(--ui-shadow-lg)] transition-transform duration-200 hover:-translate-y-1"
            >
              <div className="relative flex h-24 w-24 items-center justify-center" aria-hidden>
                <span className="absolute h-16 w-16 rounded-full bg-primary/15" />
                <GroupIcon className="relative h-14 w-14 text-foreground" strokeWidth={1.55} />
              </div>

              <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
                {group.title}
              </h3>
              <p className="mx-auto mt-[var(--ui-space-3)] max-w-xs text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-muted-foreground">
                {group.description}
              </p>

              <div className="mt-auto w-full pt-[var(--ui-space-8)]">
                <div className="divide-y divide-border border-t border-border text-left">
                  {group.services.map(({ id, title, priceLabel, href }) => (
                    <Link
                      key={id}
                      href={href}
                      className="group/service flex min-h-14 items-center justify-between gap-[var(--ui-space-3)] py-[var(--ui-space-3)] text-[length:var(--ui-text-small)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
    </HomeSection>
  );
}
