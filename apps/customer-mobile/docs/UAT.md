# Customer Mobile — Full UAT checklist (Milestone 12)

Sign off on a **preview or staging** build before store submission.  
Record build number / EAS URL / date / tester.

---

## Environment

- [ ] API base URL points at intended env
- [ ] Supabase project matches API
- [ ] Paystack **public** key matches env (test vs live)
- [ ] Push: physical device; soft-fail OK on simulator
- [ ] Sentry DSN set for preview (optional for first UAT pass)

---

## Auth

- [ ] Welcome → Log in / Create account / Forgot password
- [ ] Signup shows Terms + Privacy links
- [ ] Session restores after force-quit
- [ ] Sign out clears session; push token best-effort unregister

---

## Home & navigation

- [ ] Home loads summary / next booking / quick actions
- [ ] Skeleton then content; pull-to-refresh
- [ ] Tabs: Home, Bookings, Book, Rewards, Profile

---

## Book → Pay

- [ ] Service catalog → details → schedule → review → checkout
- [ ] Promo / referral / cleaning credit at checkout (server apply)
- [ ] Confirm → Paystack WebView → success
- [ ] Cancel payment → can retry from Bookings
- [ ] Success screen shows referral share when code exists

---

## Bookings management

- [ ] List + detail
- [ ] Cancel / reschedule when eligible
- [ ] Rebook
- [ ] Recurring plans list/actions

---

## Track

- [ ] Track from booking detail (day-of)
- [ ] Map / open in Maps when point exposed
- [ ] Foreign booking id → unavailable (no leak)

---

## Profile

- [ ] Edit profile
- [ ] Addresses CRUD + default
- [ ] Invoices list + PDF when available
- [ ] Notifications inbox + mark read
- [ ] Settings: support channels, privacy, terms, version, check updates

---

## Rewards

- [ ] Hub credit / offers
- [ ] Referrals share sheet + copy link
- [ ] Credit history
- [ ] Leave review on completed booking; pending list updates

---

## Notifications (device)

- [ ] Permission → token → `POST /api/customer/devices`
- [ ] Tap push with `booking_id` → booking detail
- [ ] Tap `en_route` → track; `review` → leave review

---

## Privacy / store readiness

- [ ] Privacy + Terms open shalean.co.za pages
- [ ] No secrets in logs / share sheets
- [ ] Data safety form draft matches `STORE_LISTING.md`

---

## Perf / stability smoke

- [ ] Cold start to interactive Home < ~3s on mid-range device (note result)
- [ ] Force an error boundary (dev only) → Try again works; Sentry receives if DSN set
- [ ] Airplane mode → friendly errors, no crash

---

## Sign-off

| Role | Name | Date | Build | Pass? |
|------|------|------|-------|-------|
| QA | | | | |
| Product | | | | |
| Eng | | | | |

**Staging sign-off:** ☐ Ready for closed beta / store draft  
**Blockers:** _
