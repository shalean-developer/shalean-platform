import { HomeSection } from "@/components/marketing-home/primitives/HomeSection";

function HeaderSkeleton() {
  return (
    <>
      <div className="mx-auto h-5 w-28 animate-pulse rounded-[var(--ui-radius-pill)] bg-muted" />
      <div className="mx-auto mt-[var(--ui-space-5)] h-10 w-full max-w-xl animate-pulse rounded-[var(--ui-radius-lg)] bg-muted" />
      <div className="mx-auto mt-[var(--ui-space-4)] h-5 w-full max-w-2xl animate-pulse rounded-[var(--ui-radius-lg)] bg-muted" />
    </>
  );
}

/** Placeholder while CMS services, FAQ, areas, and JSON-LD stream in. */
export function MarketingHomeDbSectionsFallback() {
  return (
    <>
      <HomeSection containerSize="marketing" className="!bg-[var(--marketing-surface-warm)]" aria-hidden>
        <HeaderSkeleton />
        <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-h-[400px] animate-pulse rounded-[var(--ui-radius-marketing)] bg-card shadow-[var(--ui-shadow-sm)]" />
          ))}
        </div>
      </HomeSection>

      <HomeSection containerSize="marketing" aria-hidden>
        <HeaderSkeleton />
        <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-6)] md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="min-h-[320px] animate-pulse rounded-[var(--ui-radius-marketing)] bg-muted/60" />
          ))}
        </div>
      </HomeSection>

      <HomeSection containerSize="marketing" className="!bg-[var(--marketing-surface-warm)]" aria-hidden>
        <HeaderSkeleton />
        <div className="mt-[var(--ui-space-16)] grid gap-[var(--ui-space-5)] sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-h-[300px] animate-pulse rounded-[var(--ui-radius-marketing)] bg-card shadow-[var(--ui-shadow-sm)]" />
          ))}
        </div>
      </HomeSection>
    </>
  );
}
