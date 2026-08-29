import { CalendarDays, MapPin, ReceiptText, ShieldCheck, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";

type TrustCard = {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  tone: string;
};

const TRUST_CARDS: readonly TrustCard[] = [
  {
    Icon: ShieldCheck,
    title: "Background-checked cleaners",
    subtitle: "Cleaners are vetted before they are available for customer bookings.",
    tone: "bg-[#e9efff]",
  },
  {
    Icon: CalendarDays,
    title: "Serving Cape Town since 2022",
    subtitle: "Shalean has provided professional cleaning services since 2022.",
    tone: "bg-[#fff0c9]",
  },
  {
    Icon: MapPin,
    title: "Cape Town service coverage",
    subtitle: "Home, apartment, office and specialist cleaning across supported Cape Town areas.",
    tone: "bg-[#dff5f2]",
  },
  {
    Icon: ReceiptText,
    title: "Transparent booking totals",
    subtitle: "Customers can review the quoted cleaning total before confirming checkout.",
    tone: "bg-[#f7e5f1]",
  },
] as const;

export function MarketingHomeTrustSection() {
  return (
    <HomeSection
      className="border-y border-border bg-background md:py-[var(--ui-space-20)]"
      aria-labelledby="homepage-trust-heading"
    >
      <header className="mx-auto max-w-5xl text-center">
        <p className="text-[length:var(--ui-text-body)] font-medium uppercase tracking-[0.08em] text-foreground/70">
          Customer proof
        </p>
        <h2
          id="homepage-trust-heading"
          className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground"
        >
          Why customers trust Shalean with their space.
        </h2>
        <p className="mx-auto mt-[var(--ui-space-4)] max-w-4xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-muted-foreground">
          Clear service facts, cleaner screening and transparent booking totals help customers book with confidence.
        </p>
      </header>

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-5)] sm:grid-cols-2 lg:grid-cols-4">
        {TRUST_CARDS.map(({ Icon, title, subtitle, tone }) => (
          <article
            key={title}
            className={`flex min-h-[300px] flex-col items-center rounded-[32px] ${tone} px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground transition-transform duration-200 hover:-translate-y-1 dark:bg-muted`}
          >
            <div className="flex h-24 w-24 items-center justify-center" aria-hidden>
              <Icon className="h-14 w-14 text-foreground" strokeWidth={1.5} />
            </div>

            <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-card-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mx-auto mt-[var(--ui-space-3)] max-w-xs text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-foreground/70">
              {subtitle}
            </p>
          </article>
        ))}
      </div>
    </HomeSection>
  );
}
