-- Roster members should count as active from team creation (not the exact add timestamp),
-- so admins can assign teams to bookings on dates before members were added in the UI.

update public.team_members tm
set active_from = t.created_at
from public.teams t
where tm.team_id = t.id
  and (tm.active_from is null or tm.active_from > t.created_at);
