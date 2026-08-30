import { MarketingHomeHeaderBar } from "@/components/marketing-home/MarketingHomeHeaderBar";
import headerStyles from "@/components/marketing-home/MarketingHomeHeader.module.css";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";

const shellRules = [
  { title: "Canonical header", detail: "The current homepage SiteHeader uses Shalean logo + primary navigation, the Dribbble-style Services mega-menu and search, plus the canonical auth/account control. Hover, click and keyboard access are preserved." },
  { title: "Homepage footer", detail: "MarketingHomeFooter owns the premium homepage footer presentation while preserving canonical service, company, support, contact and analytics-aware WhatsApp/phone interactions." },
  { title: "Shared container", detail: "PublicPageContainer provides RD-P01 wide/content widths plus the canonical page gutter without forcing page-specific body layouts to migrate in one step." },
  { title: "Route ownership preserved", detail: "GlobalTopNav and MarketingHomeHeader remain route-level header entry points. Other public routes may keep the shared SiteFooter while the homepage uses its dedicated marketing footer." },
  { title: "Compatibility boundary", detail: "Other public routes may retain SiteHeader growth-action mode and the shared footer until separately normalized; the homepage uses the current auth-first visual mode and marketing canvas." },
  { title: "Business logic excluded", detail: "The public shell must not own booking state, payment logic, Supabase access, RBAC or Office permissions. Auth presentation consumes the existing canonical session behavior." },
];

export function RDP02PublicShellShowcase() {
  return (
    <section className="mx-auto w-full max-w-[var(--ui-container-wide)] px-[var(--ui-page-gutter)] py-[var(--ui-space-10)]">
      <div className="mb-[var(--ui-space-6)]">
        <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
          <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-primary-foreground">RD-P02D</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-secondary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-secondary-foreground">PUBLIC SHELL</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-warning px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-warning-foreground">CURRENT SPECIMEN</span>
        </div>
        <h1 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Canonical public shell</h1>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">Current UI-system reference for the Shalean homepage header, shared public container and homepage marketing footer.</p>
      </div>

      <div className="overflow-visible rounded-[var(--ui-radius-xl)] border border-border bg-card shadow-[var(--ui-shadow-md)]">
        <div className="rounded-t-[var(--ui-radius-xl)] border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]"><p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Current homepage header specimen</p></div>
        <div className={headerStyles.root}>
          <MarketingHomeHeaderBar bookingHref="/book" />
        </div>
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
        <div className="border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]"><p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Live homepage footer specimen</p></div>
        <MarketingHomeFooter showFloatingWhatsApp={false} />
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
