-- Blog publication has its own Vault configuration. The shared cron target and
-- unrelated jobs retain their existing configuration and activation state.
do $$
begin
  if (select count(*) from cron.job
      where jobname = 'publish-blog-posts'
        and database = current_database() and username = current_user) <> 1 then
    raise exception 'Expected exactly one owned blog publication job';
  end if;
end $$;

create function blog_security.invoke_publish_blog_posts()
returns bigint language plpgsql security invoker set search_path = pg_catalog as $$
declare
  v_base_url text;
  v_secret text;
begin
  select rtrim(btrim(decrypted_secret), '/') into v_base_url
    from vault.decrypted_secrets where name = 'blog_scheduler_base_url';
  select btrim(decrypted_secret) into v_secret
    from vault.decrypted_secrets where name = 'blog_scheduler_cron_secret';

  if v_base_url is null or v_base_url not in (
    'https://shalean.co.za', 'https://pricing-test.shalean.co.za'
  ) or nullif(v_secret, '') is null or v_secret ~ E'[\\r\\n]' then
    raise exception 'Blog scheduler protected configuration is missing or invalid';
  end if;

  return net.http_post(
    url := v_base_url || '/api/cron/publish-blog-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function blog_security.invoke_publish_blog_posts()
  from public, anon, authenticated, service_role;
comment on function blog_security.invoke_publish_blog_posts() is
  'Owned pg_cron job only; fixed blog endpoint, encrypted Vault credentials, request ID response.';

select cron.alter_job(jobid,
  command := 'select blog_security.invoke_publish_blog_posts();', active := false)
from cron.job where jobname = 'publish-blog-posts'
  and database = current_database() and username = current_user;

create or replace function public.blog_scheduler_is_enabled() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from cron.job where jobname = 'publish-blog-posts' and active
      and database = current_database() and username = current_user
      and command = 'select blog_security.invoke_publish_blog_posts();'
  ) and exists (
    select 1 from vault.decrypted_secrets where name = 'blog_scheduler_base_url'
      and rtrim(btrim(decrypted_secret), '/') in (
        'https://shalean.co.za', 'https://pricing-test.shalean.co.za'
      )
  ) and exists (
    select 1 from vault.decrypted_secrets where name = 'blog_scheduler_cron_secret'
      and nullif(btrim(decrypted_secret), '') is not null
      and decrypted_secret !~ E'[\\r\\n]'
  );
$$;
revoke all on function public.blog_scheduler_is_enabled() from public, anon, authenticated;
grant execute on function public.blog_scheduler_is_enabled() to service_role;
