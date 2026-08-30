import { BadgeCheck, CalendarCheck, ShieldCheck } from "lucide-react";
import { HomeFeatureCard } from "@/components/marketing-home/primitives/HomeFeatureCard";
import { HomeProofCard } from "@/components/marketing-home/primitives/HomeProofCard";
import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { HomeSectionHeader } from "@/components/marketing-home/primitives/HomeSectionHeader";
import { MarketingHomeFinalCta } from "@/components/marketing-home/sections/MarketingHomeFinalCta";
import { MarketingHomeHeroSection } from "@/components/marketing-home/sections/MarketingHomeHeroSection";

export function RDP03HomepagePrimitivesShowcase() {
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] pt-[var(--ui-space-10)]">
        <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
          <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-primary-foreground">RD-P03</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-secondary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-secondary-foreground">HOMEPAGE SYSTEM</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-warning px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-warning-foreground">CURRENT SPECIMEN</span>
        </div>
        <h1 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Reusable homepage section system</h1>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">Development-only specimens for the current homepage hero, section framing, heading, feature-card, proof-card and final-conversion patterns.</p>
      </div>

      <div className="mt-[var(--ui-space-6)] border-y border-border">
        <div className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] pt-[var(--ui-space-5)]">
          <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Current homepage hero specimen</p>
        </div>
        <MarketingHomeHeroSection />
      </div>

      <HomeSection className="border-b border-border" tone="muted">
        <HomeSectionHeader eyebrow="Section header" title="A clear reusable section hierarchy" description="One heading pattern can introduce multiple homepage sections without repeating typography and spacing rules." />
        <div className="mt-[var(--ui-space-8)] grid gap-[var(--ui-space-4)] md:grid-cols-3">
          <HomeFeatureCard icon={ShieldCheck} title="Feature card">Concise reusable presentation for a benefit or process point.</HomeFeatureCard>
          <HomeFeatureCard icon={CalendarCheck} title="Shared spacing">Uses canonical semantic tokens and layout scales.</HomeFeatureCard>
          <HomeFeatureCard icon={BadgeCheck} title="Domain-neutral">Business data and rules stay outside this primitive.</HomeFeatureCard>
        </div>
      </HomeSection>

      <HomeSection>
        <HomeSectionHeader eyebrow="Proof cards" title="Evidence has its own visual pattern" description="HomeProofCard presents a label, value and supporting detail without owning the source data." />
        <div className="mt-[var(--ui-space-8)] grid gap-[var(--ui-space-4)] sm:grid-cols-2 lg:grid-cols-4">
          <HomeProofCard label="Example" value="Value A" detail="Default proof treatment." />
          <HomeProofCard label="Example" value="Value B" detail="Brand proof treatment." tone="brand" />
          <HomeProofCard label="Example" value="Value C" detail="Source data remains external." />
          <HomeProofCard label="Example" value="Value D" detail="Presentation only." />
        </div>
      </HomeSection>

      <div className="border-y border-border">
        <MarketingHomeFinalCta />
      </div>

      <div className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-[var(--ui-space-12)]">
        <div className="rounded-[var(--ui-radius-lg)] border border-border bg-muted p-[var(--ui-space-4)]">
          <p className="text-[length:var(--ui-text-small)] font-semibold text-foreground">RD-P03 boundary</p>
          <p className="mt-[var(--ui-space-1)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">The reusable homepage system owns presentation only. Service data, pricing, booking state, reviews, CMS queries, FAQ behaviour, location data, promotion APIs, analytics and SEO authority remain outside these primitives.</p>
        </div>
      </div>
    </section>
  );
}
