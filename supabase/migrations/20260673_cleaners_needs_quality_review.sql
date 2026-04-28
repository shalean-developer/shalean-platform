-- Marketplace protection: flag low-rated cleaners with enough signal for ops + dispatch scoring.

alter table public.cleaners
  add column if not exists needs_quality_review boolean not null default false;

comment on column public.cleaners.needs_quality_review is
  'When true (rating < 3.5 with review_count >= 5), dispatch score is further reduced; clear when metrics recover.';

create index if not exists cleaners_needs_quality_review_idx
  on public.cleaners (needs_quality_review)
  where needs_quality_review = true;
