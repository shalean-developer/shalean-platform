# PRINCESS-UAT-PRA2 — Service-Specific Pricing and Payment Recovery

| Field | Value |
|-------|-------|
| **Ticket** | PRINCESS-UAT-PRA2 |
| **Branch** | `fix/princess-pra2-service-pricing-payment-recovery` |
| **Base** | `staging` |
| **Date (UTC)** | 2026-07-15 |
| **Staging Supabase** | `gbgnemlpyykyhpqqbgru` |
| **Paystack** | test |
| **Production** | Unchanged |

---

# Executive Decision

**PASS — PRINCESS PR A SERVICE PRICING AND RECOVERY READY FOR REVIEW**

Every bookable service has an explicit pricing field contract; Move / Airbnb / Carpet room quantities price and duration correctly; Office frequency is Model C (commitment only); duration uses a shared server-derived label; cancelled Paystack sessions recover via `/pay/{id}` + persisted `pendingBookingId`. Production was not modified.

---

# Service Pricing Matrix

Canonical source: `apps/web/lib/booking-v2/servicePricingContract.ts`.

| Service (booking-v2) | Canonical pricing key | Aliases | Price+duration fields | Informational | Extras / remove |
|---|---|---|---|---|---|
| regular-cleaning | standard | standard, standard-cleaning, regular, regular-cleaning | propertyType, bedrooms, bathrooms, extraRooms | hasPets, specialInstructions | — |
| deep-cleaning | deep | deep, deep-cleaning | propertyType, bedrooms, bathrooms, extraRooms, lastCleaned | hasPets, specialInstructions | — |
| moving-cleaning | move | move, move-in, move-out, moving, … | moveType (rate row), bedrooms, bathrooms, extraRooms, propertyType, furnished | depositInspection, specialInstructions | — |
| office-cleaning | office | office, office-cleaning, quick | officeSize, bathrooms | officeType, **frequency (Model C)**, afterHours, specialInstructions | — |
| carpet-cleaning | carpet | carpet, carpet-cleaning | propertyType, carpetRooms, rugCount, carpetType, stains | hasPets, specialInstructions | sofaCount → sofa-upholstery Extra (legacy sofaCount still priced) |
| airbnb-cleaning | airbnb | airbnb, airbnb-cleaning | propertyType, bedrooms, bathrooms, extraRooms | linens, guestCheckout, keyAccess, welcomeBasket, specialInstructions | laundry / welcome-setup remain Extras |

Field effects:

1. **price_and_duration** — must change quote and duration when values change  
2. **duration_only** — (none currently)  
3. **informational** — persisted for ops; must not silently look like pricing  
4. **extras_or_remove** — sofa moved to Extra

---

# Root Causes

| Defect | Cause |
|--------|--------|
| Move / Airbnb / Carpet / Office flat or broken rooms | Staging `pricing_services` only had standard/deep; other services fell back or had 0 rates |
| Office frequency “ignored” | No approved discount model; field collected but unused |
| Carpet quantities / sofa model | `sofaCount` never entered pricing; rugs missing; carpet per-room default 0 |
| Duration not displayed clearly | Summary used abbreviated “Est. Xh”; Review used static catalog hours |
| Paystack cancel → booking not found | Callback went to `/account/success` verify path; `pendingBookingId` was React-only (lost on remount) |

---

# Move Pricing

- Shared booking product: `moving-cleaning` → bookings `service_slug` `move`.
- Dedicated staging rows: `move`, `move-in`, `move-out` with **different** rates (move-out higher).
- Quote selects row via `serviceDetails.moveType` (`resolveMovingPricingSlug` + `moveVariantRates` on catalog).
- Bedrooms 0–5 / exact 6+, bathrooms 1–5 / exact 6+ continue through `RoomCountSelector` → integer counts.

---

# Office Frequency Decision

**Model C — frequency displays recurring commitment only; it does not change per-visit price.**

- No inventing daily/weekly discounts.
- Recurring plan discounts remain Step 2 `bookingType` + `recurringFrequency` only.
- UI hint on the frequency field explains Model C explicitly.
- Office size + bathrooms still affect price and duration.

