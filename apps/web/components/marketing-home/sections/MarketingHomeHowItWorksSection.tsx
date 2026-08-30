import { CalendarCheck, House, Sparkles, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";

type HowItWorksStep = {
  step: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  surface: string;
  iconTone: string;
};

const STEPS: readonly HowItWorksStep[] = [
  {
    step: "01",
    Icon: CalendarCheck,
    title: "Book online",
    description: "Choose your service, share the details and pick a time that suits you.",
    surface: "#F2D6A2",
    iconTone: "var(--navy-from)",
  },
  {
    step: "02",
    Icon: Sparkles,
    title: "We clean",
    description: "A vetted Shalean cleaner or team arrives for the service you selected.",
    surface: "#DBEAFE",
    iconTone: "var(--primary)",
  },
  {
    step: "03",
    Icon: House,
    title: "You relax",
    description: "Enjoy a professionally cleaned space while we take care of the work.",
    surface: "#EFF6FF",
    iconTone: "var(--navy-to)",
  },
] as const;

export function MarketingHomeHowItWorksSection() {
  return (
    <HomeSection
      id="how-it-works"
      containerSize="marketing"
      className="scroll-mt-24 bg-background md:py-[var(--ui-space-20)]"
      aria-label="How Shalean cleaning works"
    >
      <MarketingSectionHeader
        eyebrow="How it works"
        title="Simple from booking to clean"
        description="Three clear steps from choosing a service to enjoying a cleaner space."
      />

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-3">
        {STEPS.map(({ step, Icon, title, description, surface, iconTone }) => (
          <article
            key={step}
            className="relative flex min-h-[320px] flex-col rounded-[var(--ui-radius-marketing)] border border-black/5 p-[var(--ui-space-8)] text-foreground shadow-[var(--ui-shadow-sm)]"
            style={{ backgroundColor: surface }}
          >
            <div className="flex items-start justify-between gap-[var(--ui-space-4)]">
              <span className="text-[length:var(--ui-text-small)] font-semibold tracking-[0.12em] text-foreground/60">
                {step}
              </span>
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-background/85 shadow-[var(--ui-shadow-sm)]"
                style={{ color: iconTone }}
                aria-hidden
              >
                <Icon className="h-7 w-7" strokeWidth={1.65} />
              </div>
            </div>

            <div className="mt-auto pt-[var(--ui-space-12)]">
              <h3 className="text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight">
                {title}
              </h3>
              <p className="mt-[var(--ui-space-3)] max-w-sm text-[length:var(--ui-text-body)] leading-[var(--ui-leading-body)] text-foreground/75">
                {description}
              </p>
            </div>
          </article>
        ))}
      </div>
    </HomeSection>
  );
}
