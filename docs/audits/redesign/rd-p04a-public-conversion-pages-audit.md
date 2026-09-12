# RD-P04A — Public conversion pages audit

Status: AUDIT ONLY — no page implementation changes in this slice.
Branch: `design/rd04-platform-redesign`

## Authority boundary

RD-P04 may change public-page presentation only. It must preserve page metadata/canonical tags, structured data, analytics/tracking sources, booking/quote/referral destinations, CMS/Supabase data authority, form behavior, account/support destinations, pricing authority and backend/API behavior.

The approved public shell/design system from RD-P01–RD-P03 is the presentation authority:
- `SiteHeader` / existing `MarketingHomeHeader` entry point
- `SiteFooter` (with compatibility wrapper where still required)
- `PublicPageContainer`
- semantic tokens
- `HomeSection`, `HomeSectionHeader`, `HomeFeatureCard`, `HomeProofCard` where the pattern is genuinely shared

## Current route inventory

The `(marketing)` route group currently contains public routes including:
- `/about`
- `/areas-we-serve`
- `/campaigns/*`
- `/cleaning-prices-cape-town`
- `/cleaning-services-cape-town`
- `/contact`
- `/faq`
- `/maid-services-cape-town`
- `/quote`
- `/refer`
- `/reviews`
- homepage `/`

The homepage is already governed by completed RD-P03 and is excluded from implementation work in RD-P04 unless a regression is discovered.

## Page families

### A. Direct conversion pages

#### `/quote`
Current shell:
- owns `QuotePageHeader` and `QuotePageFooter`
- hand-built `max-w-4xl` main container
- page-specific slate/blue presentation
- authoritative `QuoteRequestForm`
- authoritative page-view tracking and WebPage JSON-LD
- deliberate link to `/book` for instant standard pricing

Decision:
- **specialized conversion shell — careful migration**
- normalize semantic colors, spacing, radius and container behavior where safe
- do not replace form behavior, tracking, JSON-LD or `/book` diversion logic
- audit whether `QuotePageHeader/Footer` are intentionally minimal conversion chrome before attempting canonical public-shell substitution

#### `/cleaning-prices-cape-town`
Current shell:
- `MarketingHomeHeader`
- `CleaningPricesCapeTownPage`
- `FooterSection`
- hard-coded white/zinc root
- authoritative location-link builder, analytics and SEO metadata

Decision:
- **high-priority canonical-shell migration candidate**
- normalize root semantic roles and footer/container presentation
- retain pricing/location/SEO/tracking authority unchanged

#### `/cleaning-services-cape-town` and `/maid-services-cape-town`
Decision:
- **service-hub conversion pages — audit component internals before styling**
- likely reuse public shell, section primitives and final CTA pattern
- preserve service taxonomy, service hrefs, prices, metadata and structured data

#### `/refer`
Current shell:
- delegates the experience to `ReferralLandingRouter`
- route owns SEO metadata and referral Offer/WebPage JSON-LD
- no ordinary marketing header/footer at the route layer

Decision:
- **specialized transactional/conversion boundary**
- do not wrap blindly with the standard shell
- first audit `ReferralLandingRouter` variants and referral state/claim behavior
- preserve credit-only referral terms and existing routing/state logic

#### `/campaigns/*`
Decision:
- **specialized campaign family**
- audit campaign-specific attribution, landing variants and CTA behavior before any visual migration
- no bulk shell replacement

### B. Trust/support conversion pages

#### `/contact`
Current shell:
- `MarketingHomeHeader` + `FooterSection`
- hand-built `max-w-5xl` container and many page-specific card styles
- authoritative contact/support constants, account routes and `ContactPageForm`
- ContactPage structured data

Decision:
- **strong reusable-pattern candidate**
- migrate shell/container to approved primitives
- journey cards can map to `HomeFeatureCard`-style presentation if semantics remain links
- preserve phone/WhatsApp/email values, account destinations and form behavior

#### `/reviews`
Current shell:
- `MarketingHomeHeader` + `FooterSection`
- `ReviewsPageContent` owns body
- hard-coded white/slate root
- authoritative Google-review content remains inside page content

Decision:
- **safe shell-first candidate**
- normalize root/footer/container first, then audit `ReviewsPageContent`
- preserve Google-review data source and `/book` authority

