import { MarketingHomeHeaderBar } from "@/components/marketing-home/MarketingHomeHeaderBar";
import headerStyles from "@/components/marketing-home/MarketingHomeHeader.module.css";
import { MarketingHomeFooter } from "@/components/marketing-home/sections/MarketingHomeFooter";
import { PublicPageContainer } from "@/components/nav/PublicPageContainer";

const shellRules = [
  {
    title: "Canonical public header",
    detail:
      "The redesigned homepage SiteHeader is the public visual authority: canonical Shalean logo, primary navigation, Services mega-menu and auth/account control. /services, /locations and /blog families now use this same root-owned visual header; page-owned marketing routes keep MarketingHomeHeader directly.",
  },
  {
    title: "Canonical public footer",
    detail:
      "MarketingHomeFooter is the shared public footer presentation. SiteFooter remains only as a compatibility wrapper so older route imports receive the same 112rem canvas, Navy treatment, canonical links, support contacts and analytics-aware interactions.",
  },
  {
    title: "Marketing canvas",
    detail:
      "Public marketing alignment authority is --ui-container-marketing (112rem) plus --ui-page-gutter. Page-specific body layouts migrate to this canvas in their RD-PUBLIC slices rather than being force-stretched globally.",
  },
  {
    title: "Typography and palette",
    detail:
      "Public-page redesigns use the UI-system type scale and the official cool Shalean family: Primary, Navy, Royal, Soft Periwinkle, Powder Blue, Sky Mist, Blue Ice, Cool Cloud, White, Ink and Slate. State colours are not decorative section themes.",
  },
  {
    title: "CTA authority",
    detail:
      "Primary and secondary public CTAs use the shared marketing CTA classes: pill radius, token spacing/shadows, Shalean Primary with Ink text for primary actions, and card/border treatment for secondary actions.",
  },
  {
    title: "Business logic excluded",
    detail:
      "The public shell must not own booking state, payment logic, Supabase access, RBAC or Office permissions. Shell normalization changes presentation only and preserves existing route behavior and analytics.",
  },
];

export function RDP02PublicShellShowcase() {
  return (
    <section className="mx-auto w-full max-w-[var(--ui-container-marketing)] px-[var(--ui-page-gutter)] py-[var(--ui-space-10)]">
      <div className="mb-[var(--ui-space-6)]">
        <div className="flex flex-wrap items-center gap-[var(--ui-space-2)]">
          <span className="rounded-[var(--ui-radius-pill)] bg-primary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-primary-foreground">RD-PUBLIC-01</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-secondary px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-secondary-foreground">PUBLIC SHELL</span>
          <span className="rounded-[var(--ui-radius-pill)] bg-success px-[var(--ui-space-3)] py-[var(--ui-space-1)] text-[length:var(--ui-text-caption)] font-semibold text-success-foreground">CANONICAL</span>
        </div>
        <h1 className="mt-[var(--ui-space-3)] text-[length:var(--ui-text-section-title)] font-semibold leading-[var(--ui-leading-tight)] text-foreground">Canonical public shell</h1>
        <p className="mt-[var(--ui-space-2)] max-w-3xl text-[length:var(--ui-text-small)] leading-[var(--ui-leading-body)] text-muted-foreground">
          UI-system authority for the Shalean public header, 112rem marketing canvas, canonical page gutter, shared footer and public CTA direction.
        </p>
      </div>

      <div className="overflow-visible rounded-[var(--ui-radius-xl)] border border-border bg-card shadow-[var(--ui-shadow-md)]">
        <div className="rounded-t-[var(--ui-radius-xl)] border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]">
          <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Canonical public header specimen</p>
        </div>
        <div className={headerStyles.root}>
          <MarketingHomeHeaderBar bookingHref="/book" />
        </div>
      </div>

      <div className="mt-[var(--ui-space-8)] rounded-[var(--ui-radius-xl)] border border-border bg-card p-[var(--ui-space-4)] shadow-[var(--ui-shadow-sm)]">
        <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Marketing canvas specimen</p>
        <div className="mt-[var(--ui-space-3)] overflow-hidden rounded-[var(--ui-radius-lg)] border border-dashed border-border bg-muted/40 py-[var(--ui-space-4)]">
          <PublicPageContainer size="marketing">
            <div className="rounded-[var(--ui-radius-md)] border border-border bg-card p-[var(--ui-space-4)] text-[length:var(--ui-text-small)] text-muted-foreground">
              Public marketing container using --ui-container-marketing (112rem) and --ui-page-gutter.
            </div>
          </PublicPageContainer>
        </div>
      </div>

      <div className="mt-[var(--ui-space-8)] overflow-hidden rounded-[var(--ui-radius-xl)] border border-border shadow-[var(--ui-shadow-md)]">
        <div className="border-b border-border bg-muted px-[var(--ui-space-4)] py-[var(--ui-space-3)]">
          <p className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-wide text-muted-foreground">Canonical public footer specimen</p>
        </div>
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
