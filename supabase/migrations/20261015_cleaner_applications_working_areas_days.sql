alter table public.cleaner_applications
  add column if not exists working_areas jsonb not null default '[]'::jsonb,
  add column if not exists working_days jsonb not null default '[]'::jsonb;

comment on column public.cleaner_applications.working_areas is
  'Suburb/location names the applicant is willing to work in (json array of strings).';

comment on column public.cleaner_applications.working_days is
  'Weekdays the applicant can work: mon, tue, wed, thu, fri, sat, sun (json array).';
