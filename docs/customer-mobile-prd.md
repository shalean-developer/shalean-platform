# Shalean Customer Mobile App — Product Requirements Document (PRD)

| Field | Value |
|-------|-------|
| **Status** | Draft — Milestone 4 Home complete |
| **Product** | Shalean Customer Mobile App |
| **App path** | `apps/customer-mobile` |
| **Source of truth** | Platform Audit + Customer Mobile Blueprint |
| **Owner roles** | Product, Mobile Architecture, UX, Engineering |
| **Last updated** | 2026-07-11 |

---

## 1. Executive Summary

Shalean already runs a complete customer business on web: booking-v2, Paystack checkout, customer account portal, referrals, rewards, recurring plans, invoices, reviews, and outbound notifications. The Cleaner Mobile App (`apps/mobile`) proves that Expo + `@shalean/api-client` + Bearer JWT can consume the same Next.js APIs successfully.

The Customer Mobile App will be a **new Expo application** (`apps/customer-mobile`) that becomes another client of the existing Shalean platform — not a new backend, not a parallel system, and not duplicated business logic.

Approximately **80% of the backend required for this product already exists**. The product goal is a premium, on-demand cleaning experience comparable to SweepSouth, Bolt, Uber, Airbnb, Mr D, and Takealot: simple, modern, fast, and reliable — with maximum reuse of the current architecture.

---

## 2. Business Objectives

1. **Increase completed bookings** via a native, low-friction booking funnel.
2. **Improve retention** through push notifications, day-of tracking, rebook, and rewards.
3. **Reduce support load** via self-serve cancel, reschedule, invoices, and FAQs.
4. **Extend the Shalean platform** as another first-class client — do not fragment the stack.
5. **Ship an MVP quickly** by consuming existing APIs and adding only the missing customer REST surface.

---

## 3. Target Audience

- Residential customers in Shalean service areas (primarily Johannesburg / South Africa).
- Returning customers with saved addresses and booking history.
- Busy professionals who want book → pay → track → done.
- Household managers who run recurring cleans across one or more properties.
- Customers who booked on web and want ongoing management in an app.

---

## 4. Customer Personas

| Persona | Primary need | App behaviour |
|---------|--------------|---------------|
| **Busy Professional** | Book fast, pay once, get reminders | Short rebook path; push for day-of events |
| **Home Manager** | Recurring cleans + multiple properties | Addresses + recurring plan controls |
| **First-timer** | Trust and clear pricing | Guided wizard; transparent price breakdown |
| **VIP / Loyal** | Recognition and rewards | Tier, cleaning credit, referral prominence |
| **Guest converter** | Booked once on web, wants the app | Login + linked bookings continuity |

---

## 5. User Stories

### Authentication

- As a customer, I can sign up with email and password so I have a Shalean account.
- As a customer, I can log in and restore my session securely across app launches.
- As a customer, I can reset my password if I forget it.
- As a returning web customer, I can log in and see my existing bookings.

### Booking

- As a customer, I can choose a cleaning service and complete a guided booking wizard.
- As a customer, I can enter or select a saved address, extras, and schedule.
- As a customer, I can choose a preferred cleaner or team when available.
- As a customer, I can apply a promo code or referral credit before paying.
- As a customer, I can pay with Paystack and receive a confirmed booking.

### Manage bookings

- As a customer, I can see upcoming and past bookings.
- As a customer, I can open booking details and understand status at a glance.
- As a customer, I can cancel a booking when business rules allow.
- As a customer, I can reschedule a booking when business rules allow.
- As a customer, I can rebook from a past booking with prefilled details.
- As a customer, I can manage recurring plans (pause / resume / skip / cancel).

### Day-of experience

- As a customer, I can track my cleaner when the job is active.
- As a customer, I receive push notifications for confirmation, reminders, and en-route events.

### Account & money

- As a customer, I can manage saved addresses and profile details.
- As a customer, I can view payment history and invoices (including PDFs).
- As a customer, I can see rewards, VIP tier, and cleaning credit.
- As a customer, I can share my referral code and view referral history.

### Trust & support

- As a customer, I can leave a review after a completed job.
- As a customer, I can contact support via WhatsApp, phone, or email.
- As a customer, I can read help FAQs in the app.

---

## 6. Business Rules

1. Booking creation must use **booking-v2** (`POST /api/booking-v2/confirm`), not legacy booking endpoints as the primary path.
2. Payment authority is **Paystack** (initialize → verify / webhook). The app must never mark a booking as paid locally.
3. Cancel and reschedule are allowed only when `@shalean/types` customer modify status rules allow.
4. All customer booking, track, invoice, and review actions must enforce **ownership** server-side.
5. Promo and referral validation must succeed **server-side** before payment.
6. VIP pricing and cleaning credits are applied only by server pricing integrity — never trusted from the client alone.
7. Support is **channel-based** in MVP (WhatsApp / phone / email). No in-app ticketing system.
8. Admin / office tooling and cleaner job lifecycle tools are **out of scope**.
9. The Customer App must not embed Supabase service-role keys or duplicate dispatch / payout logic.
10. Canonical customer booking management APIs are `/api/customer/bookings*` (prefer over deprecated dashboard cancel/reschedule aliases).

