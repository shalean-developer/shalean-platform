# RD-P04E — Referral and campaign conversion audit

Status: PASSED / CLOSED
Branch: `design/rd04-platform-redesign`

## Scope

Audit and selectively normalize `/refer` and the customer-facing promotion conversion family without changing referral attribution, campaign analytics, booking destinations, metadata/JSON-LD, promotion eligibility, or submission/business logic.

The customer-facing campaign URL migration was subsequently split into RD-P04E2, where canonical public URLs moved from `/campaigns/[slug]` to `/offers/[slug]` while legacy `/campaigns/*` compatibility was preserved.

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

- Suspense/loading states use semantic background/foreground tokens.
- Both referral experiences use the canonical `SiteFooter` rather than the legacy `FooterSection` compatibility wrapper.
- Root shells use semantic background/foreground roles.
- Page-specific referral sections, gradients, content hierarchy, share controls, and referral CTA behavior remain intentionally domain-specific.

## Campaign / offer boundary

The promotion-backed conversion route preserves:

- Promotion lookup via `getPromotionBySlug()` through the Supabase admin client.
- Dynamic metadata from promotion content / `meta_seo` when available.
- Soft fallback promo behavior for shared URLs that predate or outlive database rows.
- Ended/expired URLs remaining on the landing page rather than redirecting away.
- `recordPromotionEvent(..., eventType: "landing_visit")` as the campaign visit analytics path.
- Booking CTA `/book?promo=<promo-code-or-slug>`.
- Campaign-specific CTA labels and colours from promotion configuration/content.
- Terms HTML sanitization with `sanitizeCampaignTermsHtml()`.
- QR, FAQ, benefits, included-services, promotion countdown/client behavior and fallback content.

RD-P04E2 owns the canonical `/offers/[slug]` migration and legacy `/campaigns/[slug]` redirect compatibility.

## Boundary decisions

Do not replace referral or campaign-specific business logic with generic marketing components. `MarketingHomeHeader` remains on referral experiences because referral booking hrefs may carry attribution. Promotion landing pages keep their campaign/offer-specific hero rather than forcing the standard SiteHeader into the conversion surface.

No production deployment, Supabase mutation, promotion mutation, referral mutation, booking mutation, or payment change is part of RD-P04E.

## Validation result

Passed:

1. Latest completed-slice typecheck was clean.
2. `referralShareUrls.test.ts` + `client.test.ts` passed: 2 files / 10 tests.
3. `/refer` returned 200 on the clean local Next process.
4. A real referrer share URL used the canonical `https://shalean.co.za/refer?ref=<REALCODE>` form.
5. A referred-friend URL rendered the invited-friend experience.
6. `Book Your First Clean` retained the same referral code into `/book?ref=<REALCODE>`.
7. Referral share/copy behavior was functionally confirmed through the supplied copied public URL.
8. No booking/payment completion was required and no production mutation was performed.

RD-P04E is therefore **PASSED / CLOSED**. RD-P04E2 remains the separate authority for customer-facing offer URL migration validation.
