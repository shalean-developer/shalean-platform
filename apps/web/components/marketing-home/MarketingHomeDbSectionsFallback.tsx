import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";

/** Placeholder while CMS services, FAQ, areas, and JSON-LD stream in. */
export function MarketingHomeDbSectionsFallback() {
  return (
    <>
      <HomeSection
        containerSize="marketing"
        className="!bg-[var(--marketing-surface-warm)] md:py-[var(--ui-space-20)]"
        aria-hidden
      >
        <div className="mx-auto h-5 w-36 animate-pulse rounded-[var(--ui-radius-pill)] bg-muted" />
        <div className="mx-auto mt-[var(--ui-space-6)] h-10 w-full max-w-xl animate-pulse rounded-[var(--ui-radius-lg)] bg-muted" />
        <div className="mx-auto mt-[var(--ui-space-4)] h-6 w-full max-w-3xl animate-pulse rounded-[var(--ui-radius-lg)] bg-muted" />
        <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-8)] md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-h-[360px] animate-pulse rounded-[var(--ui-radius-marketing)] bg-card shadow-[var(--ui-shadow-sm)]"
            />
          ))}
        </div>
      </HomeSection>

      <HomeSection containerSize="marketing" aria-hidden>
        <div className="mx-auto h-5 w-36 animate-pulse rounded-[var(--ui-radius-pill)] bg-muted" />
        <div className="mx-auto mt-[var(--ui-space-6)] h-10 w-full max-w-xl animate-pulse rounded-[var(--ui-radius-lg)] bg-muted" />
        <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="min-h-[360px] animate-pulse rounded-[var(--ui-radius-marketing)] bg-muted/60"
            />
          ))}
        </div>
      </HomeSection>
    </>
  );
}
