import { CalendarCheck, House, Sparkles, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";

type HowItWorksStep = {
  step: string;
  Icon: LucideIcon;
  title: string;
  description: string;
};

const STEPS: readonly HowItWorksStep[] = [
  {
    step: "01",
    Icon: CalendarCheck,
    title: "Book online",
    description: "Choose your service, share the details and pick a time that suits you.",
  },
  {
    step: "02",
    Icon: Sparkles,
    title: "We clean",
    description: "A vetted Shalean cleaner or team arrives for the service you selected.",
  },
  {
    step: "03",
    Icon: House,
    title: "You relax",
    description: "Enjoy a professionally cleaned space while we take care of the work.",
  },
] as const;

export function MarketingHomeHowItWorksSection() {
  return (
    <HomeSection
      id="how-it-works"
      containerSize="marketing"
      className="scroll-mt-24 bg-primary/10 md:py-[var(--ui-space-20)]"
      aria-label="How Shalean cleaning works"
    >
      <MarketingSectionHeader
        eyebrow="How it works"
        title="Simple from booking to clean"
        description="Three clear steps from choosing a service to enjoying a cleaner space."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-3">
        {STEPS.map(({ step, Icon, title, description }) => (
          <article
            key={step}
            className="relative flex min-h-[180px] flex-col items-center justify-center rounded-[var(--ui-radius-marketing)] border border-border/60 bg-card p-[var(--ui-space-5)] text-center text-card-foreground shadow-[var(--ui-shadow-lg)]"
          >
            <span className="absolute right-[var(--ui-space-5)] top-[var(--ui-space-4)] text-[length:var(--ui-text-caption)] font-semibold tracking-[0.12em] text-muted-foreground">
              {step}
            </span>

            <div
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-[var(--navy-from)]"
              aria-hidden
            >
              <Icon className="h-6 w-6" strokeWidth={1.65} />
            </div>

            <div className="mt-[var(--ui-space-3)]">
              <h3 className="text-[length:var(--ui-text-card-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight">
                {title}
              </h3>
              <p className="mx-auto mt-[var(--ui-space-2)] max-w-xs text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
                {description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </HomeSection>
  );
}
