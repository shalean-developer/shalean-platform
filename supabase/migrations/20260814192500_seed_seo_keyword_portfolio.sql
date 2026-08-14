insert into public.seo_tracked_keywords
  (keyword,target_path,location_name,language_code,device,priority,active,service_name,intent,target_rank,owner_email,notes)
values
  ('cleaning services cape town','/','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Cleaning Services','transactional',3,'marketing@shalean.com','Canonical commercial owner: homepage'),
  ('house cleaning cape town','/services/standard-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Standard Cleaning','transactional',3,'marketing@shalean.com','Canonical owner for general residential/house cleaning intent'),
  ('standard cleaning cape town','/services/standard-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Standard Cleaning','transactional',3,'marketing@shalean.com','Primary standard-cleaning service keyword'),
  ('deep cleaning cape town','/services/deep-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Deep Cleaning','transactional',3,'marketing@shalean.com','Primary deep-cleaning service keyword'),
  ('move out cleaning cape town','/services/move-out-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Move Out Cleaning','transactional',3,'marketing@shalean.com','Primary move-out service keyword'),
  ('office cleaning cape town','/services/office-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Office Cleaning','transactional',3,'marketing@shalean.com','Primary office-cleaning service keyword'),
  ('airbnb cleaning cape town','/services/airbnb-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Airbnb Cleaning','transactional',3,'marketing@shalean.com','Primary Airbnb-cleaning service keyword'),
  ('maid services cape town','/maid-services-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p1',true,'Maid Services','commercial',5,'marketing@shalean.com','Canonical owner for maid-services searches'),
  ('cleaning prices cape town','/cleaning-prices-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p0',true,'Cleaning Prices','commercial',3,'marketing@shalean.com','Canonical pricing-intent page'),
  ('cleaning services sea point','/locations/sea-point-cleaning-services','Sea Point, Cape Town, South Africa','en','desktop','p1',true,'Local Cleaning','local',3,'marketing@shalean.com','Local canonical owner'),
  ('cleaning services plumstead','/locations/plumstead-cleaning-services','Plumstead, Cape Town, South Africa','en','desktop','p1',true,'Local Cleaning','local',3,'marketing@shalean.com','Local canonical owner'),
  ('cleaning services claremont','/locations/claremont-cleaning-services','Claremont, Cape Town, South Africa','en','desktop','p1',true,'Local Cleaning','local',3,'marketing@shalean.com','Local canonical owner'),
  ('cleaning services kenilworth','/locations/kenilworth-cleaning-services','Kenilworth, Cape Town, South Africa','en','desktop','p1',true,'Local Cleaning','local',3,'marketing@shalean.com','Local canonical owner'),
  ('cleaning services hout bay','/locations/hout-bay-cleaning-services','Hout Bay, Cape Town, South Africa','en','desktop','p1',true,'Local Cleaning','local',3,'marketing@shalean.com','Local canonical owner'),
  ('how much does cleaning cost cape town','/blog/how-much-does-cleaning-cost-cape-town-2026','Cape Town, Western Cape, South Africa','en','desktop','p1',true,'Cleaning Prices','informational',5,'marketing@shalean.com','Informational pricing owner; supports commercial pricing page'),
  ('airbnb cleaning cost cape town','/blog/airbnb-cleaning-cost-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p1',true,'Airbnb Cleaning','informational',5,'marketing@shalean.com','Informational Airbnb pricing owner'),
  ('same day cleaning cape town','/blog/same-day-cleaning-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p2',true,'Cleaning Services','informational',5,'marketing@shalean.com','Informational same-day cleaning owner'),
  ('airbnb cleaning checklist cape town','/blog/airbnb-cleaning-checklist-cape-town','Cape Town, Western Cape, South Africa','en','desktop','p2',true,'Airbnb Cleaning','informational',5,'marketing@shalean.com','Informational checklist owner')
on conflict (keyword,location_name,device) do update
set target_path = excluded.target_path,
    priority = excluded.priority,
    active = true,
    service_name = excluded.service_name,
    intent = excluded.intent,
    target_rank = excluded.target_rank,
    owner_email = excluded.owner_email,
    notes = excluded.notes,
    updated_at = now();
