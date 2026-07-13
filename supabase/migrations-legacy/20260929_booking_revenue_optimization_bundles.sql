-- Phase 12 revenue optimization: make handover-focused extras available to heavy jobs
-- and add a discounted move-out package for basket-size testing.

update public.pricing_extras
set service_type = 'all',
    description = case slug
      when 'inside-oven' then 'Degrease racks and glass — high-impact for handovers and deep kitchen resets.'
      when 'inside-cabinets' then 'Wipe shelves and doors — useful before guests, moves, and inspections.'
      when 'interior-walls' then 'Spot-clean visible marks and scuffs in main rooms and passages.'
      when 'inside-fridge' then 'Empty shelves cleaned and sanitised — popular for turnovers and move-outs.'
      else description
    end,
    updated_at = now()
where slug in ('inside-oven', 'inside-cabinets', 'interior-walls', 'inside-fridge');

insert into public.pricing_extra_bundles (
  bundle_id,
  label,
  blurb,
  bundle_price,
  items,
  service_scope,
  is_active,
  sort_order
)
values (
  'move_out_package',
  'Move-out package',
  'Oven + cabinets + walls — save about 10% for inspection-ready handovers.',
  141,
  array['inside-oven', 'inside-cabinets', 'interior-walls']::text[],
  'heavy',
  true,
  25
)
on conflict (bundle_id) do update
set label = excluded.label,
    blurb = excluded.blurb,
    bundle_price = excluded.bundle_price,
    items = excluded.items,
    service_scope = excluded.service_scope,
    is_active = true,
    sort_order = excluded.sort_order,
    updated_at = now();
