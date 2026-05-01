-- Example blog seed: run after migrations 20260857_blog_system_hybrid_content.sql + 20260858_blog_posts_production_constraints.sql.
-- Uses fixed UUIDs for repeatable local/staging loads.

INSERT INTO public.blog_authors (id, slug, display_name, bio, avatar_url)
VALUES (
  '11111111-1111-1111-1111-111111111101',
  'shalean-editorial',
  'Shalean Editorial',
  'Cape Town home cleaning tips, pricing transparency, and booking guidance.',
  NULL
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_categories (id, slug, name, description, sort_order, is_active)
VALUES (
  '22222222-2222-2222-2222-222222222201',
  'deep-cleaning',
  'Deep cleaning',
  'Guides for move-in, seasonal, and top-to-bottom resets.',
  10,
  true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_tags (id, slug, name)
VALUES
  ('33333333-3333-3333-3333-333333333301', 'cape-town', 'Cape Town'),
  ('33333333-3333-3333-3333-333333333302', 'deep-cleaning', 'Deep cleaning'),
  ('33333333-3333-3333-3333-333333333303', 'standard-cleaning', 'Standard cleaning')
ON CONFLICT (slug) DO NOTHING;

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
  canonical_url,
  featured_image_url,
  featured_image_alt,
  author_id,
  category_id,
  reading_time_minutes,
  published_at,
  noindex
)
VALUES (
  '44444444-4444-4444-4444-444444444401',
  'deep-vs-standard-cleaning-cape-town-db-example',
  'Deep Cleaning vs Standard Cleaning in Cape Town',
  'Deep cleaning vs standard cleaning: what you actually get in Cape Town',
  NULL,
  'published',
  'high_conversion',
  $json$
{
  "schema_version": 1,
  "blocks": [
    {
      "type": "intro",
      "content": "If you are unsure whether you need deep cleaning or standard cleaning, you are not alone. The labels sound similar, but the scope, time on site, and outcomes are very different—especially in Cape Town homes where coastal dust, pet hair, and busy kitchens change what “clean” feels like."
    },
    {
      "type": "quick_answer",
      "content": "Standard cleaning maintains a home you already keep in good shape. Deep cleaning targets built-up grime, detail areas, and “first reset” situations—move-ins, post-build dust, or a seasonal refresh—before you return to a lighter maintenance cadence."
    },
    {
      "type": "key_takeaways",
      "items": [
        "Standard cleaning prioritises reachable surfaces, floors, kitchen and bathroom resets on a recurring schedule.",
        "Deep cleaning adds time-intensive detail work: inside appliances, grout lines, frames, edges, and neglected zones.",
        "Book deep cleaning when you are changing life stage (move, tenant change) or when maintenance cleans are not “holding” results."
      ]
    },
    {
      "type": "section",
      "title": "What is deep cleaning?",
      "content": "Deep cleaning is a high-scope session designed to reset a home that needs more than a weekly tidy. Think less “speed pass” and more “detail pass”: bathrooms get longer dwell time, kitchens get degreasing attention, and areas that rarely get touched in a standard visit are included when your checklist calls for them."
    },
    {
      "type": "section",
      "title": "What is standard cleaning?",
      "heading_level": 2,
      "content": "Standard cleaning is built for upkeep. It keeps high-traffic areas guest-ready and hygienic, and it works best when the home is already in a reasonable baseline condition. It is the right default for weekly, bi-weekly, or monthly maintenance after a deeper reset."
    },
    {
      "type": "comparison_table",
      "columns": ["", "Deep cleaning", "Standard cleaning"],
      "rows": [
        ["Primary goal", "Reset built-up grime and detail zones", "Maintain a healthy weekly baseline"],
        ["Typical cadence", "Occasional / milestone", "Weekly, bi-weekly, or monthly"],
        ["Best when", "Move, tenant change, long gap since pro clean", "Home already broadly under control"]
      ]
    },
    {
      "type": "comparison",
      "items": [
        {
          "label": "Deep cleaning",
          "value": "Longer visit, detail-first checklist, best for resets, move-related handovers, or homes that have gone longer without professional attention."
        },
        {
          "label": "Regular cleaning",
          "value": "Recurring maintenance, faster turnaround, optimised for consistent hygiene and presentation when the home is already broadly under control."
        }
      ]
    },
    {
      "type": "internal_links",
      "title": "Related guides",
      "links": [
        { "label": "Cleaning prices in Cape Town", "url": "/blog/cleaning-cost-cape-town" },
        { "label": "Move-out cleaning guide", "url": "/blog/move-out-cleaning-guide" },
        { "label": "Airbnb turnover checklist", "url": "/blog/airbnb-cleaning-checklist" }
      ]
    },
    {
      "type": "service_area",
      "locations": [
        "Sea Point",
        "Claremont",
        "Rondebosch",
        "Gardens",
        "Cape Town CBD",
        "Woodstock"
      ]
    },
    {
      "type": "bullets",
      "title": "Signs you probably need deep cleaning first",
      "items": [
        "You are moving in or out, or handing a property to a new tenant or owner.",
        "Kitchens and bathrooms still feel grimy after a standard session.",
        "You want a seasonal refresh before returning to a lighter schedule."
      ]
    },
    {
      "type": "faq",
      "items": [
        {
          "question": "Can I book standard cleaning if I have never had a deep clean?",
          "answer": "You can, but results depend on baseline condition. If grease, dust build-up, or bathroom scale is entrenched, a deep clean first makes recurring standard visits more effective and predictable."
        }
      ]
    },
    {
      "type": "cta",
      "title": "Book a cleaner",
      "description": "Instant quote from real availability—pick bedrooms, bathrooms, and add-ons in under a minute.",
      "button_text": "Get an instant quote",
      "link": "/booking",
      "variant": "primary"
    }
  ]
}
$json$::jsonb,
  'Deep vs Standard Cleaning in Cape Town | Shalean',
  'Deep cleaning vs standard cleaning in Cape Town: scope, timing, when to book each, and FAQs—plus instant booking when you are ready.',
  NULL,
  '/images/blog/deep-vs-standard-cleaning-cape-town.webp',
  'Living room after professional deep cleaning in Cape Town',
  '11111111-1111-1111-1111-111111111101',
  '22222222-2222-2222-2222-222222222201',
  8,
  now() - interval '2 days',
  false
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.blog_post_tags (post_id, tag_id)
VALUES
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301'),
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333302'),
  ('44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333303')
ON CONFLICT DO NOTHING;