---

# Carpet/Rug/Upholstery Model

| Input | Role |
|-------|------|
| carpetRooms | Core — priced via `carpetRooms_per_room_zar` (staging 200) or `price_per_bedroom` |
| rugCount | Core — priced via `rugs_per_unit_zar` (default/staging 180); adds duration |
| sofa-upholstery | Extra — unit price 250; duration +45m |
| sofaCount | Legacy only — still priced if present so old drafts remain safe |

---

# Airbnb Pricing

- Staging rows `airbnb` / `airbnb-cleaning` with bedroom/bathroom/extra-room rates.
- Linens / access / welcome fields are informational; laundry and welcome-setup Extras stay distinct.

---

# Duration Display

Shared formatter: `formatEstimatedCleaningTimeLabel` → **Estimated cleaning time: 4 hours**

Surfaces updated:

- Booking summary panel  
- Step 3 Review schedule chip  
- Admin pricing display  

Uses `pricingSummary.estimated_duration_minutes` from `calculateCustomerTotal` / server quote — not independent recalculation.

---

# Paystack Cancel Recovery

1. Confirm creates `pending_payment`; `pendingBookingId` persisted in booking-v2 draft (`localStorage`).
2. Payment-session callback_url → `/pay/{bookingId}` (Paystack appends `reference`/`trxref`).
3. Cancel/return: `/pay/{id}` shows **Try payment again** with owner Bearer auth; fresh authorization for same booking.
4. Step 4 remount restores `pendingBookingId`; retry uses payment-session; on `PAYMENT_BOOKING_NOT_FOUND` clears id and re-confirms (reuse path).
5. Idempotency: `ensureBookingPaymentSession` inflight map + abandoned-link refresh; no duplicate settlement.

---

# Tests

- `lib/booking-v2/__tests__/princessPra2ServicePricingPaymentRecovery.test.ts` — aliases, matrix, move, office Model C, carpet/rugs/sofa, airbnb, duration label, consumption guard, recovery contracts  
- Prior PR A suite retained  

---

# Staging Verification

After deploy of this PR to staging:

1. `/api/booking-v2/services` — move / airbnb / carpet / office have non-zero relevant rates  
2. Move-in vs move-out totals differ for same rooms  
3. Carpet rooms + rugs move total and duration; sofa Extra appears  
4. Office frequency change does not change total; size does  
5. Duration label visible on config / Review  
6. Paystack test cancel → `/pay/{id}` retry succeeds without duplicate booking  

Staging seed (this ticket): upserted move / move-in / move-out / airbnb / carpet / office rows + sofa-upholstery extra + property_factor_rates on `pricing_booking_config`.

---

# Production Non-Impact

- No production deploy, migration apply to prod, or Paystack live mode.
- Alias + office slug changes are backward-compatible with existing engine keys.
- Finance SoT unchanged (no payout / ledger edits).

---

# Remaining Risks

- Soft slot hold TOCTOU (inherited).
- Office Model C may later become Model A if product approves frequency discounts.
- Inherited Vitest flake `bookingQuoteLifecyclePhase8` (Farai) if still present in full suite.

---

# Princess Retest Checklist

- [ ] Standard / Deep rooms still price (PR A regression)  
- [ ] Move-in rooms 0→2→6+ and bathrooms update Review + Paystack amount  
- [ ] Move-out same; totals differ from move-in when rates differ  
- [ ] Office: change frequency → total unchanged; change size → total changes  
- [ ] Carpet: rooms + rugs update total/duration; sofa Extra works  
- [ ] Airbnb: rooms update total/duration; laundry Extra distinct  
- [ ] Duration label on Step 1–3 and admin detail  
- [ ] Reserve → Paystack cancel → retry pays same booking  
- [ ] Double-click retry does not duplicate booking / settlement  

---

# Final Decision

**PASS — PRINCESS PR A SERVICE PRICING AND RECOVERY READY FOR REVIEW**
