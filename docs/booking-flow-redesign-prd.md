# PRD: Shalean booking flow redesign (conversion & mobile-first)

| Field | Value |
|--------|--------|
| **Status** | Draft |
| **Business** | Shalean Cleaning Services |
| **Market** | Cape Town, South Africa — cleaning services marketplace |
| **Stack** | Next.js, React, Tailwind CSS, shadcn/ui, Supabase, Paystack |
| **Owner** | Product + Engineering (TBD) |
| **Stakeholders** | Growth, Support, Operations |

---

## 1. Summary

Redesign the customer booking funnel to **increase completed bookings** by reducing **funnel friction**, **decision fatigue**, **cognitive overload**, and **abandonment**. The experience is visually strong today but introduces **too many decisions too early**, especially on mobile.

**Primary outcome:** A **premium, mobile-first, conversion-optimized** flow that feels **fast, guided, and trustworthy**, with **granular analytics** for funnel and A/B decisions.

---

## 2. Problem statement

### 2.1 Business symptom

Users enter the booking flow but drop before **scheduling** and **payment**.

### 2.2 Funnel snapshot (baseline — document source & date when implementing)

| Stage | Count |
|-------|------:|
| Visitors | 286 |
| Started booking | 107 |
| Viewed price | 5 |
| Selected time | 0 |
| Completed booking | 0 |

### 2.3 UX diagnosis

- The flow **looks good** but creates **too many visible choices early** (especially extras and cleaner selection).
- Schedule step can feel **broken** when availability is empty or CTAs are disabled without explanation.
- **Mandatory cleaner selection** increases comparison load; most users want **“just send a good cleaner.”**
- **Mobile** needs stronger **momentum** (sticky summary + CTA, bottom sheet, large targets).

---

## 3. Goals

1. **Higher completion:** Move users from start → schedule → pay with fewer early decisions.
2. **Momentum:** Step copy, layout, and loading states that **pull users forward** (no dead-end blank states).
3. **Trust:** Pricing transparency + explicit trust signals (fees, security, vetted cleaners, supplies where applicable).
4. **Mobile-first:** Sticky CTAs, bottom-sheet summary, 44px+ touch targets, reduced vertical clutter.
5. **Measurement:** **Granular events** and shared properties for funnel, device, and session analysis.

---

## 4. Non-goals

- Replacing Paystack or changing core payment provider contracts (unless a separate initiative).
- Hiding or obfuscating **total price** or **what drives price** (transparency is a requirement).
- Adding **decorative** animation that slows perceived performance or increases CLS.
- Building a full **new design system** from scratch — extend **shadcn/ui** + Tailwind patterns already in use.

---

## 5. Target user journeys

| Persona | Job to be done |
|---------|----------------|
| **Mobile customer** | Book a clean **quickly**, with confidence in price and cleaner quality. |
| **Desktop customer** | Same flow with **sticky summary** visible alongside steps. |
| **Growth / product** | See **where** users drop and **why** (events + optional replay correlation). |

---

## 6. Proposed funnel structure

Replace the current step psychology with this **five-step** structure:

1. **Service & property** — service, rooms/scope, **extras collapsed by default**
2. **Schedule** — area, **date**, **time**, address as specified in current product rules
3. **Cleaner** — **auto-assign default**; optional expanded manual browse
4. **Review & pay** — minimal contact fields + Paystack
5. **Booking confirmation** — clear success and next steps

*Step naming in UI may shorten for mobile; logic must map 1:1 to analytics steps.*

---

## 7. Functional requirements by phase

### Phase 1 — Core UX redesign strategy

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-1.1 | Fewer decisions before schedule | Extras are **not** fully expanded on first paint; primary path is service → schedule. |
| FR-1.2 | Stronger CTAs | No generic lone “Continue”; use **step-specific** copy (see Phase 2–5). |
| FR-1.3 | Pricing transparency preserved | Sticky summary always shows **service, price, estimated hours, date (when known), extras, address summary**. |
| FR-1.4 | Mobile parity | Mobile implements **sticky bottom CTA** + **collapsible summary** (drawer / bottom sheet). |

### Phase 2 — Service & property

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-2.1 | Progressive disclosure for extras | Extras live behind **accordion / expandable** (e.g. “Add extras (optional)”). |
| FR-2.2 | CTA copy | Primary button examples: **“Continue to schedule”**, **“See available times”**, **“Choose your booking time”** (pick one consistent pattern per locale). |
| FR-2.3 | Trust near price | Show short trust line(s): e.g. **No hidden fees**, **Vetted cleaners**, **Secure payment**, **Supplies included** (where product truth allows). |
| FR-2.4 | Sticky summary | Desktop: sticky sidebar summary. Mobile: **compact + expandable** summary (see Phase 6). |

### Phase 3 — Schedule

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-3.1 | Empty state copy | Before area/date prerequisites: show **“Select your area and date to see available times”** (or equivalent) — **no** blank “broken” blocks. |
| FR-3.2 | Time slot UX | Slots are **clearly selectable**, hover/focus states, visible **selected** state, touch-friendly. |
| FR-3.3 | Loading feedback | On area + date selection: **fetch times**, show **skeletons** or inline loading — avoid long blank panels. |
| FR-3.4 | CTA hierarchy | Primary: **“Continue to cleaner”**. Secondary: Back. Disabled primary explains **why** (e.g. **“Select a date and time to continue”**). |

### Phase 4 — Cleaner

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-4.1 | Default auto-assign | **“Best available cleaner”** (or equivalent) **pre-selected** with **Recommended** treatment. |
| FR-4.2 | Explainer copy | Short trust line, e.g. **“We’ll match you with the best available cleaner for your booking.”** |
| FR-4.3 | Optional manual pick | **“Want to choose someone specific?”** reveals cleaner browser; default path does **not** force comparison. |
| FR-4.4 | Cleaner cards (when expanded) | Avatar, name, rating, jobs completed, recommendation %, optional profile drill-in — **limited** simultaneous comparison (avoid grid overload on mobile). |

