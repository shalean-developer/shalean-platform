-- Service-specific add-ons for office, carpet, and airbnb booking flows.

INSERT INTO public.pricing_extras (slug, name, price, service_type, is_popular, is_active, sort_order, description)
VALUES
  (
    'office-kitchen',
    'Kitchen / break room',
    200,
    'light',
    false,
    true,
    170,
    'Deep clean office kitchen appliances and surfaces.'
  ),
  (
    'office-sanitisation',
    'Sanitisation service',
    180,
    'light',
    false,
    true,
    175,
    'Full surface sanitisation spray for desks and high-touch areas.'
  ),
  (
    'stain-treatment',
    'Stain treatment',
    200,
    'heavy',
    true,
    true,
    165,
    'Professional stain removal for carpets and rugs.'
  ),
  (
    'pet-odour-treatment',
    'Pet odour treatment',
    180,
    'heavy',
    false,
    true,
    166,
    'Enzyme-based odour neutraliser for pet areas.'
  ),
  (
    'fabric-protector',
    'Fabric protector',
    220,
    'heavy',
    false,
    true,
    167,
    'Scotchgard-style protection spray for carpets and upholstery.'
  ),
  (
    'welcome-setup',
    'Welcome setup',
    150,
    'light',
    false,
    true,
    171,
    'Arrange towels, toiletries, and guest staging.'
  ),
  (
    'inspection-photos',
    'Post-clean photos',
    100,
    'light',
    false,
    true,
    172,
    'Timestamped photos for your host records.'
  )
ON CONFLICT (slug) DO NOTHING;
