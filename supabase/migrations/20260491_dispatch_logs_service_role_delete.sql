-- Allow service-role API routes to truncate / clear dispatch diagnostics (e.g. admin cleanup).
grant delete on public.dispatch_logs to service_role;