---

## 7. Success Metrics

| Metric | Target direction |
|--------|------------------|
| App booking conversion (wizard start → paid) | Match or beat mobile web |
| Time-to-book for returning customers | Under 2 minutes |
| D7 / D30 retention | Track; improve vs web-only cohort |
| Push opt-in rate (logged-in users) | Greater than 60% |
| Self-serve cancel / reschedule rate | Increase; reduce related support contacts |
| Crash-free sessions | Greater than 99.5% |
| App Store / Play rating | ≥ 4.5 after 100 reviews |

---

## 8. Core Features (MVP)

| Area | Features |
|------|----------|
| **Authentication** | Signup, login, forgot/reset password, session restore |
| **Home** | Dashboard summary, next booking, primary Book CTA |
| **Book Cleaning** | Service catalog + booking-v2 wizard + promo/referral |
| **Payments** | Paystack checkout, verify/status, pay-link deep links |
| **Bookings** | Upcoming / past list, detail, cancel, reschedule |
| **Tracking** | Day-of cleaner tracking + deep links from push |
| **Addresses** | Saved properties CRUD |
| **Profile & settings** | Profile edit, notification prefs, sign out |
| **Invoices & payments history** | List + PDF view |
| **Referrals & rewards** | Share code, credit, rewards hub |
| **Reviews** | Submit after completed job; history |
| **Notifications** | In-app inbox + push |
| **Support** | FAQ + WhatsApp / phone / email |

---

## 9. Future Features (Post-MVP)

- In-app customer ↔ support or customer ↔ cleaner chat
- Apple Pay / Google Pay (if Paystack + platform support)
- Tip cleaner
- Richer live map ETA
- Family / multi-user household accounts
- Loyalty points catalog (beyond credit + VIP)
- Home screen widget for rebook / next job
- Dark mode
- Localization (e.g. EN / AF / ZU)
- Full guest checkout without account (if product requires web parity)
- Wearable / watch glance for day-of status

---

## 10. Technical Constraints

- Expo managed workflow, aligned with the Cleaner app stack (Expo 53+ / React Native / Expo Router).
- Backend remains **`apps/web` Next.js `/api/*`** — no separate customer BFF in MVP.
- Shared packages linked via existing monorepo `file:` protocol.
- No duplicated pricing, dispatch, or payment finalization logic in the app.
- Light-first UI for MVP (Cleaner app currently forces light mode).
- New app identity separate from Cleaner: proposed bundle/package `za.co.shalean.customer`.

---

## 11. Platform Dependencies

| Dependency | Role |
|------------|------|
| `apps/web` Next.js APIs | System of record for all mutations and reads |
| Supabase Auth | Customer identity (email/password) |
| Supabase Postgres | Bookings, credits, notifications, addresses, profiles |
| Paystack | Card / payment charges |
| Expo + EAS | Builds, OTA updates, push transport |
| Resend / WhatsApp / SMS | Existing outbound messaging (server-side) |
| `@shalean/*` packages | Shared client, types, utils, validation |

---

## 12. API Dependencies

### Existing (reuse)

| Domain | Endpoints |
|--------|-----------|
| Auth helpers | `/api/auth/resolve-profile`, `/api/auth/forgot-password`, `/api/auth/create-from-guest`, `/api/auth/link-guest-bookings` |
| Home | `GET /api/dashboard/summary` |
| Bookings | `GET/POST cancel/reschedule` under `/api/customer/bookings*` |
| Booking create | `/api/booking-v2/*` (services, confirm, cleaners, team-availability, resolve-location, equipment-quote) |
| Payments | `/api/paystack/initialize`, `verify`, `status`; payment-precheck |
| Promotions | `/api/promotions`, `/api/promotions/validate` |
| Referrals | `/api/referrals/me`, `submit`, `settings`, `credit`, `credit/history`, `validate-checkout` |
| Rewards | `GET /api/account/rewards` |
| Recurring | `/api/me/recurring*` |
| Reviews | `GET /api/me/reviews`, `POST/PATCH /api/bookings/review` |
| Invoices | `/api/account/invoices/**/pdf` |
| Notifications | `POST /api/dashboard/notifications/mark-read` |
| Rebook | `GET /api/rebook/prefill` |

### Missing (must build for MVP parity)

| API | Purpose |
|-----|---------|
| `/api/customer/addresses` (+ `[id]`) | Customer saved address CRUD |
| `/api/customer/profile` | Profile GET/PATCH |
| `/api/customer/notifications` | In-app notification list |
| `/api/customer/devices` or `/api/me/push-token` | Register / unregister Expo push token |
| `/api/customer/bookings/[id]/track` | *(Conditional)* tracking DTO if web `/track` is not API-shaped |

---

## 13. Security Requirements

- Store access/refresh tokens in **SecureStore** (not plaintext AsyncStorage for secrets).
- Send `Authorization: Bearer <access_token>` on authenticated API calls.
- Never ship Supabase **service role** keys in the mobile app.
- Enforce TLS for all API traffic.
- Validate deep-link targets; server must re-check booking ownership.
- Minimize PII in analytics events.
- Follow least privilege: customer APIs only; no admin endpoints from the app.

