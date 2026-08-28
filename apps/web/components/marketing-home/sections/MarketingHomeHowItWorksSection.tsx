import { Fragment } from "react";
import { MousePointerClick, Sparkles, Home, ArrowRight } from "lucide-react";
import { HomeFeatureCard } from "@/components/marketing-home/primitives/HomeFeatureCard";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";

const STEPS = [
  {
    step: "1",
    Icon: MousePointerClick,
    title: "Book online",
    desc: "Choose your service, tell us about your space, and pick a time that suits you.",
  },
  {
    step: "2",
    Icon: Sparkles,
    title: "We clean",
    desc: "Our professional team arrives on time and gets to work.",
  },
  {
    step: "3",
    Icon: Home,
    title: "You relax",
    desc: "Come home to a spotless space. Clean and hassle-free, every time.",
  },
] as const;

export function MarketingHomeHowItWorksSection() {
  return (
    <HomeSection id="how-it-works" className="scroll-mt-24 border-t border-border">
      <HomeSectionHeader
        align="center"
        eyebrow="How it works"
        title="From booking to a fresh home"
        description="Simple, fast and hassle-free."
      />

      <div className="mt-[var(--ui-space-12)] flex flex-col items-stretch gap-[var(--ui-space-4)] sm:flex-row sm:items-start">
        {STEPS.map(({ step, Icon, title, desc }, index) => (
          <Fragment key={step}>
            <HomeFeatureCard icon={Icon} title={title} className="relative flex flex-1 flex-col">
              <span className="absolute right-[var(--ui-space-5)] top-[var(--ui-space-5)] flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[length:var(--ui-text-small)] font-bold text-primary-foreground">
                {step}
              </span>
              {desc}
            </HomeFeatureCard>
            {index < STEPS.length - 1 ? (
              <div className="hidden items-center justify-center self-center sm:flex" aria-hidden>
                <ArrowRight className="h-5 w-5 text-muted-foreground/50" />
              </div>
            ) : null}
          </Fragment>
        ))}
      </div>
    </HomeSection>
  );
}
