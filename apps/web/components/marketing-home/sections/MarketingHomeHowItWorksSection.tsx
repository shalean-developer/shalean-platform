import { CalendarCheck, House, Sparkles, type LucideIcon } from "lucide-react";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";

type HowItWorksStep = {
  step: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  cardClassName: string;
};

const STEPS: readonly HowItWorksStep[] = [
  {
    step: "Step 1",
    Icon: CalendarCheck,
    title: "Book online",
    description: "Choose your service, tell us about your space and pick a time that suits you.",
    cardClassName: "bg-[#f8dfa0] dark:bg-[#5b4a23]",
  },
  {
    step: "Step 2",
    Icon: Sparkles,
    title: "We clean",
    description: "A vetted Shalean cleaner or team arrives for the service you selected.",
    cardClassName: "bg-[#f3addf] dark:bg-[#59324e]",
  },
  {
    step: "Step 3",
    Icon: House,
    title: "You relax",
    description: "Enjoy a fresh, professionally cleaned space without the usual hassle.",
    cardClassName: "bg-[#afe0df] dark:bg-[#274c4b]",
  },
] as const;

export function MarketingHomeHowItWorksSection() {
  return (
    <HomeSection
      id="how-it-works"
      className="scroll-mt-24 !bg-[#f7f0e4] md:py-[var(--ui-space-20)] dark:!bg-[#171512]"
      aria-label="How Shalean cleaning works"
    >
      <header className="mx-auto max-w-5xl text-center">
        <p className="text-[length:var(--ui-text-body)] font-medium uppercase tracking-[0.08em] text-foreground/75">
          How it works
        </p>
        <h2 className="mt-[var(--ui-space-6)] text-[length:var(--ui-text-page-title)] font-semibold leading-[var(--ui-leading-tight)] tracking-tight text-foreground">
          From booking to a fresh, clean space.
        </h2>
        <p className="mx-auto mt-[var(--ui-space-4)] max-w-3xl text-[length:var(--ui-text-lead)] leading-[var(--ui-leading-body)] text-foreground/75">
          Three simple steps make it easy to book the right cleaning service and get on with your day.
        </p>
      </header>

      <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-8)] md:grid-cols-3">
        {STEPS.map(({ step, Icon, title, description, cardClassName }) => (
          <article
            key={step}
            className={`flex min-h-[360px] flex-col items-center rounded-[32px] px-[var(--ui-space-6)] py-[var(--ui-space-10)] text-center text-foreground transition-transform duration-200 hover:-translate-y-1 ${cardClassName}`}
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
