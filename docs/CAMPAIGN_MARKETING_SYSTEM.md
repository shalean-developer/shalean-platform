# Marketing Campaign Management System — Delivery Report

## Summary

Shalean now has a full **Marketing Campaign Management System** built on the existing promotions engine. Admins can create one campaign and automatically generate multi-channel content, landing pages, social templates, QR codes, and display surfaces — without writing code for each promotion.

## How to enable

1. Apply migrations (in order):
   - `supabase/migrations/20261066_promotions_campaign_system.sql`
   - `supabase/migrations/20261067_campaign_marketing_content.sql`
   - `supabase/migrations/20261069_campaign_media_storage.sql`
   - `supabase/migrations/20261070_social_accounts.sql` (Google Business OAuth + publish history)
2. Deploy the web app (cron `/api/cron/promotions` already in `vercel.json`)
3. Open **Office → Growth → Campaigns**
4. Create a campaign or **Launch** a template, then click **Generate** (sparkles icon)

Optional: set `OPENAI_API_KEY` to polish social/email copy with AI. Template copy always works without it.

## Posting to Facebook / social

See [CAMPAIGN_SOCIAL_PUBLISHING.md](./CAMPAIGN_SOCIAL_PUBLISHING.md) — Copy text, Download PNG, optional Facebook Page publish (`FACEBOOK_PAGE_*`), and Google Business Profile OAuth publish (`GOOGLE_CLIENT_*`).

## Admin navigation

```
Office → Growth
  ├── Marketing ROI          /office/marketing
  ├── Campaigns              /office/marketing/campaigns
  ├── Social Posts           /office/marketing/social
  ├── Connected Accounts     /office/marketing/connected-accounts
  ├── Email Campaigns        /office/marketing/email
  ├── Landing Pages          /office/marketing/landing-pages
  ├── Campaign Analytics     /office/marketing/analytics
  ├── Campaign Templates     /office/marketing/templates
  ├── Campaign Assets        /office/marketing/assets
  ├── Promotions             /office/promotions  (alias → Campaigns)
  ├── Blog
  └── Referrals
```

## Creating future campaigns (no code)

1. **From template:** Growth → Campaign Templates → **Launch & generate**
2. **From scratch:** Campaigns → **New campaign** → fill offer/dates → leave “Generate campaign content” checked
3. **Regenerate:** sparkles icon on any campaign row
4. **Activate / pause / duplicate / end** from the same table
5. Toggle display surfaces when creating (homepage card, popup, booking banner, announcement bar)

Public landing page: `/campaigns/[slug]`

## What “Generate Campaign” creates

| Channel | Output |
|---------|--------|
| Facebook / Instagram / LinkedIn / X / WhatsApp / GBP / Pinterest | Platform-specific copy |
| Email | Subject + HTML body |
| SMS | ≤160 char message |
| Blog | SEO draft markdown |
| Landing | Structured hero, benefits, FAQs, terms |
| FAQ / Meta SEO | Structured JSON |
| Social assets | Editable template payloads (sizes for feed/story/banner/pin) |
| QR code | Data-URL PNG pointing at landing page |

## Customer / site surfaces (when flags are on)

| Surface | Component / path |
|---------|------------------|
| Announcement bar | `PromotionAnnouncementBar` |
| Optional popup | `PromotionPopup` |
| Featured homepage card | `PromotionFeaturedCard` |
| Booking banner + countdown | `PromotionBookingBanner` in booking-v2 |
| Account dashboard card | `PromotionDashboardCard` on `/account/rewards` |
| Landing page | `/campaigns/[slug]` |
| Checkout discounts | Existing booking-v2 promotions engine |

## Database changes (20261067)

- Columns on `promotions`: `hero_image_url`, `logo_url`, `cta_label`, `terms_html`, `show_popup`, `show_featured_card`, `show_dashboard_card`, `show_booking_banner`, `qr_code_data_url`, `content_generated_at`, `template_key`
- Tables: `campaign_content`, `campaign_assets`, `campaign_templates` (seeded)
- Extended `promotion_events` types: `landing_visit`, `qr_scan`, `popup_view`, `popup_dismiss`, `content_generated`

## Files added / modified (high level)

### Added
- `supabase/migrations/20261067_campaign_marketing_content.sql`
- `apps/web/lib/promotions/campaignChannels.ts`
- `apps/web/lib/promotions/offerCopy.ts`
- `apps/web/lib/promotions/generateCampaignContent.ts`
- `apps/web/lib/promotions/campaignContent.ts`
- `apps/web/lib/promotions/__tests__/generateCampaignContent.test.ts`
- `apps/web/app/api/admin/promotions/[id]/generate/route.ts`
- `apps/web/app/api/admin/campaign-templates/route.ts`
- `apps/web/app/(marketing)/campaigns/[slug]/page.tsx`
- `apps/web/app/(ui-redesign)/office/marketing/{campaigns,social,email,landing-pages,analytics,templates,assets}/page.tsx`
- `apps/web/components/admin/promotions/CampaignMarketingHub.tsx`
- `apps/web/components/promotions/{PromotionCountdown,PromotionPopup,PromotionFeaturedCard,PromotionBookingBanner,PromotionDashboardCard,CampaignLandingClient}.tsx`
- `docs/CAMPAIGN_MARKETING_SYSTEM.md` (this file)

### Modified
- `apps/web/lib/promotions/{types,evaluate,server}.ts`
- `apps/web/app/api/promotions/route.ts`
- `apps/web/app/(marketing)/{layout,page}.tsx`
- `apps/web/src/features/office/OfficeNav.tsx`
- `apps/web/src/features/booking-v2/BookingV2Shell.tsx`
- `apps/web/app/(ui-redesign)/office/promotions/page.tsx`
- `apps/web/app/(ui-redesign)/account/rewards/page.tsx`
- `apps/web/components/admin/promotions/PromotionsAdminDashboard.tsx`
- `apps/web/package.json` (`qrcode`)

## Security

- Admin APIs gated by `requireAdminApi` + `ADMIN_EMAILS` allowlist (same as rest of Office)
- Checkout eligibility / discount math remain server-side only
- Audit log entries on create/update/generate
- Public event tracking is best-effort and non-sensitive

## Known follow-ups

- Marketing Admin vs Super Admin RBAC (today: all Office admins)
- Wire birthday / seasonal automation rules to Resend/Twilio senders
- Export social creatives as downloadable PNGs (templates are editable payloads + QR today)
- Membership Paystack recurring billing (unchanged from promotions v1)
