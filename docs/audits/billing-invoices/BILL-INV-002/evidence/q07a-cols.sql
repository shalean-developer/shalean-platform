select column_name from information_schema.columns
where table_schema='public' and table_name='cron_http_targets'
order by ordinal_position;