### Phase 5 — Payment (review & pay)

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-5.1 | Minimal fields | Collect **full name, email, phone** (plus anything **legally or operationally required** — document deltas). |
| FR-5.2 | Trust near pay | **Secure checkout**, **Powered by Paystack**, **SSL**, **No hidden fees** (accurate). |
| FR-5.3 | Final CTA | Primary: **“Pay & confirm booking”** — not generic “Submit”. |

### Phase 6 — Mobile-first UX

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-6.1 | Sticky bottom bar | **Price + primary continue** always reachable while scrolling step content. |
| FR-6.2 | Bottom sheet summary | Summary in **minimized** state; **expand** for full breakdown. |
| FR-6.3 | Touch targets | Interactive controls **≥ 44px** height; adequate spacing between tappable elements. |
| FR-6.4 | Perceived performance | Skeletons, **smooth** step transitions (Framer Motion or CSS per engineering choice), **minimize CLS**. |

### Phase 7 — Event tracking & analytics

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-7.1 | Event list | Implement at minimum: `booking_step_details_started`, `booking_service_selected`, `booking_addon_selected`, `booking_continue_schedule`, `booking_date_selected`, `booking_time_selected`, `booking_cleaner_selected`, `booking_payment_started`, `booking_paystack_opened`, `booking_completed`. |
| FR-7.2 | Common properties | Each event includes a shared payload (see §7.1 below). |
| FR-7.3 | Session continuity | Stable **`booking_session_id`** across steps (generate at funnel entry; persist until completion or timeout). |

#### 7.1 Recommended event payload (baseline)

```ts
{
  booking_session_id: string;
  device_type: "mobile" | "tablet" | "desktop";
  service_type: string;
  source: string; // utm / referrer / entry surface
  suburb: string | null;
  estimated_price: number | null;
  estimated_hours: number | null;
  selected_extras: string[];
  cleaner_mode: "auto" | "manual";
  timestamp: string; // ISO-8601
}
```

*Engineering may add non-breaking fields (e.g. `step_index`, `ab_variant`) as needed.*

#### 7.2 Analytics use cases

- Funnel and drop-off by step  
- Mobile vs desktop  
- Time-to-completion  
- A/B tests and session replay correlation (where tooling allows)

### Phase 8 — UI design system

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-8.1 | Components | **shadcn/ui** + Tailwind; **Framer Motion** for purposeful transitions. |
| FR-8.2 | Visual direction | **Premium marketplace**: clean cards, generous spacing, rounded corners, **minimal noise** (reference: SweepSouth, Uber/Airbnb booking patterns, Apple-like clarity). |
| FR-8.3 | Calm guidance | Single clear primary action per viewport where possible. |

### Phase 9 — Performance

| ID | Requirement | Acceptance criteria |
|----|-------------|---------------------|
| FR-9.1 | Transitions | Step changes feel **client-side** (no full page reload illusion). |
| FR-9.2 | Rendering | Memoize / stabilize **summary** and **slot lists** to avoid unnecessary re-renders. |
| FR-9.3 | Lighthouse | Target **mobile Lighthouse ≥ 90** where feasible; document tradeoffs if marketing embeds block score. |

### Phase 10 — Deliverables

| Deliverable | Notes |
|-------------|--------|
| Redesigned booking UI | Desktop + mobile responsive |
| Improved funnel UX | Per phases 2–6 |
| Full event instrumentation | Per phase 7 |
| Component architecture | Reusable step shells, summary, slot grid, cleaner picker |
| Accessibility | Keyboard order, labels, focus rings, screen-reader friendly errors |

---

## 8. Success metrics

| Metric | Current (baseline) | Goal |
|--------|---------------------|------|
| Booking start rate | 37% | **45%+** |
| Reach schedule | 4.7% | **40%+** |
| Time selection | 0% | **25%+** |
| Booking completion | 0% | **10–20%** |

*Replace “current” with time-stamped analytics once the event layer ships.*

---

## 9. Implementation principles

### Do not

- Remove **sticky pricing summary** or hide **what the customer pays**
- Add **unnecessary** animation or **cluttered** comparison UIs early in the funnel
- Introduce **more** mandatory decisions before schedule

### Do

- Reduce cognitive load and **front-load momentum**
- Prioritize **mobile** layouts and touch ergonomics
- Keep the brand feeling **premium, fast, and calm**
- Preserve **honest** trust claims (only what operations and legal support)

---

## 10. Final objective

Ship a **premium, mobile-first, conversion-optimized** booking flow that:

- Feels **effortless** and **guided**
- Builds **trust** quickly without hiding price
- Reduces **abandonment** at schedule, cleaner, and pay
- Increases **completed bookings** toward the goals in §8
- Provides **granular analytics** for iteration and A/B tests
- **Scales** as services, extras, and regions grow

---

## 11. Open questions (for kickoff)

1. **Address capture timing:** Confirm whether address is collected on schedule step only or split (suburb early, full address later).
2. **Cleaner data:** Source of truth for ratings, job counts, and “recommendation %” for cards.
3. **Auto-assign contract:** Exact algorithm (dispatch rules vs simple “next available”) and customer-facing promise copy (legal/support alignment).
4. **Analytics sink:** Confirm tool (e.g. existing `track*` helpers, GTM, PostHog, etc.) and PII policy for `email`/`phone` in events (likely **exclude** from payloads).
5. **Baseline refresh:** Re-run funnel table after **7 days** of new events to validate metric definitions.

---

*End of PRD — Shalean booking flow redesign.*
