import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";
import { MarketingSectionHeader } from "@/components/marketing-home/primitives/MarketingSectionHeader";

const surfaces = [
  ["Cool Cloud", "--marketing-surface-warm"],
  ["Editorial white", "--marketing-surface-soft-yellow"],
  ["Soft blue", "--marketing-surface-soft-blush"],
  ["Blue Ice", "--marketing-surface-soft-aqua"],
  ["Mist blue", "--marketing-surface-soft-lavender"],
  ["Blue border", "--marketing-surface-step-yellow"],
  ["Powder Blue", "--marketing-surface-step-pink"],
  ["Blue Tint", "--marketing-surface-step-aqua"],
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
          Editorial campaign presentation roles
        </h2>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          These roles reproduce the current Shalean homepage direction: a white sticky header, navy image-led hero, overlapping story cards, cool editorial surfaces, compact rectangular actions and a strong blue closing banner.
        </p>
      </div>

      <HomeSection
        containerSize="marketing"
        className="mt-[var(--ui-space-8)] !bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-12)]"
      >
        <MarketingSectionHeader
          eyebrow="Campaign system"
          title="A cleaner space. A brighter day."
          description="The homepage uses a clear editorial sequence: campaign hero, cleaning stories, service solutions, proof, local coverage, questions and one decisive booking action."
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
            <p className="text-[length:var(--ui-text-small)] font-semibold">Editorial card radius</p>
            <code className="mt-[var(--ui-space-2)] block text-[length:var(--ui-text-caption)] text-muted-foreground">
              rounded-lg · compact campaign cards
            </code>
          </div>
          <div className="rounded-[var(--ui-radius-marketing)] border border-border bg-card p-[var(--ui-space-5)] shadow-[var(--ui-shadow-sm)]">
            <p className="text-[length:var(--ui-text-small)] font-semibold">Marketing canvas</p>
            <code className="mt-[var(--ui-space-2)] block text-[length:var(--ui-text-caption)] text-muted-foreground">
              --ui-container-marketing · 112rem
            </code>
          </div>
        </div>

        <div className="mt-[var(--ui-space-8)] overflow-hidden rounded-lg bg-[#00164E] p-8 text-white shadow-[var(--ui-shadow-lg)] md:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">Hero and CTA specimen</p>
          <h3 className="mt-4 max-w-2xl text-4xl font-semibold leading-none tracking-tight md:text-6xl">
            A cleaner space. <span className="block text-[#0051FF]">A brighter day.</span>
          </h3>
          <p className="mt-5 max-w-xl text-white/80">Shalean content remains direct, local and service-led while adopting the approved campaign hierarchy.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <span className="rounded-md bg-[#0051FF] px-6 py-3 text-sm font-semibold uppercase tracking-wide">See instant price</span>
            <span className="rounded-md border border-white/50 px-6 py-3 text-sm font-semibold uppercase tracking-wide">Request a quote</span>
          </div>
        </div>
      </HomeSection>
    </section>
  );
}
