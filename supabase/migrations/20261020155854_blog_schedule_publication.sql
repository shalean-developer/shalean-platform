-- Registered inactive: activate only after this exact app SHA passes staging.
select cron.unschedule(jobid) from cron.job where jobname='publish-blog-posts';
select cron.schedule('publish-blog-posts','*/5 * * * *', $$select public.invoke_nextjs_cron('/api/cron/publish-blog-posts');$$);
select cron.alter_job(jobid, active := false) from cron.job where jobname='publish-blog-posts';

create function public.blog_scheduler_is_enabled() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists (select 1 from cron.job where jobname='publish-blog-posts' and active)
    and exists (select 1 from public.cron_http_targets where singleton and app_base_url ~ '^https://' and nullif(btrim(cron_secret),'') is not null);
$$;
revoke all on function public.blog_scheduler_is_enabled() from public, anon, authenticated;
grant execute on function public.blog_scheduler_is_enabled() to service_role;
