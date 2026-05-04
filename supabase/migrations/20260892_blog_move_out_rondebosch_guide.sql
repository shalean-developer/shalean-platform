-- Rondebosch move-out / student-turnover editorial guide (published). Sync body with apps/web/lib/blog/seed/locationHubStructuredContent.ts.

INSERT INTO public.blog_posts (
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
  featured_image_url,
  featured_image_alt,
  published_at,
  created_at,
  updated_at
)
VALUES (
  'move-out-cleaning-rondebosch-cape-town',
  'Move-Out Cleaning in Rondebosch Cape Town: Deposit-Ready Checklist & Costs',
  'Move-Out Cleaning in Rondebosch Cape Town: Deposit-Ready Checklist & Costs',
  'Move-out cleaning in Rondebosch for student rentals and shared homes—deposit-ready checklist, pricing from around R900–R1200, same-day options, and how to book.',
  'published'::public.blog_post_status,
  'programmatic'::public.blog_post_source,
$lh_0_${"schema_version":1,"blocks":[{"type":"paragraph","content":"Rondebosch has a high number of student rentals and shared homes, which means frequent move-outs and strict inspection standards. A proper move-out clean helps you leave the property spotless and improves your chances of getting your full deposit back."},{"type":"paragraph","content":"In this guide, we cover what's included in move-out cleaning in Rondebosch, typical costs, and how to book quickly."},{"type":"paragraph","content":"If you're searching for move-out cleaning near you in Rondebosch, our local cleaners can prepare your property for inspection quickly and reliably."},{"type":"heading","level":2,"content":"Move-out cleaning in Rondebosch"},{"type":"paragraph","content":"Professional [cleaning services in Rondebosch](/locations/rondebosch-cleaning-services) are designed to meet landlord and agency inspection standards, especially for student housing and shared rentals."},{"type":"heading","level":2,"content":"Why move-out cleaning is common in Rondebosch"},{"type":"bullet_list","items":["Student leases end on fixed dates → high turnover","Shared homes require full resets between tenants","Landlords expect inspection-ready cleaning","Deposits often depend on cleanliness"]},{"type":"heading","level":2,"content":"Cleaning services available in Rondebosch"},{"type":"bullet_list","items":["[Move-out cleaning](/services/move-out-cleaning-cape-town)","[Deep cleaning](/services/deep-cleaning-cape-town)","[Standard home cleaning](/services/standard-cleaning-cape-town)","[Window cleaning](/services/window-cleaning-cape-town)"]},{"type":"heading","level":2,"id":"pricing","content":"How much does move-out cleaning cost in Rondebosch?"},{"type":"paragraph","content":"Move-out cleaning in Rondebosch typically starts from around R900–R1200 depending on the size of the property and its condition. Shared homes and student properties may require more detailed cleaning before inspection."},{"type":"paragraph","content":"👉 [Get an exact quote](/booking/details)"},{"type":"paragraph","content":"For deeper resets, see our [deep cleaning services](/services/deep-cleaning-cape-town)."},{"type":"heading","level":2,"content":"Same-day move-out cleaning in Rondebosch"},{"type":"paragraph","content":"Need a last-minute clean before inspection? Same-day and next-day bookings are often available in Rondebosch depending on demand."},{"type":"paragraph","content":"👉 [Check availability now](/booking/details)"},{"type":"heading","level":2,"content":"Move-out cleaning checklist"},{"type":"bullet_list","items":["Kitchen (oven, cupboards, surfaces)","Bathrooms (tiles, grout, fixtures)","Floors vacuumed and mopped","Inside cupboards and wardrobes","Windows (interior)"]},{"type":"paragraph","content":"For deeper resets, consider our [deep cleaning services](/services/deep-cleaning-cape-town) and for final polish, [window cleaning](/services/window-cleaning-cape-town)."},{"type":"paragraph","content":"You may also be interested in nearby areas like [cleaning services in Claremont](/blog/cleaning-services-claremont-cape-town) or [Airbnb cleaning in Green Point](/blog/airbnb-cleaning-green-point-cape-town)."},{"type":"paragraph","content":"We also serve nearby areas like [Newlands](/locations/newlands-cleaning-services)."},{"type":"heading","level":2,"id":"booking","content":"Book move-out cleaning in Rondebosch"},{"type":"paragraph","content":"Book a reliable cleaner and get your property inspection-ready in Rondebosch."},{"type":"paragraph","content":"👉 [View cleaning services in Rondebosch](/locations/rondebosch-cleaning-services)"},{"type":"faq","omit_section_heading":true,"items":[{"question":"How much does move-out cleaning cost in Rondebosch?","answer":"Move-out cleaning in Rondebosch typically starts from around R900–R1200 depending on property size and condition."},{"question":"Do you offer same-day move-out cleaning in Rondebosch?","answer":"Yes, same-day cleaning is often available depending on scheduling. You can check availability and book online."}]},{"type":"cta","title":"Book move-out cleaning in Rondebosch","description":"Get inspection-ready results with upfront pricing online.","button_text":"Get instant quote","link":"/booking/details","variant":"primary"}]}$lh_0_$::jsonb,
  'Move-Out Cleaning Rondebosch Cape Town | Deposit Guide | Shalean Blog',
  'Move-out cleaning in Rondebosch: student and shared-housing turnover, inspection-ready scope, pricing from around R900–R1200, same-day when available. Book online.',
  'move out cleaning rondebosch cape town',
  'transactional',
  '/images/marketing/move-out-cleaning-cape-town-handover.webp',
  'Move-out cleaning for an inspection-ready Rondebosch rental home',
  timestamptz '2026-05-04 09:00:00+02',
  now(),
  now()
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  h1 = EXCLUDED.h1,
  excerpt = EXCLUDED.excerpt,
  status = EXCLUDED.status,
  source = EXCLUDED.source,
  content_json = EXCLUDED.content_json,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description,
  primary_keyword = EXCLUDED.primary_keyword,
  search_intent = EXCLUDED.search_intent,
  featured_image_url = EXCLUDED.featured_image_url,
  featured_image_alt = EXCLUDED.featured_image_alt,
  published_at = EXCLUDED.published_at,
  updated_at = now();
