import { CalendarCheck, House, Sparkles, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";

type HowItWorksStep = {
  step: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  surface: string;
};

const STEPS: readonly HowItWorksStep[] = [
  {
    step: "Step 1",
    Icon: CalendarCheck,
    title: "Book online",
    description: "Choose your service, tell us about your space and pick a time that suits you.",
    surface: "var(--marketing-surface-step-yellow)",
  },
  {
    step: "Step 2",
    Icon: Sparkles,
    title: "We clean",
    description: "A vetted Shalean cleaner or team arrives for the service you selected.",
    surface: "var(--marketing-surface-step-pink)",
  },
  {
    step: "Step 3",
    Icon: House,
    title: "You relax",
    description: "Enjoy a fresh, professionally cleaned space without the usual hassle.",
    surface: "var(--marketing-surface-step-aqua)",
  },
] as const;

export function MarketingHomeHowItWorksSection() {
  return (
    <HomeSection
      id="how-it-works"
      containerSize="marketing"
      className="scroll-mt-24 !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-20)]"
      aria-label="How Shalean cleaning works"
    >
      <MarketingSectionHeader
        eyebrow="How it works"
        title="From booking to a fresh, clean space."
        description="Three simple steps make it easy to book the right cleaning service and get on with your day."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-8)] md:grid-cols-3">
        {STEPS.map(({ step, Icon, title, description, surface }) => (
          <article
            key={step}
            className="flex min-h-[360px] flex-col items-center rounded-[var(--ui-radius-marketing)] px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground transition-transform duration-200 hover:-translate-y-1"
            style={{ backgroundColor: surface }}
          >
            <div className="flex h-24 w-24 items-center justify-center" aria-hidden>
              <Icon className="h-16 w-16" strokeWidth={1.45} />
            </div>

            <h3 className="mt-[var(--ui-space-5)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
              {title}
            </h3>
            <p className="mx-auto mt-[var(--ui-space-3)] max-w-sm text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-foreground/75">
              {description}
            </p>

            <div className="mt-auto w-full pt-[var(--ui-space-8)]">
              <div className="mx-auto flex min-h-14 max-w-[300px] items-center justify-center rounded-full bg-background px-[var(--ui-space-6)] text-[length:var(--ui-text-body)] font-medium text-foreground shadow-[var(--ui-shadow-sm)]">
                {step}
              </div>
            </div>
          </article>
        ))}
      </div>
    </HomeSection>
  );
}
