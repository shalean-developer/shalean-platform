# Milestone 11 — Rewards

## What shipped

### APIs (reuse — no new routes)
- `GET /api/account/rewards` — hub payload (credit, promos, membership, expiry)
- `GET /api/referrals/me` · `settings` · `credit` · `credit/history`
- `GET /api/me/reviews`
- `POST` / `PATCH` `/api/bookings/review`

### api-client
- `createCustomerReviewsApi` (submit / update)

### Mobile
- **Rewards hub** `/(tabs)/rewards` — credit, tier, birthday, promos, refer entry, review counts
- **Referrals** `/rewards/referrals` — code, invite URL, Share sheet + copy, history
- **Credit history** `/rewards/credit-history`
- **Reviews hub** `/rewards/reviews` — pending + submitted
- **Leave review** `/bookings/[id]/review` — star rating + comment
- Booking detail **Leave a review** CTA when eligible
- Booking success **Share referral** nudge
- Deep links: `type=review` → review screen; `type=rewards` → hub

### Checkout credit regression
- Contract test asserts `applyCleaningCreditZar` + `referralCode` still flow through `buildConfirmPayload` (server spends credit; client does not invent balances).

## Tests

```bash
cd apps/customer-mobile
npm run typecheck
npm run test:rewards
npm run test:booking   # confirm payload still includes credit fields
```

## Manual QA

- [ ] Rewards tab shows credit balance from `/api/account/rewards`
- [ ] Share invite opens OS share sheet with `/refer?ref=CODE` URL
- [ ] Copy link works
- [ ] Credit history lists ledger rows
- [ ] Completed booking → Leave review → submit 1–5 stars
- [ ] Already reviewed booking does not show pending CTA
- [ ] Checkout: toggle cleaning credit still reduces pay total and sends `applyCleaningCreditZar`
- [ ] Success screen shows Share referral when code available

## Not in this milestone

- Notification preference toggles
- Loyalty points catalog beyond credit + VIP
- Editing reviews after 24h (server window)