#### `/about`
Current shell:
- `MarketingHomeHeader` + `FooterSection`
- `AboutPageView` owns body
- hard-coded white/zinc root
- page-view tracking and SEO metadata already authoritative

Decision:
- **safe shell-first candidate**
- reuse public section/header/proof patterns selectively
- do not recreate unsupported trust claims removed during RD-P03F

#### `/faq`
Current shell:
- `MarketingHomeHeader` + `FooterSection`
- specialized `FaqHero`, `FaqPageExperience`, `FaqTrustStrip`, `FaqFinalCta`, `FaqStickyMobileCta`
- authoritative FAQ JSON-LD is built from the FAQ data source

Decision:
- **specialized content page — selective migration**
- preserve FAQ data, JSON-LD and interactive experience exactly
- normalize semantic shell/section styling and inspect whether trust/final CTA duplicates RD-P03 patterns
- sticky mobile CTA remains behavior authority until separately audited

#### `/areas-we-serve`
Current shell:
- `MarketingHomeHeader` + `FooterSection`
- `AreasWeServeView` owns location hierarchy
- hard-coded white/slate root
- canonical metadata and social metadata already authoritative

Decision:
- **safe shell-first candidate**
- normalize semantic root/footer/container and shared area card/chip styling
- preserve all suburb/location routes and location-source authority

## Cross-page findings

1. **Header state is mostly converged.** About, Contact, FAQ, Reviews, Areas and pricing hub already enter through `MarketingHomeHeader`, which is backed by canonical `SiteHeader`.
2. **Footer migration is incomplete at route level.** Many conversion pages still import `FooterSection`, the supported compatibility wrapper around canonical `SiteFooter`. This is not a functional defect, but RD-P04 can migrate safe pages to `SiteFooter` directly.
3. **Root presentation is duplicated.** Multiple pages still hard-code `bg-white text-slate-900` or `text-zinc-900` instead of semantic `bg-background text-foreground` roles.
4. **Containers are inconsistent.** Quote uses `max-w-4xl`, Contact `max-w-5xl`, while hub/body components own other widths. Preserve intentional reading/form widths but move generic gutters/containers to `PublicPageContainer`.
5. **CTA behavior must not be normalized by replacing domain components.** FAQ sticky CTA, quote diversion to instant pricing, account/support journey links, referral flows and campaign attribution are behavior-bearing.
6. **SEO authority is already strong and distributed.** Canonicals, social metadata and JSON-LD are route/domain-owned. RD-P04 should not centralize or rewrite these merely for visual consistency.
7. **Homepage primitives are reusable selectively, not universally.** `HomeSection`, `HomeSectionHeader`, `HomeFeatureCard` and `HomeProofCard` are appropriate for generic marketing sections, but forms, referral/campaign state, FAQ interaction and pricing/service-domain components remain specialized.

## Recommended implementation order

### RD-P04B — safe shell normalization
Start with low-behavior-risk routes:
- `/about`
- `/reviews`
- `/areas-we-serve`
- `/cleaning-prices-cape-town`

Scope: semantic root roles, canonical footer usage, shared container/gutter alignment only.

### RD-P04C — Contact page presentation
Normalize `/contact` using reusable section/card patterns while preserving all contact constants, account routes and `ContactPageForm` behavior.

### RD-P04D — FAQ presentation
Normalize FAQ sections and final CTA while preserving FAQ data/JSON-LD, accordion/search/filter behavior and sticky mobile CTA behavior.

### RD-P04E — service/pricing hub interiors
Audit and normalize `/cleaning-services-cape-town`, `/maid-services-cape-town` and pricing-hub interior components without changing service/pricing authority.

### RD-P04F — Quote conversion shell
Treat `/quote` separately because its dedicated header/footer and form focus may be intentional. Preserve `QuoteRequestForm`, analytics and `/book` instant-price diversion.

### RD-P04G — referral/campaign audit and selective styling
Inspect `ReferralLandingRouter` and campaign variants before any shell change. Preserve referral credit rules, state, attribution and campaign routing.

### RD-P04H — public conversion closure
Responsive/CTA hierarchy/duplicate styling/accessibility audit plus `/dev/ui-system` specimens for newly generalized conversion patterns.

## RD-P04A conclusion

Do **not** mass-convert all marketing routes to one layout. The safe strategy is shell-first for low-risk trust/hub pages, then one controlled domain family at a time for Contact, FAQ, service/pricing hubs, Quote, and finally referral/campaign flows.
