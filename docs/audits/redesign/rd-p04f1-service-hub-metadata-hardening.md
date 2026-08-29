# RD-P04F1 — Service-hub + metadata-parity closure hardening

Status: VALIDATION PENDING — final services visual smoke
Branch: `design/rd04-platform-redesign`
Scope: presentation/metadata compatibility only; no production deployment or data mutation.

## Runtime correction discovered during validation

Local validation showed:

- `/maid-services-cape-town` returns `308`;
- `/cleaning-services-cape-town` returns `308`;
- both redirect to the canonical `/services` hub through `resolveLegacyMarketingExactRedirect()` in `proxy.ts`.

The exact redirect matrix confirms both paths are intentional permanent legacy aliases:

- `/cleaning-services-cape-town` → `/services`
- `/maid-services-cape-town` → `/services`

Because the proxy resolves these redirects before page rendering, the route files at those legacy paths are not active customer-facing conversion surfaces. The initial RD-P04F closure audit incorrectly treated their dormant presentation code as runtime blockers.

## Corrective action

The two presentation-only edits made to the unreachable legacy page files were reverted:

- `ba9773e6` — revert unreachable maid alias styling
- `13af9b17` — revert unreachable cleaning-services alias styling

No SEO redirect behavior was changed.

The canonical active service hub is `/services`. Desktop visual validation confirmed the main page structure, header/footer, cards, trust strip, accordions, areas and final CTA section render without visible horizontal overflow.

### CTA contrast correction

Desktop validation exposed a real reusable CTA styling defect: the final inverse `Book now` CTA combined the primary variant's `text-white` utility with page-level `text-blue-900`, which could render white text on a white button because the project utility combiner does not resolve conflicting Tailwind classes.

The fix was made centrally in `ServicesCtaButton` so an explicitly requested inverse primary treatment does not also inject the conflicting primary colour utilities. Tracking, navigation and CTA semantics are unchanged.

Commit: `47da09b8` — `RD-P04F1: fix inverse CTA text contrast`

### Six-primary-service hierarchy correction

Desktop validation also showed Window Cleaning as a seventh full primary booking card. The public hierarchy requires six primary services, with Window Cleaning retained as subordinate specialist guidance rather than promoted as a seventh primary service.

`ServiceCard` now recognises the Window Cleaning guide and renders it as a full-width `Specialist add-on guide` callout with a guide link instead of the standard primary booking-card treatment. The six primary services remain unchanged. The Window Cleaning SEO guide remains available and its learn-more analytics remain intact.

Commit: `fcfa92e4` — `RD-P04F1: keep window cleaning subordinate`

## `/offers/[slug]` fallback metadata/content parity

The valid F1 hardening remains in place:

- fallback metadata title restored to `Campaign | Shalean`, matching the pre-migration campaign route;
- generic QR copy restored to `QR code for this campaign landing page.`;
- QR alt text restored to `Campaign QR code`.

Canonical `/offers/[slug]` routing, `/book?promo=` attribution, promotion lookup, `landing_visit`, content-driven metadata, terms sanitization, fallback soft landing and configured campaign colours remain unchanged.

Commit: `d7def8da` — `RD-P04F1: restore offer metadata parity`

## Validation evidence received

- Local branch pulled successfully to the F1 implementation series.
- `npm --prefix apps/web run typecheck` passed cleanly before the final CTA/service-hierarchy presentation fixes.
- `/offers/spring-cleaning-special` returned `200`.
- unknown `/offers/rd-p04f1-fallback-check` returned `200`.
- `/campaigns/spring-cleaning-special?utm_source=test` returned `308` with location `/offers/spring-cleaning-special?utm_source=test`.
- `/maid-services-cape-town` and `/cleaning-services-cape-town` returned expected `308` responses to `/services`.
- Desktop `/services` screenshot confirmed the CTA contrast fix after `47da09b8` and otherwise stable page composition.

## Remaining closure gate

1. Pull the latest branch including `fcfa92e4`.
2. Run `npm --prefix apps/web run typecheck` on the latest head.
3. Confirm `/services` returns `200`.
4. Visually smoke `/services` on desktop and mobile for:
   - exactly six primary service cards;
   - Window Cleaning shown as a subordinate specialist guide rather than a seventh primary booking card;
   - visible `Book now` text in the final inverse CTA;
   - one public header/footer;
   - no clipping or horizontal overflow;
   - usable sticky mobile CTA.
5. Optionally inspect the unknown-offer document title and confirm the fallback title is `Campaign | Shalean`.

If these gates pass, mark RD-P04F1 and RD-P04 `PASSED / CLOSED`, then proceed to RD-P05.

## Authority boundary

No booking, payment, pricing, referral rules, promotion eligibility, API, RBAC, Supabase schema/data, SEO redirect topology or production configuration changes are authorized or included.
