-- Passwords belong in Supabase Auth only; remove legacy bcrypt column from public.cleaners.
alter table public.cleaners drop column if exists password_hash;
