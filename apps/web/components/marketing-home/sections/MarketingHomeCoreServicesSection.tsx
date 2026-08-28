import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import type { MarketingHomeServiceCard } from "@/lib/marketing/marketingHomeServicePresentation";

type Props = {
  cards: MarketingHomeServiceCard[];
};

export function MarketingHomeCoreServicesSection({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <HomeSection id="our-services" className="scroll-mt-24" aria-label="Cleaning services">
      <HomeSectionHeader
        eyebrow="Our services"
        title="Choose the cleaning service that fits your space"
        description="Explore Shalean's six core cleaning services, with current starting prices where available."
        align="center"
      />

      <div className="mt-[var(--ui-space-10)] grid gap-[var(--ui-space-5)] sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ id, image, imageAlt, icon: Icon, title, description, priceLabel, href }) => (
          <Link
            key={id}
            href={href}
            className="group flex min-h-full flex-col overflow-hidden rounded-[var(--ui-radius-xl)] border border-border bg-card text-card-foreground shadow-[var(--ui-shadow-sm)] transition hover:-translate-y-0.5 hover:shadow-[var(--ui-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
              <Image
                src={image}
                alt={imageAlt}
                fill
                className="object-cover object-center transition duration-300 group-hover:scale-[1.02]"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>

            <div className="flex flex-1 flex-col p-[var(--ui-space-5)]">
              <div className="flex items-start gap-[var(--ui-space-3)]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--ui-radius-lg)] bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[length:var(--ui-text-card-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
                    {title}
                  </h3>
                  {priceLabel ? (
                    <p className="mt-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] text-muted-foreground">
                      From <span className="font-semibold text-primary">{priceLabel}</span>
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="mt-[var(--ui-space-4)] flex-1 text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                {description}
              </p>

              <div className="mt-[var(--ui-space-5)] flex items-center justify-between border-t border-border pt-[var(--ui-space-4)] text-[length:var(--ui-text-small)] font-semibold text-primary">
                <span>View service</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
            </div>
          </Link>
        ))}
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
