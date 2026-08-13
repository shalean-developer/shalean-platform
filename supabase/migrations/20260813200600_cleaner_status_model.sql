alter table public.cleaners drop constraint if exists cleaners_status_check;
alter table public.cleaners add constraint cleaners_status_check check (status is null or status in ('available','busy','unavailable','day_off','sick','leave','training','suspended','inactive','offline'));
