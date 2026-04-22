-- Enable Supabase Realtime publication for dispatch-critical tables.
-- Note: the physical offers table is `dispatch_offers` (compatible `job_offers` is a view).

do $$
begin
  begin
    alter publication supabase_realtime add table public.bookings;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.dispatch_offers;
  exception when duplicate_object then
    null;
  end;

  begin
    alter publication supabase_realtime add table public.cleaners;
  exception when duplicate_object then
    null;
  end;
end
$$;
