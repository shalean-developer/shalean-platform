import { SiteHeader } from "@/components/nav/SiteHeader";

const shellRules = [
  {
    title: "Canonical header",
    detail: "SiteHeader owns the shared public logo, primary navigation, Services dropdown, quote/book actions and mobile drawer presentation.",
  },
  {
    title: "Route ownership preserved",
    detail: "GlobalTopNav and MarketingHomeHeader remain the route-level entry points. RD-P02 does not move booking, account, Office, cleaner or auth routes into the public shell.",
  },
  {
    title: "Tracking preserved",
    detail: "Each public-header entry point supplies its existing CTA source strings to SiteHeader instead of changing analytics semantics.",
  },
  {
    title: "Responsive boundary",
    detail: "Desktop navigation is shown at the existing large breakpoint; mobile uses the existing Book action and hamburger drawer behaviour.",
  },
  {
    title: "Container direction",
    detail: "Public shell content should converge on the RD-P01 wide/content container and page-gutter tokens where this does not materially change page layouts.",
  },
  {
    title: "Business logic excluded",
    detail: "The public shell must not own booking state, payment logic, Supabase access, RBAC, account sessions or Office permissions.",
  },
];

export function RDP02PublicShellShowcase() {
  return (
    <section className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-[var(--ui-space-10)]">
      <div className="mb-[var(--ui-space-6)]">
        <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
          <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-primary-foreground">
            RD-P02B2
          </span>
          <span className="rounded-[var(--ui-radius-pill)] bg-secondary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-secondary-foreground">
            PUBLIC SHELL
          </span>
          <span className="rounded-[var(--ui-radius-pill)] bg-warning px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-warning-foreground">
            LOCAL VALIDATION
          </span>
        </div>
        <h1 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">
          Canonical public shell
        </h1>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          Active RD-P02 catalogue. This specimen renders the same canonical SiteHeader used by the current public-header entry points. Resize the browser to inspect desktop and mobile behaviour.
        </p>
      </div>

      <div className="overflow-hidden rounded-[var(--ui-radius-xl)] border border-border bg-card shadow-[var(--ui-shadow-md)]">
        <div className="border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]">
          <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">
            Live SiteHeader specimen
          </p>
        </div>
        <SiteHeader
          bookingHref="/book"
          mobileNavId="rd-p02-catalogue-mobile-nav"
          tracking={{
            desktopQuote: "ui_system_public_shell_quote",
            desktopBook: "ui_system_public_shell_book",
            mobileBook: "ui_system_public_shell_mobile_book",
            mobileQuote: "ui_system_public_shell_mobile_quote",
          }}
        />
      </div>

      <div className="mt-[var(--ui-space-8)] grid gap-[var(--ui-space-4)] md:grid-cols-2 lg:grid-cols-3">
        {shellRules.map((rule) => (
          <article
            key={rule.title}
            className="rounded-[var(--ui-radius-lg)] border border-border bg-card p-[var(--ui-space-5)] text-card-foreground shadow-[var(--ui-shadow-sm)]"
          >
            <h2 className="text-[length:var(--ui-text-small)] font-semibold text-foreground">
              {rule.title}
            </h2>
            <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
              {rule.detail}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-[var(--ui-space-6)] rounded-[var(--ui-radius-lg)] border border-border bg-muted p-[var(--ui-space-4)]">
        <p className="text-[length:var(--ui-text-small)] font-semibold text-foreground">
          RD-P02C catalogue target
        </p>
        <p className="mt-[var(--ui-space-1)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          The canonical public footer and shared public page-container specimen will be added here in the next controlled slice after their implementation.
        </p>
      </div>
    </section>
  );
}
