# RD-P03H — Homepage closure audit

Status: LOCAL VALIDATION PENDING
Branch: `design/rd04-platform-redesign`
Scope: presentation-only homepage closure.

## Final homepage order

1. Canonical public header
2. Hero
3. Optional featured promotion
4. Canonical six-service section
5. Evidence-led operational trust
6. How It Works
7. Google customer proof
8. Brand story / Why Choose Shalean
9. FAQ
10. Areas served
11. Final conversion CTA
12. Canonical footer
13. Existing sticky trust / mobile CTA utilities

## Closure decisions

### CTA hierarchy

- Header retains global quote and booking actions.
- Hero retains its approved primary booking/instant-price and quote actions.
- Mid-page CTAs remain only where they support the section's job: brand story, FAQ and areas.
- A single deliberate final conversion action is added before the footer: `Book a cleaner`.
- Final CTA uses the existing marketing booking href authority and the established `home_final_cta` tracking source.

### Duplicate-content check

- Duplicate homepage service-grid presentation was removed in RD-P03E.
- Repeated trust/promise grids and the uncited hard-coded testimonial were removed in RD-P03F.
- The final CTA does not introduce new pricing, review, guarantee or service-volume claims.
- FAQ and location copy remain owned by their existing CMS/default/data helpers.

### Responsive consistency

- Shared homepage sections use `HomeSection` / `PublicPageContainer` spacing and gutters.
- How It Works uses `HomeFeatureCard` and naturally stacks on smaller viewports.
- FAQ and Areas retain their existing responsive data/link structures while consuming shared section framing.
- Final CTA uses the same shared section/container system and one primary action, avoiding a dense mobile CTA cluster.

### `/dev/ui-system` alignment

- The RD-P03 catalogue now describes the homepage system as live rather than future-only.
- It renders the canonical final homepage CTA together with the approved section/header/feature/proof primitives.
- Catalogue content remains development-only and does not own business data.

## Remaining presentation exceptions

The following are intentionally not forced into generic primitives because their layout is domain-specific:

- Hero composition and LCP image treatment.
- Six-service card composition and CMS/pricing presentation.
- Evidence-led trust band.
- Google customer-proof composition.
- Brand-story image collage and its local CTA grouping.
- Promotion card and sticky mobile/trust utilities.

These are allowed to compose canonical tokens/components locally as needed. No additional mass migration is required for RD-P03 closure.

The older `apps/web/components/home/HomeFinalCta.tsx` remains an unused legacy component and is not reintroduced into the marketing homepage. Removing legacy unused files can be handled in a later cleanup slice rather than mixed into homepage closure.

## Authority preserved

RD-P03H does not change:

- booking state or booking APIs;
- pricing calculations or pricing-service authority;
- payment logic;
- Supabase production data or schema;
- RBAC/session/auth behaviour;
- CMS service, FAQ or location authority;
- JSON-LD / StructuredData semantics;
- homepage metadata/canonical/OpenGraph/Twitter authority;
- existing service destinations or location link generation.

## Validation gate

Before RD-P03 can close:

1. `npm run typecheck` passes on the latest branch.
2. Desktop homepage renders the final CTA immediately before the footer.
3. Mobile homepage has no horizontal overflow, clipped cards, overlapping sticky controls or dense CTA collisions.
4. Six services, trust, process, Google proof, brand story, FAQ and Areas each render once.
5. FAQ accordion and area/suburb links remain interactive.
6. `/dev/ui-system` renders the RD-P03 homepage system and final CTA specimen correctly.
7. No duplicate public header/footer appears.

If all gates pass, mark `RD-P03 — PASSED / CLOSED` and proceed to RD-P04 public conversion pages.
