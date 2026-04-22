-- Move scheduler ownership from Vercel to Supabase pg_cron + pg_net.
-- IMPORTANT: replace both placeholders before running in production:
--   https://YOUR_DOMAIN
--   YOUR_CRON_SECRET

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'booking-lifecycle-job' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'retry-failed-jobs' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'ai-optimize' limit 1;
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

select cron.schedule(
  'booking-lifecycle-job',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/booking-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    )
  );
  $$
);

select cron.schedule(
  'retry-failed-jobs',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/retry-failed-jobs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    )
  );
  $$
);

select cron.schedule(
  'ai-optimize',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_DOMAIN/api/cron/ai-optimize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    )
  );
  $$
);
