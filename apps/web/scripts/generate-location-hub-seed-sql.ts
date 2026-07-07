/**
 * Emits SQL for 7 location hub drafts.
 * Run: npx tsx apps/web/scripts/generate-location-hub-seed-sql.ts
 * Writes: supabase/seed/blog_location_hubs.sql (UTF-8)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const posts = [
  {
    location: "Claremont",
    slug: "cleaning-services-claremont-cape-town",
    title: "Cleaning Services in Claremont (Prices & Same-Day Booking)",
    meta_title: "Cleaning Services Claremont | Instant Pricing | Shalean",
    meta_description:
      "Book trusted cleaners in Claremont, Cape Town. Deep, standard, move-out & Airbnb cleaning with upfront pricing and same-week slots. Secure checkout online.",
    primary_keyword: "cleaning services in claremont",
    h1: "Cleaning Services in Claremont",
    excerpt:
      "Book trusted cleaners in Claremont, Cape Town. Deep, standard, move-out and Airbnb cleaning with upfront pricing and same-week slots.",
    content: `## Cleaning Services in Claremont

Whether you are juggling school runs along Main Road or resetting the house after a busy week, Shalean connects you with vetted cleaners across Claremont and the wider Southern Suburbs. Every booking is priced before you pay—no surprises—and teams arrive briefed for Cape Town homes, from compact cottages to larger family layouts.

### Services Included

**Deep cleaning** — Top-to-bottom attention for kitchens, bathrooms, floors and detail zones when a routine tidy is not enough.

**Standard cleaning** — Reliable upkeep for busy households: surfaces, bathrooms, floors and the high-traffic areas that carry weekday dust.

**Move-out cleaning** — Handover-focused scope so you can line up inventory checks with a consistently presented flat or house.

**Airbnb cleaning** — Fast turnovers between guests with notes tailored to access, parking and pet policies common around Claremont.

**Carpet cleaning** — Focused care for rugs and carpeted areas where pets, kids and winter mud show up first.

### Pricing

Most Claremont visits fall in a **mid-range band for typical flats and houses** (think **roughly R350–R850+** depending on size), while larger homes or add-ons move the total up. Price moves with bedrooms and bathrooms, cleaning tier, extras such as ovens or fridges, and how detailed the brief is. Enter your address and home size in our flow for an **itemised quote before checkout**—then confirm a slot that suits you.

### Why Choose Us

- **Vetted cleaners** — Teams are onboarded with clear standards and accountability.
- **Flexible scheduling** — Choose slots that match school weeks, work trips and lease deadlines.
- **Quality assurance** — Structured checklists help visits match what you booked.

### Local Area Context

Claremont sits between Newlands, Rondebosch and Kenilworth—leafy streets, mixed apartments and family houses. Nearby picks up traffic from arterial roads; accurate gate codes and parking notes save time on the day. If you want city-wide context on deep cleans, see our [deep cleaning Cape Town service page](/services/deep-cleaning-cape-town).

### FAQ

**How much does cleaning cost in Claremont?** — It depends on home size, bathrooms and add-ons. Use online booking for a fixed breakdown before payment.

**Can I book this week?** — Availability shifts with seasonality; the booking calendar shows open slots for your address.

**Do cleaners bring supplies?** — Standard visits are supplied unless your booking states otherwise.

**How do I book?** — Pick service tier, date and extras online, then checkout securely.

### Book Today

**Book your cleaner in Claremont today** — start here: [/booking](/booking)

For move-out scope compared with maintenance cleans, read [move-out cleaning in Cape Town](/services/move-out-cleaning-cape-town).`,
  },
  {
    location: "Sea Point",
    slug: "cleaning-services-sea-point-cape-town",
    title: "Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)",
    meta_title: "Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)",
    meta_description:
      "Professional cleaning in Sea Point: apartments & coastal homes. Same-week slots, clear pricing before you pay, and cleaners briefed for lifts, parking & salty air.",
    primary_keyword: "cleaning services in sea point",
    h1: "Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)",
    excerpt:
      "Professional cleaning in Sea Point for apartments and coastal homes. Same-week slots and upfront pricing before you pay.",
    content: `## Cleaning Services in Sea Point

Sea Point blends Atlantic Seaboard apartments with busier Main Road energy—salt on balconies, lifts and compact layouts are everyday realities. Shalean helps you book vetted cleaners who understand Cape Town coastal living: tight turnovers, clear access notes and outcomes you can stand behind when guests or landlords visit.

### Services Included

**Deep cleaning** — Detail work for kitchens and bathrooms when breeze-borne grit and daily foot traffic stack up.

**Standard cleaning** — Consistent upkeep for flats where corridors and open-plan living spaces carry sand and dust inward.

**Move-out cleaning** — Scope aligned to rental inspections in high-turnover buildings.

**Airbnb cleaning** — Guest-ready finishes with host notes for parking bays, remotes and complex access.

**Carpet cleaning** — Targeted attention for rugs and carpets in rental stock and owner-occupied units.

### Pricing

Expect **typical Sea Point bookings** to land around **R380–R900+** for many flats and smaller houses, with **larger homes or heavy add-ons** pushing higher. Elevator delays, longer carries and detail tiers can shift time on site—your quote reflects what you select. Use instant pricing in **[booking](/booking)** to lock scope before you commit.

### Why Choose Us

- **Vetted cleaners** — Professionals accustomed to apartment logistics.
- **Flexible scheduling** — Early slots for turnovers; later cleans when you are home.
- **Quality assurance** — Checklists align scope with what you paid for.

### Local Area Context

Sea Point neighbours Green Point, Fresnaye and Bantry Bay—think apartments with ocean proximity, older blocks with stairs and newer builds with basement parking. Mention loading zones when you book. Compare deep-clean scope city-wide on [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).

### FAQ

**What affects price on the Atlantic Seaboard?** — Size, bathrooms, extras (oven, fridge, inside cupboards) and cleaning tier.

**Same-week availability?** — Yes when slots show green—peak summer tightens faster.

**Products and equipment?** — Supplied on standard bookings unless you opt otherwise.

**Can I book for an Airbnb between guests?** — Yes—add turnover notes and linen expectations in your brief.

### Book Today

**Book your cleaner in Sea Point today:** [/booking](/booking)

Moving out? Align expectations with [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town).`,
  },
  {
    location: "Rondebosch",
    slug: "cleaning-services-rondebosch-cape-town",
    title: "Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)",
    meta_title: "Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)",
    meta_description:
      "Cleaning services in Rondebosch for rentals and family houses. Deep, standard & move-out cleans with upfront quotes. Book trusted Cape Town cleaners online.",
    primary_keyword: "cleaning services in rondebosch",
    h1: "Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)",
    excerpt:
      "Cleaning services in Rondebosch for rentals and family houses. Deep, standard and move-out cleans with upfront quotes.",
    content: `## Cleaning Services in Rondebosch

From duplex corridors near campus routes to long-standing family streets with split levels, Rondebosch needs cleaners who read access notes carefully. Shalean covers Cape Town addresses with transparent pricing and teams briefed for Southern Suburb realities—narrow drives, shared entrances and kitchens that work hard during term time.

### Services Included

**Deep cleaning** — Reset kitchens and bathrooms after busy weeks or before hosting.

**Standard cleaning** — Predictable upkeep so shared spaces stay ahead of clutter.

**Move-out cleaning** — Strong fit for lease ends when deposit outcomes matter.

**Airbnb cleaning** — Quick turnovers where parking instructions and key drops must be precise.

**Carpet cleaning** — Extra attention on high-traffic rugs where student footfall meets winter mud.

### Pricing

Many Rondebosch jobs price between **roughly R360–R880+** based on bedrooms, bathrooms and extras. Split-level layouts or heavy appliance add-ons extend duration—your online quote itemises line items so you see the total **before** payment. Start at [/booking](/booking).

### Why Choose Us

- **Vetted cleaners** — Standards that hold up for landlords and families alike.
- **Flexible scheduling** — Book around exams, holidays and handover dates.
- **Quality assurance** — Structured visits reduce “almost clean” outcomes.

### Local Area Context

Rondebosch ties to Claremont, Observatory and Newlands—mix of rentals and owned homes. Mention stairs, pets and gate remotes when booking. For deep-clean positioning across the metro, visit [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).

### FAQ

**How is pricing calculated?** — Home configuration, service tier and selected add-ons.

**Do you cover move-outs near UCT?** — Yes—choose move-out scope and list inspection priorities.

**Supplies included?** — Yes on standard professional visits unless stated otherwise.

**Can I reschedule?** — Subject to calendar rules shown at checkout.

### Book Today

**Book your cleaner in Rondebosch today:** [/booking](/booking)

Compare move-out detail here: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town).`,
  },
  {
    location: "Gardens",
    slug: "cleaning-services-gardens-cape-town",
    title: "Cleaning Services in Gardens Cape Town (2026 Guide & Prices)",
    meta_title: "Cleaning Services in Gardens Cape Town (2026 Guide & Prices)",
    meta_description:
      "Trusted cleaning services in Gardens, Cape Town—walk-ups, heritage flats & busy kitchens. Clear pricing, vetted cleaners & secure booking for City Bowl homes.",
    primary_keyword: "cleaning services in gardens",
    h1: "Cleaning Services in Gardens Cape Town (2026 Guide & Prices)",
    excerpt:
      "Trusted cleaning in Gardens, Cape Town—walk-ups, heritage flats and busy kitchens with clear pricing and secure booking.",
    content: `## Cleaning Services in Gardens

The Gardens mixes heritage walk-ups, Kloof-adjacent flats and festival-week footfall—stairs, tight entrances and compact kitchens reward crews who arrive prepared. Shalean pairs Cape Town homeowners and renters with reliable cleaners, upfront totals and briefs that respect security estates and buzzer rules.

### Services Included

**Deep cleaning** — Slow, thorough passes where grime hides along skirtings and behind appliances.

**Standard cleaning** — Keeps City Bowl homes presentable between bigger resets.

**Move-out cleaning** — Suited to lease ends when agents expect consistent finishes.

**Airbnb cleaning** — Fast schedules aligned with guest changeovers and noise-conscious buildings.

**Carpet cleaning** — Rugs and carpets that trap pollen from mountain-side breezes and indoor shoes-off habits.

### Pricing

City Bowl layouts often price around **R340–R860+** depending on square metres hidden behind doors—extra stairs or parking hunts add time. Build your scope online for a **transparent quote**—then pay securely. Begin at [/booking](/booking).

### Why Choose Us

- **Vetted cleaners** — Professionals used to urban access constraints.
- **Flexible scheduling** — Early turnovers or quieter midday visits.
- **Quality assurance** — Visit structure tied to what you selected.

### Local Area Context

Gardens sits beside Tamboerskloof and Oranjezicht—dense routes, mixed apartment sizes and balconies that collect dust. Internal links for deeper service education: [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).

### FAQ

**Why did my quote change when I added bathrooms?** — Bathrooms drive scrub time—your preview updates live.

**Parking in the Bowl?** — Add bay numbers or scratch-card notes so teams start on time.

**Cleaning products?** — Provided on standard bookings unless you request otherwise.

**Booking steps?** — Address → home details → extras → slot → checkout.

### Book Today

**Book your cleaner in Gardens today:** [/booking](/booking)

Move-out specifics: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town).`,
  },
  {
    location: "Wynberg",
    slug: "cleaning-services-wynberg-cape-town",
    title: "Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)",
    meta_title: "Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)",
    meta_description:
      "Book cleaning services in Wynberg—family houses, apartments & rentals. Deep, standard, Airbnb & move-out cleans with instant quotes and trusted Cape Town cleaners.",
    primary_keyword: "cleaning services in wynberg",
    h1: "Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)",
    excerpt:
      "Book cleaning services in Wynberg for family houses, apartments and rentals. Deep, standard and move-out cleans with instant quotes.",
    content: `## Cleaning Services in Wynberg

Wynberg balances Plumstead-adjacent suburbs, school-week intensity and homes where gardens shed leaves into passages. Shalean matches you with vetted Cape Town cleaners who treat booking notes seriously—pets, side gates and driveway angles included—so you get dependable outcomes without chasing freelancers.

### Services Included

**Deep cleaning** — Seasonal or pre-event resets when kitchens and bathrooms need extra minutes.

**Standard cleaning** — Weekly or fortnightly rhythm for busy households.

**Move-out cleaning** — Scope tuned for rental standards across Southern Suburb stock.

**Airbnb cleaning** — Predictable turnovers when hosts need consistent staging.

**Carpet cleaning** — Soft floors that collect pet hair and outdoor dust.

### Pricing

Typical Wynberg bookings often fall **near R350–R870+**, scaling with bedrooms, bathrooms and optional appliance jobs. Your total is shown **before payment**—adjust extras until it matches your budget, then confirm at [/booking](/booking).

### Why Choose Us

- **Vetted cleaners** — Quality bar built for repeat suburban visits.
- **Flexible scheduling** — Slots that respect school runs and work travel.
- **Quality assurance** — Alignment between checklist and checkout.

### Local Area Context

Wynberg connects Kenilworth, Bergvliet and Constantia-facing routes—mix of freestanding houses and sectional titles. Mention estate rules early. Explore metro-wide deep cleaning positioning at [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).

### FAQ

**Are quotes fixed?** — You see the breakdown before paying for the selected scope.

**Can I book carpets only?** — Bundle carpet attention within your tier or add-ons where offered.

**Supplies?** — Professional kits supplied unless your booking says otherwise.

**How fast can someone arrive?** — Calendar shows live openings—peak periods fill sooner.

### Book Today

**Book your cleaner in Wynberg today:** [/booking](/booking)

Handover help: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town).`,
  },
  {
    location: "Green Point",
    slug: "cleaning-services-green-point-cape-town",
    title: "Cleaning Services in Green Point Cape Town (2026 Guide & Prices)",
    meta_title: "Cleaning Services in Green Point Cape Town (2026 Guide & Prices)",
    meta_description:
      "Cleaning services in Green Point for Seaboard apartments & rentals. Instant quotes, vetted teams & turnovers built for lifts, parking & Cape Town coastal living.",
    primary_keyword: "cleaning services in green point",
    h1: "Cleaning Services in Green Point Cape Town (2026 Guide & Prices)",
    excerpt:
      "Cleaning services in Green Point for Seaboard apartments and rentals. Instant quotes and teams briefed for lifts, parking and coastal living.",
    content: `## Cleaning Services in Green Point

Green Point pairs Stadium-adjacent energy with Seaboard apartments—parking bays, lifts and salty balconies define many visits. Shalean helps Cape Town residents and hosts book cleaners who understand compact layouts and guest-ready finishes, with pricing displayed **before** you confirm.

### Services Included

**Deep cleaning** — Intensive kitchens and bathrooms after events or long hosting stretches.

**Standard cleaning** — Keeps modern finishes fresh between deeper resets.

**Move-out cleaning** — Suited to sectional-title inspections along the Atlantic rim.

**Airbnb cleaning** — Quick changeovers with linen-ready surfaces and crisp wet areas.

**Carpet cleaning** — Rugs and carpets where coastal grit meets indoor living.

### Pricing

Expect many Green Point bookings around **R370–R920+** depending on unit size, bathrooms and add-ons like ovens or detailed grout attention. Coastal humidity can extend drying-related tasks—your quote reflects what you select. Lock pricing via [/booking](/booking).

### Why Choose Us

- **Vetted cleaners** — Professionals comfortable with Seaboard logistics.
- **Flexible scheduling** — Early turnovers or quieter weekday cleans.
- **Quality assurance** — Deliverables mapped to your checkout selections.

### Local Area Context

Green Point touches Sea Point, Fresnaye and the City Bowl edge—high-rise stock, basement parking and promenade foot traffic. Nearby-area clarity helps crews bring the right kit. More on deep cleaning city-wide: [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).

### FAQ

**Do you service complexes with strict access?** — Yes—add security and remote instructions.

**What impacts availability?** — Events and holiday peaks tighten calendars—book early.

**Equipment supplied?** — Standard yes; flag allergies or green-product preferences in notes.

**How does booking work?** — Online flow through [/booking](/booking) with secure payment.

### Book Today

**Book your cleaner in Green Point today:** [/booking](/booking)

Move-out guidance: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town).`,
  },
  {
    location: "Durbanville",
    slug: "cleaning-services-durbanville-cape-town",
    title: "Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)",
    meta_title: "Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)",
    meta_description:
      "House cleaning in Durbanville & Northern Suburbs—deep, standard & move-out services. Upfront Cape Town pricing, vetted cleaners & easy online booking.",
    primary_keyword: "cleaning services in durbanville",
    h1: "Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)",
    excerpt:
      "House cleaning in Durbanville and the Northern Suburbs. Deep, standard and move-out services with upfront Cape Town pricing.",
    content: `## Cleaning Services in Durbanville

Durbanville favours larger plots, family schedules and kitchens that serve braai weekends—dust from gardens and busy mudrooms shows up fast. Shalean connects Northern Suburb households with trusted Cape Town cleaners, transparent totals and visits scaled to **your** floor plan—not a one-size guestimate.

### Services Included

**Deep cleaning** — Whole-home resets where multiple bathrooms and open living zones need coordinated time.

**Standard cleaning** — Keeps bigger homes manageable between seasonal deep dives.

**Move-out cleaning** — Ideal before buyers walk through or tenants sign off inventories.

**Airbnb cleaning** — Guest-ready stays when short-let stock sits on estate-style complexes.

**Carpet cleaning** — Soft flooring across lounges and bedrooms where kids and pets roam.

### Pricing

Larger Durbanville homes commonly land **around R420–R980+** once bedrooms, bathrooms and add-ons are counted—**small flats lower**, **estates higher**. Your online builder shows line items instantly; nothing hidden at checkout. Start here: [/booking](/booking).

### Why Choose Us

- **Vetted cleaners** — Teams comfortable with bigger footprints.
- **Flexible scheduling** — Weekday deep cleans or Saturday slots when families are home.
- **Quality assurance** — Scope clarity protects both sides.

### Local Area Context

Durbanville pairs with Bellville, Brackenfell and Plattekloof runs—freestanding houses, townhouses and estate security. Mention gatehouses when booking. Deep-clean overview for the wider city: [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).

### FAQ

**Why do bigger homes cost more?** — Square metres, bathrooms and floors drive labour time.

**Can I book move-out for a double-storey?** — Yes—detail levels and extras so crews allocate enough hours.

**Supplies included?** — Standard professional visits include products unless stated otherwise.

**Instant quote?** — Yes—through [/booking](/booking) before payment.

### Book Today

**Book your cleaner in Durbanville today:** [/booking](/booking)

Move-out standards across Cape Town: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town).`,
  },
];

function sqlEscLiteral(s: string): string {
  return s.replace(/'/g, "''");
}

function contentJson(content: string): string {
  const doc = {
    schema_version: 1 as const,
    blocks: [{ type: "paragraph" as const, content }],
  };
  return JSON.stringify(doc);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const outPath = path.join(repoRoot, "supabase", "seed", "blog_location_hubs.sql");

const rows = posts.map((p) => {
  const j = sqlEscLiteral(contentJson(p.content));
  return `  (
  gen_random_uuid(),
  '${sqlEscLiteral(p.slug)}',
  '${sqlEscLiteral(p.title)}',
  '${sqlEscLiteral(p.h1)}',
  '${sqlEscLiteral(p.excerpt)}',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '${j}'::jsonb,
  '${sqlEscLiteral(p.meta_title)}',
  '${sqlEscLiteral(p.meta_description)}',
  '${sqlEscLiteral(p.primary_keyword)}',
  'transactional',
  now(),
  now()
)`;
});

const sql = `-- 7 location hub drafts for blog_posts (draft, programmatic source).
-- Idempotent: ON CONFLICT (slug) DO NOTHING — never overwrites existing rows.
-- content_json uses Shalean canonical shape { schema_version, blocks[] } per apps/web/lib/blog/content-json.ts.
-- Single paragraph block; renderer uses whitespace-pre-line (markdown ##/** appear as plain text until refined in CMS).

INSERT INTO public.blog_posts (
  id,
  slug,
  title,
  h1,
  excerpt,
  status,
  source,
  content_json,
  meta_title,
  meta_description,
  primary_keyword,
  search_intent,
  created_at,
  updated_at
)
VALUES
${rows.join(",\n")}
ON CONFLICT (slug) DO NOTHING;

-- Verification (run after insert):
-- SELECT slug, status, source FROM public.blog_posts WHERE slug LIKE 'cleaning-services-%' ORDER BY slug;
`;

fs.writeFileSync(outPath, sql, "utf8");
process.stderr.write(`Wrote ${outPath}\n`);
