-- Expose team roster changes to Supabase Realtime (cleaner app subscribes for team job UX).

do $$
begin
  begin
    alter publication supabase_realtime add table public.team_members;
  exception
    when duplicate_object then null;
  end;
end
$$;
