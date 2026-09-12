import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";

const surfaces = [
  ["Warm section", "--marketing-surface-warm"],
  ["Soft yellow", "--marketing-surface-soft-yellow"],
  ["Soft blush", "--marketing-surface-soft-blush"],
  ["Soft aqua", "--marketing-surface-soft-aqua"],
  ["Soft lavender", "--marketing-surface-soft-lavender"],
  ["Step yellow", "--marketing-surface-step-yellow"],
  ["Step pink", "--marketing-surface-step-pink"],
  ["Step aqua", "--marketing-surface-step-aqua"],
] as const;

export function MarketingHomeSystemShowcase() {
  return (
    <section className="border-b border-border bg-background py-[var(--ui-space-10)] text-foreground">
      <div className="mx-auto w-full max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)]">
        <div className="flex flex-wrap gap-[var(--ui-space-2)] text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide">
          <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-primary-foreground">
            MARKETING SYSTEM
          </span>
          <span className="rounded-[var(--ui-radius-pill)] border border-border px-[var(--ui-space-3)] py-[var(--ui-space-1)]">
            Current homepage language
          </span>
        </div>
        <h2 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)]">
          Large public-marketing presentation roles
        </h2>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          These roles extend the compact product primitives for the public homepage. They own presentation only: a wider marketing canvas, 32px marketing cards, warm/pastel decorative surfaces and a larger centered section hierarchy.
        </p>
      </div>

      <HomeSection
        containerSize="marketing"
        className="mt-[var(--ui-space-8)] !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-12)]"
      >
        <MarketingSectionHeader
          eyebrow="Marketing section header"
          title="One reusable hierarchy for the large homepage sections."
          description="Services, customer proof, how it works and areas now consume this same heading pattern rather than reproducing typography and spacing independently."
        />

        <div className="mt-[var(--ui-space-10)] grid gap-[var(--ui-space-4)] sm:grid-cols-2 lg:grid-cols-4">
          {surfaces.map(([label, token]) => (
            <article
              key={token}
              className="overflow-hidden rounded-[var(--ui-radius-marketing)] border border-border bg-card shadow-[var(--ui-shadow-sm)]"
            >
              <div className="h-28" style={{ background: `var(${token})` }} aria-hidden />
              <div className="p-[var(--ui-space-4)]">
                <h3 className="text-[length:var(--ui-text-small)] font-semibold text-foreground">{label}</h3>
                <code className="mt-[var(--ui-space-2)] block text-[length:var(--ui-text-caption)] text-muted-foreground">
                  {token}
                </code>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-[var(--ui-space-8)] grid gap-[var(--ui-space-4)] md:grid-cols-2">
          <div className="rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-5)] shadow-[var(--ui-shadow-sm)]">
            <p className="text-[length:var(--ui-text-small)] font-semibold">Marketing card radius</p>
            <code className="mt-[var(--ui-space-2)] block text-[length:var(--ui-text-caption)] text-muted-foreground">
              --ui-radius-marketing · 2rem / 32px
            </code>
          </div>
          <div className="rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-5)] shadow-[var(--ui-shadow-sm)]">
            <p className="text-[length:var(--ui-text-small)] font-semibold">Marketing canvas</p>
            <code className="mt-[var(--ui-space-2)] block text-[length:var(--ui-text-caption)] text-muted-foreground">
              --ui-container-marketing · 112rem
            </code>
          </div>
        </div>
      </HomeSection>
    </section>
  );
}