---

## 14. Performance Requirements

- Cold start to interactive Home under **3 seconds** on mid-range Android.
- Booking step transitions should feel instant (local state; &lt; 100ms perceived).
- Use skeleton loading for API-bound screens; avoid blank screens.
- Lazy-load PDFs and heavy media.
- Prefer React Query caching for Home and booking lists.

---

## 15. Offline Requirements

| Capability | MVP behaviour |
|------------|---------------|
| Cached reads | Home summary, booking lists, addresses (React Query persist) |
| Offline browse | View last-cached bookings with clear offline banner |
| Online required | Create booking, pay, cancel, reschedule, submit review |
| Mutation queue | Optional later for cancel/reschedule; not required for booking create/pay |
| Pattern reuse | Connectivity provider + offline banner pattern from Cleaner app |

---

## 16. Push Notification Strategy

| Event | Priority |
|-------|----------|
| Booking confirmed | High |
| Reminder T-24h / T-2h | High |
| Cleaner en-route / arrived | Critical |
| Payment failed / due | High |
| Review request | Medium |
| Referral credit earned | Medium |
| Promo / rewards | Low (frequency capped) |

**Requirements:**

- Request OS permission after first successful login or first booking (not on cold launch spam).
- Register Expo push token with backend (new API).
- Deep link taps to booking detail, track, review, or pay screens.
- Respect user settings once preferences exist (P1).

---

## 17. Analytics Strategy

### Funnel events

- `book_start` → `book_step_n` → `book_confirm` → `pay_init` → `pay_success` / `pay_fail`

### Engagement events

- `home_open`, `track_open`, `rebook_tap`, `referral_share`, `review_submit`

### Platform notes

- Align with existing web analytics concepts (`/api/analytics/*`) where practical.
- Add crash reporting (e.g. Sentry or Expo-compatible reporter) before production.

---

## 18. Release Strategy

1. **Internal** — EAS development / preview builds for Shalean team.
2. **Closed beta** — TestFlight + Play Internal testing.
3. **Staged production** — phased store rollout.
4. **OTA** — Expo Updates for JS-only fixes after native baseline is shipped.

Customer app must use a **separate EAS project and store listing** from the Cleaner app.

---

## 19. MVP Scope

### In scope

- Auth (signup / login / reset)
- Home dashboard
- Full booking-v2 wizard
- Paystack payment
- Bookings list / detail / cancel / reschedule
- Cleaner tracking
- Addresses + profile (via new APIs)
- Referrals + rewards
- Reviews
- Notifications (inbox + push registration)
- Support channels
- Invoices / payment history entry points
- Settings + legal links

### Out of scope (MVP)

- Admin / office mobile
- Cleaner job tools inside the customer app
- In-app chat / ticketing
- Blog / CMS / SEO surfaces
- Dark mode
- Full guest checkout without account (stretch only)
- Duplicating web marketing site inside the app

---

## 20. Future Roadmap

| Phase | Focus |
|-------|--------|
| **Architecture** | Confirm `apps/customer-mobile`, shared `mobile-ui`, API gaps |
| **Shared infrastructure** | Packages, domain API clients, new customer REST |
| **Authentication** | Full auth stack |
| **Booking experience** | Native wizard on booking-v2 |
| **Payments** | Native Paystack |
| **Bookings management** | List, detail, cancel, reschedule, recurring |
| **Profile** | Profile + addresses + invoices |
| **Notifications** | Inbox + push |
| **Rewards** | Referral + rewards + review prompts |
| **Polish & production** | Store readiness, analytics, crash, OTA, UAT |

Detailed milestone breakdown lives in the Implementation Roadmap section of the Customer Mobile Blueprint.

---

## 21. Decisions Locked by This PRD

1. Ship as **`apps/customer-mobile`**, not a long-term dual-brand expansion of `apps/mobile`.
2. Reuse existing **Next.js + Supabase + Paystack** backend; do not create a second backend.
3. Maximise reuse of **`@shalean/*`**, Cleaner app infra patterns, and existing customer APIs.
4. Build only the missing APIs required for addresses, profile, notification list, push token registration (and tracking DTO if required).
5. MVP north star: **Book → Pay → Track → Rebook / Refer**.

---

## 22. Related Documents

- Platform Audit (conversation / architecture discovery)
- Customer Mobile Blueprint (IA, screen inventory, design system, API mapping, roadmap)
- `docs/architecture/booking-system-architecture.md`
- `docs/backend-migration-architecture.md`
- `docs/runbook-payments.md`

---

## 23. Open Questions

| Question | Default assumption until decided |
|----------|----------------------------------|
| Guest full checkout in mobile MVP? | **No** — account-first |
| Tracking: new API vs reuse booking detail fields? | Add thin track DTO if web `/track` is not API-ready |
| Extract `packages/mobile-ui` before or during M1? | Prefer extract early in Milestone 2 |
| Biometric login? | Post-MVP |

---

*End of PRD*
