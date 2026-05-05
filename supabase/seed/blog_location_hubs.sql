-- 7 location hub drafts for blog_posts (draft, programmatic source).
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
  (
  gen_random_uuid(),
  'cleaning-services-claremont-cape-town',
  'Cleaning Services in Claremont Cape Town: What to Expect & How to Choose',
  'Cleaning Services in Claremont Cape Town: What to Expect & How to Choose',
  'What to expect from cleaning services in Claremont—pricing, local context, popular services, and how to book vetted cleaners online.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Claremont\n\nWhether you are juggling school runs along Main Road or resetting the house after a busy week, Shalean connects you with vetted cleaners across Claremont and the wider Southern Suburbs. Every booking is priced before you pay—no surprises—and teams arrive briefed for Cape Town homes, from compact cottages to larger family layouts.\n\n### Services Included\n\n**Deep cleaning** — Top-to-bottom attention for kitchens, bathrooms, floors and detail zones when a routine tidy is not enough.\n\n**Standard cleaning** — Reliable upkeep for busy households: surfaces, bathrooms, floors and the high-traffic areas that carry weekday dust.\n\n**Move-out cleaning** — Handover-focused scope so you can line up inventory checks with a consistently presented flat or house.\n\n**Airbnb cleaning** — Fast turnovers between guests with notes tailored to access, parking and pet policies common around Claremont.\n\n**Carpet cleaning** — Focused care for rugs and carpeted areas where pets, kids and winter mud show up first.\n\n### Pricing\n\nMost Claremont visits fall in a **mid-range band for typical flats and houses** (think **roughly R350–R850+** depending on size), while larger homes or add-ons move the total up. Price moves with bedrooms and bathrooms, cleaning tier, extras such as ovens or fridges, and how detailed the brief is. Enter your address and home size in our flow for an **itemised quote before checkout**—then confirm a slot that suits you.\n\n### Why Choose Us\n\n- **Vetted cleaners** — Teams are onboarded with clear standards and accountability.\n- **Flexible scheduling** — Choose slots that match school weeks, work trips and lease deadlines.\n- **Quality assurance** — Structured checklists help visits match what you booked.\n\n### Local Area Context\n\nClaremont sits between Newlands, Rondebosch and Kenilworth—leafy streets, mixed apartments and family houses. Nearby picks up traffic from arterial roads; accurate gate codes and parking notes save time on the day. If you want city-wide context on deep cleans, see our [deep cleaning Cape Town service page](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**How much does cleaning cost in Claremont?** — It depends on home size, bathrooms and add-ons. Use online booking for a fixed breakdown before payment.\n\n**Can I book this week?** — Availability shifts with seasonality; the booking calendar shows open slots for your address.\n\n**Do cleaners bring supplies?** — Standard visits are supplied unless your booking states otherwise.\n\n**How do I book?** — Pick service tier, date and extras online, then checkout securely.\n\n### Book Today\n\n**Book your cleaner in Claremont today** — start here: [/booking](/booking)\n\nFor move-out scope compared with maintenance cleans, read [move-out cleaning in Cape Town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Claremont Cleaning Services Cape Town | Guide | Shalean Blog',
  'Cleaning services in Claremont, Cape Town: what to expect, typical pricing from R400–R500+, links to services and the Claremont hub. Book online.',
  'cleaning services in claremont',
  'transactional',
  now(),
  now()
),
  (
  gen_random_uuid(),
  'cleaning-services-sea-point-cape-town',
  'Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)',
  'Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)',
  'Professional cleaning in Sea Point for apartments and coastal homes. Same-week slots and upfront pricing before you pay.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Sea Point\n\nSea Point blends Atlantic Seaboard apartments with busier Main Road energy—salt on balconies, lifts and compact layouts are everyday realities. Shalean helps you book vetted cleaners who understand Cape Town coastal living: tight turnovers, clear access notes and outcomes you can stand behind when guests or landlords visit.\n\n### Services Included\n\n**Deep cleaning** — Detail work for kitchens and bathrooms when breeze-borne grit and daily foot traffic stack up.\n\n**Standard cleaning** — Consistent upkeep for flats where corridors and open-plan living spaces carry sand and dust inward.\n\n**Move-out cleaning** — Scope aligned to rental inspections in high-turnover buildings.\n\n**Airbnb cleaning** — Guest-ready finishes with host notes for parking bays, remotes and complex access.\n\n**Carpet cleaning** — Targeted attention for rugs and carpets in rental stock and owner-occupied units.\n\n### Pricing\n\nExpect **typical Sea Point bookings** to land around **R380–R900+** for many flats and smaller houses, with **larger homes or heavy add-ons** pushing higher. Elevator delays, longer carries and detail tiers can shift time on site—your quote reflects what you select. Use instant pricing in **[booking](/booking)** to lock scope before you commit.\n\n### Why Choose Us\n\n- **Vetted cleaners** — Professionals accustomed to apartment logistics.\n- **Flexible scheduling** — Early slots for turnovers; later cleans when you are home.\n- **Quality assurance** — Checklists align scope with what you paid for.\n\n### Local Area Context\n\nSea Point neighbours Green Point, Fresnaye and Bantry Bay—think apartments with ocean proximity, older blocks with stairs and newer builds with basement parking. Mention loading zones when you book. Compare deep-clean scope city-wide on [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**What affects price on the Atlantic Seaboard?** — Size, bathrooms, extras (oven, fridge, inside cupboards) and cleaning tier.\n\n**Same-week availability?** — Yes when slots show green—peak summer tightens faster.\n\n**Products and equipment?** — Supplied on standard bookings unless you opt otherwise.\n\n**Can I book for an Airbnb between guests?** — Yes—add turnover notes and linen expectations in your brief.\n\n### Book Today\n\n**Book your cleaner in Sea Point today:** [/booking](/booking)\n\nMoving out? Align expectations with [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Cleaning Services in Sea Point Cape Town (2026 Guide & Prices)',
  'Professional cleaning in Sea Point: apartments & coastal homes. Same-week slots, clear pricing before you pay, and cleaners briefed for lifts, parking & salty air.',
  'cleaning services in sea point',
  'informational',
  now(),
  now()
),
  (
  gen_random_uuid(),
  'cleaning-services-rondebosch-cape-town',
  'Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)',
  'Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)',
  'Cleaning services in Rondebosch for rentals and family houses. Deep, standard and move-out cleans with upfront quotes.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Rondebosch\n\nFrom duplex corridors near campus routes to long-standing family streets with split levels, Rondebosch needs cleaners who read access notes carefully. Shalean covers Cape Town addresses with transparent pricing and teams briefed for Southern Suburb realities—narrow drives, shared entrances and kitchens that work hard during term time.\n\n### Services Included\n\n**Deep cleaning** — Reset kitchens and bathrooms after busy weeks or before hosting.\n\n**Standard cleaning** — Predictable upkeep so shared spaces stay ahead of clutter.\n\n**Move-out cleaning** — Strong fit for lease ends when deposit outcomes matter.\n\n**Airbnb cleaning** — Quick turnovers where parking instructions and key drops must be precise.\n\n**Carpet cleaning** — Extra attention on high-traffic rugs where student footfall meets winter mud.\n\n### Pricing\n\nMany Rondebosch jobs price between **roughly R360–R880+** based on bedrooms, bathrooms and extras. Split-level layouts or heavy appliance add-ons extend duration—your online quote itemises line items so you see the total **before** payment. Start at [/booking](/booking).\n\n### Why Choose Us\n\n- **Vetted cleaners** — Standards that hold up for landlords and families alike.\n- **Flexible scheduling** — Book around exams, holidays and handover dates.\n- **Quality assurance** — Structured visits reduce “almost clean” outcomes.\n\n### Local Area Context\n\nRondebosch ties to Claremont, Observatory and Newlands—mix of rentals and owned homes. Mention stairs, pets and gate remotes when booking. For deep-clean positioning across the metro, visit [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**How is pricing calculated?** — Home configuration, service tier and selected add-ons.\n\n**Do you cover move-outs near UCT?** — Yes—choose move-out scope and list inspection priorities.\n\n**Supplies included?** — Yes on standard professional visits unless stated otherwise.\n\n**Can I reschedule?** — Subject to calendar rules shown at checkout.\n\n### Book Today\n\n**Book your cleaner in Rondebosch today:** [/booking](/booking)\n\nCompare move-out detail here: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Cleaning Services in Rondebosch Cape Town (2026 Guide & Prices)',
  'Cleaning services in Rondebosch for rentals and family houses. Deep, standard & move-out cleans with upfront quotes. Book trusted Cape Town cleaners online.',
  'cleaning services in rondebosch',
  'informational',
  now(),
  now()
),
  (
  gen_random_uuid(),
  'cleaning-services-gardens-cape-town',
  'Cleaning Services in Gardens Cape Town (2026 Guide & Prices)',
  'Cleaning Services in Gardens Cape Town (2026 Guide & Prices)',
  'Trusted cleaning in Gardens, Cape Town—walk-ups, heritage flats and busy kitchens with clear pricing and secure booking.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Gardens\n\nThe Gardens mixes heritage walk-ups, Kloof-adjacent flats and festival-week footfall—stairs, tight entrances and compact kitchens reward crews who arrive prepared. Shalean pairs Cape Town homeowners and renters with reliable cleaners, upfront totals and briefs that respect security estates and buzzer rules.\n\n### Services Included\n\n**Deep cleaning** — Slow, thorough passes where grime hides along skirtings and behind appliances.\n\n**Standard cleaning** — Keeps City Bowl homes presentable between bigger resets.\n\n**Move-out cleaning** — Suited to lease ends when agents expect consistent finishes.\n\n**Airbnb cleaning** — Fast schedules aligned with guest changeovers and noise-conscious buildings.\n\n**Carpet cleaning** — Rugs and carpets that trap pollen from mountain-side breezes and indoor shoes-off habits.\n\n### Pricing\n\nCity Bowl layouts often price around **R340–R860+** depending on square metres hidden behind doors—extra stairs or parking hunts add time. Build your scope online for a **transparent quote**—then pay securely. Begin at [/booking](/booking).\n\n### Why Choose Us\n\n- **Vetted cleaners** — Professionals used to urban access constraints.\n- **Flexible scheduling** — Early turnovers or quieter midday visits.\n- **Quality assurance** — Visit structure tied to what you selected.\n\n### Local Area Context\n\nGardens sits beside Tamboerskloof and Oranjezicht—dense routes, mixed apartment sizes and balconies that collect dust. Internal links for deeper service education: [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**Why did my quote change when I added bathrooms?** — Bathrooms drive scrub time—your preview updates live.\n\n**Parking in the Bowl?** — Add bay numbers or scratch-card notes so teams start on time.\n\n**Cleaning products?** — Provided on standard bookings unless you request otherwise.\n\n**Booking steps?** — Address → home details → extras → slot → checkout.\n\n### Book Today\n\n**Book your cleaner in Gardens today:** [/booking](/booking)\n\nMove-out specifics: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Cleaning Services in Gardens Cape Town (2026 Guide & Prices)',
  'Trusted cleaning services in Gardens, Cape Town—walk-ups, heritage flats & busy kitchens. Clear pricing, vetted cleaners & secure booking for City Bowl homes.',
  'cleaning services in gardens',
  'informational',
  now(),
  now()
),
  (
  gen_random_uuid(),
  'cleaning-services-wynberg-cape-town',
  'Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)',
  'Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)',
  'Book cleaning services in Wynberg for family houses, apartments and rentals. Deep, standard and move-out cleans with instant quotes.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Wynberg\n\nWynberg balances Plumstead-adjacent suburbs, school-week intensity and homes where gardens shed leaves into passages. Shalean matches you with vetted Cape Town cleaners who treat booking notes seriously—pets, side gates and driveway angles included—so you get dependable outcomes without chasing freelancers.\n\n### Services Included\n\n**Deep cleaning** — Seasonal or pre-event resets when kitchens and bathrooms need extra minutes.\n\n**Standard cleaning** — Weekly or fortnightly rhythm for busy households.\n\n**Move-out cleaning** — Scope tuned for rental standards across Southern Suburb stock.\n\n**Airbnb cleaning** — Predictable turnovers when hosts need consistent staging.\n\n**Carpet cleaning** — Soft floors that collect pet hair and outdoor dust.\n\n### Pricing\n\nTypical Wynberg bookings often fall **near R350–R870+**, scaling with bedrooms, bathrooms and optional appliance jobs. Your total is shown **before payment**—adjust extras until it matches your budget, then confirm at [/booking](/booking).\n\n### Why Choose Us\n\n- **Vetted cleaners** — Quality bar built for repeat suburban visits.\n- **Flexible scheduling** — Slots that respect school runs and work travel.\n- **Quality assurance** — Alignment between checklist and checkout.\n\n### Local Area Context\n\nWynberg connects Kenilworth, Bergvliet and Constantia-facing routes—mix of freestanding houses and sectional titles. Mention estate rules early. Explore metro-wide deep cleaning positioning at [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**Are quotes fixed?** — You see the breakdown before paying for the selected scope.\n\n**Can I book carpets only?** — Bundle carpet attention within your tier or add-ons where offered.\n\n**Supplies?** — Professional kits supplied unless your booking says otherwise.\n\n**How fast can someone arrive?** — Calendar shows live openings—peak periods fill sooner.\n\n### Book Today\n\n**Book your cleaner in Wynberg today:** [/booking](/booking)\n\nHandover help: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Cleaning Services in Wynberg Cape Town (2026 Guide & Prices)',
  'Book cleaning services in Wynberg—family houses, apartments & rentals. Deep, standard, Airbnb & move-out cleans with instant quotes and trusted Cape Town cleaners.',
  'cleaning services in wynberg',
  'informational',
  now(),
  now()
),
  (
  gen_random_uuid(),
  'cleaning-services-green-point-cape-town',
  'Cleaning Services in Green Point Cape Town (2026 Guide & Prices)',
  'Cleaning Services in Green Point Cape Town (2026 Guide & Prices)',
  'Cleaning services in Green Point for Seaboard apartments and rentals. Instant quotes and teams briefed for lifts, parking and coastal living.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Green Point\n\nGreen Point pairs Stadium-adjacent energy with Seaboard apartments—parking bays, lifts and salty balconies define many visits. Shalean helps Cape Town residents and hosts book cleaners who understand compact layouts and guest-ready finishes, with pricing displayed **before** you confirm.\n\n### Services Included\n\n**Deep cleaning** — Intensive kitchens and bathrooms after events or long hosting stretches.\n\n**Standard cleaning** — Keeps modern finishes fresh between deeper resets.\n\n**Move-out cleaning** — Suited to sectional-title inspections along the Atlantic rim.\n\n**Airbnb cleaning** — Quick changeovers with linen-ready surfaces and crisp wet areas.\n\n**Carpet cleaning** — Rugs and carpets where coastal grit meets indoor living.\n\n### Pricing\n\nExpect many Green Point bookings around **R370–R920+** depending on unit size, bathrooms and add-ons like ovens or detailed grout attention. Coastal humidity can extend drying-related tasks—your quote reflects what you select. Lock pricing via [/booking](/booking).\n\n### Why Choose Us\n\n- **Vetted cleaners** — Professionals comfortable with Seaboard logistics.\n- **Flexible scheduling** — Early turnovers or quieter weekday cleans.\n- **Quality assurance** — Deliverables mapped to your checkout selections.\n\n### Local Area Context\n\nGreen Point touches Sea Point, Fresnaye and the City Bowl edge—high-rise stock, basement parking and promenade foot traffic. Nearby-area clarity helps crews bring the right kit. More on deep cleaning city-wide: [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**Do you service complexes with strict access?** — Yes—add security and remote instructions.\n\n**What impacts availability?** — Events and holiday peaks tighten calendars—book early.\n\n**Equipment supplied?** — Standard yes; flag allergies or green-product preferences in notes.\n\n**How does booking work?** — Online flow through [/booking](/booking) with secure payment.\n\n### Book Today\n\n**Book your cleaner in Green Point today:** [/booking](/booking)\n\nMove-out guidance: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Cleaning Services in Green Point Cape Town (2026 Guide & Prices)',
  'Cleaning services in Green Point for Seaboard apartments & rentals. Instant quotes, vetted teams & turnovers built for lifts, parking & Cape Town coastal living.',
  'cleaning services in green point',
  'informational',
  now(),
  now()
),
  (
  gen_random_uuid(),
  'cleaning-services-durbanville-cape-town',
  'Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)',
  'Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)',
  'House cleaning in Durbanville and the Northern Suburbs. Deep, standard and move-out services with upfront Cape Town pricing.',
  'draft'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
  '{"schema_version":1,"blocks":[{"type":"paragraph","content":"## Cleaning Services in Durbanville\n\nDurbanville favours larger plots, family schedules and kitchens that serve braai weekends—dust from gardens and busy mudrooms shows up fast. Shalean connects Northern Suburb households with trusted Cape Town cleaners, transparent totals and visits scaled to **your** floor plan—not a one-size guestimate.\n\n### Services Included\n\n**Deep cleaning** — Whole-home resets where multiple bathrooms and open living zones need coordinated time.\n\n**Standard cleaning** — Keeps bigger homes manageable between seasonal deep dives.\n\n**Move-out cleaning** — Ideal before buyers walk through or tenants sign off inventories.\n\n**Airbnb cleaning** — Guest-ready stays when short-let stock sits on estate-style complexes.\n\n**Carpet cleaning** — Soft flooring across lounges and bedrooms where kids and pets roam.\n\n### Pricing\n\nLarger Durbanville homes commonly land **around R420–R980+** once bedrooms, bathrooms and add-ons are counted—**small flats lower**, **estates higher**. Your online builder shows line items instantly; nothing hidden at checkout. Start here: [/booking](/booking).\n\n### Why Choose Us\n\n- **Vetted cleaners** — Teams comfortable with bigger footprints.\n- **Flexible scheduling** — Weekday deep cleans or Saturday slots when families are home.\n- **Quality assurance** — Scope clarity protects both sides.\n\n### Local Area Context\n\nDurbanville pairs with Bellville, Brackenfell and Plattekloof runs—freestanding houses, townhouses and estate security. Mention gatehouses when booking. Deep-clean overview for the wider city: [/services/deep-cleaning-cape-town](/services/deep-cleaning-cape-town).\n\n### FAQ\n\n**Why do bigger homes cost more?** — Square metres, bathrooms and floors drive labour time.\n\n**Can I book move-out for a double-storey?** — Yes—detail levels and extras so crews allocate enough hours.\n\n**Supplies included?** — Standard professional visits include products unless stated otherwise.\n\n**Instant quote?** — Yes—through [/booking](/booking) before payment.\n\n### Book Today\n\n**Book your cleaner in Durbanville today:** [/booking](/booking)\n\nMove-out standards across Cape Town: [/services/move-out-cleaning-cape-town](/services/move-out-cleaning-cape-town)."}]}'::jsonb,
  'Cleaning Services in Durbanville Cape Town (2026 Guide & Prices)',
  'House cleaning in Durbanville & Northern Suburbs—deep, standard & move-out services. Upfront Cape Town pricing, vetted cleaners & easy online booking.',
  'cleaning services in durbanville',
  'informational',
  now(),
  now()
)
ON CONFLICT (slug) DO NOTHING;

-- Verification (run after insert):
-- SELECT slug, status, source FROM public.blog_posts WHERE slug LIKE 'cleaning-services-%' ORDER BY slug;
