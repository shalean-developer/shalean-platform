# RD-P03B — Homepage target hierarchy and reusable component map

Status: READY FOR APPROVAL
Branch: `design/rd04-platform-redesign`
Scope: homepage structure/content hierarchy and reuse map only. No homepage implementation changes.

## Target homepage hierarchy

1. Hero
2. Primary six-service section
3. Trust + proof section
4. How Shalean works
5. Real customer proof / reviews
6. Why choose Shalean / brand story
7. FAQ
8. Areas served
9. Final conversion CTA
10. Canonical footer

## Reusable component map

| Target section | Canonical/reusable building blocks | Current source | RD-P03B decision |
| --- | --- | --- | --- |
| Public shell | `SiteHeader`, `PublicPageContainer`, `SiteFooter` | RD-P02 public shell | KEEP — canonical authority |
| Hero | `PublicPageContainer`, canonical buttons/CTA link patterns, semantic tokens | `MarketingHomeHeroSection` | KEEP CONTENT AUTHORITY; REDESIGN PRESENTATION |
| Six-service section | reusable Section/Card/Button patterns + existing service presentation data | `MarketingHomeCoreServicesSection`, `MarketingHomeServicesGrid`, `MarketingHomeServicesSection` | MERGE service introductions into one primary six-service section; avoid duplicate catalogue presentation |
| Trust + proof | Card/Badge/Icon patterns + verified trust data | `MarketingHomeTrustSection`, parts of `MarketingHomeAboutSection`, hero trust claims | MERGE repeated trust claims into one evidence-led proof section |
| How Shalean works | Section/Card patterns | `MarketingHomeHowItWorksSection` | KEEP as distinct process section; normalize to global design system |
| Customer proof/reviews | Card/Avatar/Rating patterns | testimonial/review content in `MarketingHomeAboutSection`; existing review sources | KEEP proof purpose; separate customer proof from generic trust claims |
| Why choose / brand story | Section/Image/Card/CTA patterns | image + benefits block inside `MarketingHomeServicesSection` | KEEP but remove repeated trust statements already covered earlier |
| FAQ | Accordion, Section, CTA patterns | `MarketingHomeFaqSection` + `MarketingHomeFaqAccordion` | KEEP data/behavior; redesign presentation only |
| Areas served | Section, chip/link patterns, `PublicPageContainer` | `MarketingAreasSection` | KEEP SEO/location authority; simplify visual density where safe |
| Final CTA | Button/CTA patterns + canonical container | currently distributed across FAQ/areas/other sections; `MarketingHomeCtaSection` exists as candidate | ADD one deliberate final conversion moment; reduce unnecessary repeated CTAs above it |
| Footer | `SiteFooter` | RD-P02 | KEEP — canonical authority |
| Featured promotion | promotion component/business behavior | `PromotionFeaturedCard` | KEEP functional capability, but visually subordinate and optional; do not let it interrupt primary hierarchy when absent/present |
| Sticky/mobile utilities | existing sticky CTA/trust utilities | `MarketingHomeStickyCtaClient`, `MarketingStickyTrustBadge` | PRESERVE behavior; evaluate visual integration later without changing tracking/business semantics |

## Keep / merge / retire rules

### Keep
- canonical public shell from RD-P02;
- one H1 and the existing homepage SEO metadata authority;
- CMS-backed service, FAQ and location data;
- StructuredData/JSON-LD generation;
- existing CTA destinations and tracking semantics unless a later approved slice explicitly changes them;
- promotion behavior and tracking;
- sticky mobile/trust behavior until deliberately redesigned.

### Merge
- `MarketingHomeCoreServicesSection` + service-grid introduction into one primary six-service presentation;
- repeated hero/trust/why-choose proof statements into one trust/proof hierarchy;
- review/testimonial proof currently mixed into `MarketingHomeAboutSection` into a clearer customer-proof section.

### Retire as standalone presentation after migration
- duplicate service-pricing strip if the new primary six-service section fully carries service/pricing orientation;
- duplicated trust-card rows that repeat the same vetted/satisfaction/reliability claims;
- scattered CTA pairs whose only purpose is repetition rather than supporting a distinct user decision.

Retirement means presentation removal only after equivalent approved content/behavior is present elsewhere. It does not authorize deleting data sources, analytics, SEO content, routes or backend behavior.

## RD-P03 implementation boundaries

RD-P03 must not change:
- booking state or booking APIs;
- pricing authority/calculation logic;
- payment logic;
- Supabase schema/data access authority;
- authentication/RBAC/account/Office behavior;
- service-count authority or CMS source-of-truth;
- promotion APIs/tracking behavior;
- SEO canonical/robots/structured-data authority without separate approval.

## Proposed implementation slices after approval

- RD-P03C — homepage reusable section primitives and development catalogue specimens.
- RD-P03D — hero redesign.
- RD-P03E — unified six-service section.
- RD-P03F — trust + proof and customer-proof consolidation.
- RD-P03G — process + brand-story sections.
- RD-P03H — FAQ + areas + final CTA normalization.
- RD-P03I — homepage integration/visual regression/closure audit.

## Approval gate

RD-P03B is documentation only and makes no visual implementation change. The hierarchy and reuse decisions above should be explicitly approved before RD-P03C begins.