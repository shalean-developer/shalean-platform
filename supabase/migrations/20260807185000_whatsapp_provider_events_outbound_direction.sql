-- Allow admin-originated WhatsApp messages to be persisted alongside inbound and status events.
-- This keeps the Office conversation thread consistent with messages already sent through Meta.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname, oid
    FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_provider_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%direction%'
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_provider_events DROP CONSTRAINT %I', c.conname);
  END LOOP;

  ALTER TABLE public.whatsapp_provider_events
    ADD CONSTRAINT whatsapp_provider_events_direction_check
    CHECK (direction IN ('inbound', 'outbound', 'status'));
END $$;
