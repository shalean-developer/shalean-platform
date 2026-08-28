# RD-P04E — Referral and campaign conversion audit

Status: In progress — local validation pending

## Scope

Audit and selectively normalize `/refer` and `/campaigns/[slug]` without changing referral attribution, campaign analytics, booking destinations, metadata/JSON-LD, promotion eligibility, or submission/business logic.

## Referral route

`/refer` is not one static page. `ReferralLandingRouter` selects between:

- `ReferralLandingView` for existing customers referring friends; and
- `ReferredFriendLandingView` for referred visitors.

Behavior that remains authoritative and unchanged:

- `/api/referrals/settings` remains the public referral settings source.
- `useReferralLandingAudience()` still determines which referral experience renders.
- `useReferralShareUrl()` and `toPublicReferralShareUrl()` still own share-link/ref-code generation.
- Facebook and WhatsApp share behavior is unchanged.
- `appendStoredReferralToHref()` still appends the stored referral to the referred-friend booking URL before booking CTAs render.
- Reward and checkout-discount amounts still come from referral settings.
- Referral form behavior is unchanged.
- `/refer` metadata and referral Offer JSON-LD are unchanged.

Selective presentation changes:

- Suspense/loading states now use semantic background/foreground tokens.
- Both referral experiences now use the canonical `SiteFooter` rather than the legacy `FooterSection` compatibility wrapper.
- Root shells now use semantic `background` / `foreground` roles.
- Page-specific referral sections, gradients, content hierarchy, share controls, and referral CTA behavior remain intentionally domain-specific.

## Campaign route

`/campaigns/[slug]` is a dynamic, promotion-backed conversion route.

Behavior that remains authoritative and unchanged:

- Promotion lookup remains `getPromotionBySlug()` through the Supabase admin client.
- Dynamic metadata still comes from promotion content / `meta_seo` content when available.
- Soft fallback promo behavior remains intact for shared URLs that predate or outlive database rows.
- Ended/expired campaign URLs still remain on the landing page rather than redirecting away.
- `recordPromotionEvent(..., eventType: "landing_visit")` remains the campaign visit analytics path.
- Booking CTA remains `/book?promo=<promo-code-or-slug>`.
- Campaign-specific CTA labels and colours still come from promotion configuration/content.
- Terms HTML is still sanitized at render with `sanitizeCampaignTermsHtml()`.
- QR, FAQ, benefits, included-services, promotion countdown/client behavior and fallback content remain unchanged.

Selective presentation changes:

- Root uses semantic background/foreground roles.
- Hero and main content now use `PublicPageContainer` instead of route-local `max-w-5xl px-4` wrappers.
- Repeated campaign cards use semantic card/border/muted roles and canonical radius tokens.
- Campaign-configured hero gradient colours remain untouched because they are campaign content, not global shell styling.

## Boundary decisions

Do not replace referral or campaign-specific business logic with generic marketing components. `MarketingHomeHeader` remains on referral experiences because referral booking hrefs may carry attribution. Campaign pages intentionally keep their own campaign hero rather than forcing the standard SiteHeader into the conversion surface.

No production deployment, Supabase mutation, promotion mutation, referral mutation, booking mutation, or payment change is part of RD-P04E.

## Validation gate

Before closure:

1. `npm run typecheck` passes.
2. `/refer` renders on desktop and mobile for the normal referrer experience.
3. A referred-friend URL still produces a booking href carrying the stored referral.
4. Referral sharing/copy controls remain usable.
5. At least one `/campaigns/<slug>` page renders with campaign hero, CTA, terms, and any available countdown/QR/FAQ content.
6. Campaign Book CTA still includes `?promo=`.
7. No duplicate public footer or horizontal overflow is visible.
