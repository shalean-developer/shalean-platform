import { PublicPageContainer } from "@/components/nav/PublicPageContainer";
import { SiteFooter } from "@/components/nav/SiteFooter";
import { SiteHeader } from "@/components/nav/SiteHeader";

const shellRules = [
  { title: "Canonical header", detail: "SiteHeader owns the shared public logo, primary navigation, Services dropdown, quote/book actions and mobile drawer presentation." },
  { title: "Canonical footer", detail: "SiteFooter owns public footer navigation, contact details, social links and the existing analytics-aware WhatsApp/phone interactions." },
  { title: "Shared container", detail: "PublicPageContainer provides RD-P01 wide/content widths plus the canonical page gutter without forcing page-specific body layouts to migrate in one step." },
  { title: "Route ownership preserved", detail: "GlobalTopNav, MarketingHomeHeader and existing page-level footer wrappers remain route-level entry points during incremental migration." },
  { title: "Tracking preserved", detail: "Public-shell entry points keep their existing CTA source strings and footer interaction analytics semantics." },
  { title: "Business logic excluded", detail: "The public shell must not own booking state, payment logic, Supabase access, RBAC, account sessions or Office permissions." },
];

export function RDP02PublicShellShowcase() {
  return (
    <section className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-[var(--ui-space-10)]">
      <div className="mb-[var(--ui-space-6)]">
        <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
          <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-primary-foreground">RD-P02C</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-secondary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-secondary-foreground">PUBLIC SHELL</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-warning px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-warning-foreground">LOCAL VALIDATION</span>
        </div>
        <h1 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Canonical public shell</h1>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">Active RD-P02 catalogue showing the canonical SiteHeader, PublicPageContainer and SiteFooter used by the public shell.</p>
      </div>

      <div className="overflow-hidden rounded-[var(--ui-radius-xl)] border border-border bg-card shadow-[var(--ui-shadow-md)]">
        <div className="border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]"><p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Live SiteHeader specimen</p></div>
        <SiteHeader bookingHref="/book" mobileNavId="rd-p02-catalogue-mobile-nav" tracking={{ desktopQuote: "ui_system_public_shell_quote", desktopBook: "ui_system_public_shell_book", mobileBook: "ui_system_public_shell_mobile_book", mobileQuote: "ui_system_public_shell_mobile_quote" }} />
      </div>

      <div className="mt-[var(--ui-space-8)] rounded-[var(--ui-radius-xl)] border border-border bg-card p-[var(--ui-space-4)] shadow-[var(--ui-shadow-sm)]">
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">PublicPageContainer specimen</p>
        <div className="mt-[var(--ui-space-3)] overflow-hidden rounded-[var(--ui-radius-lg)] border border-dashed border-border bg-muted/40 py-[var(--ui-space-4)]">
          <PublicPageContainer>
            <div className="rounded-[var(--ui-radius-md)] border border-border bg-card p-[var(--ui-space-4)] text-[length:var(--ui-text-small)] text-muted-foreground">Wide public container using --ui-container-wide and --ui-page-gutter.</div>
          </PublicPageContainer>
        </div>
      </div>

      <div className="mt-[var(--ui-space-8)] overflow-hidden rounded-[var(--ui-radius-xl)] border border-border shadow-[var(--ui-shadow-md)]">
        <div className="border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]"><p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Live SiteFooter specimen</p></div>
        <SiteFooter showFloatingWhatsApp={false} />
      </div>

      <div className="mt-[var(--ui-space-8)] grid gap-[var(--ui-space-4)] md:grid-cols-2 lg:grid-cols-3">
        {shellRules.map((rule) => (
          <article key={rule.title} className="rounded-[var(--ui-radius-lg)] border border-border bg-card p-[var(--ui-space-5)] text-card-foreground shadow-[var(--ui-shadow-sm)]">
            <h2 className="text-[length:var(--ui-text-small)] font-semibold text-foreground">{rule.title}</h2>
            <p className="mt-[var(--ui-space-2)] text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">{rule.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
