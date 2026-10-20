-- Source-specific aggregate of genuine completed-booking ratings, independent of testimonial selection.
-- Only anonymous numeric totals leave the database; written-review and detail permissions are unchanged.
create function public.booking_review_rating_summary()
returns table(avg_rating numeric, review_count bigint)
language sql stable security invoker set search_path = '' as $function$
  select round(avg(r.rating::numeric),1),count(*)
  from public.reviews r join public.bookings b on b.id=r.booking_id
  where r.rating between 1 and 5 and r.is_hidden=false
    and (b.status='completed' or b.completed_at is not null)
    and coalesce(b.status,'') not in ('cancelled','failed','payment_expired','pending_payment') and b.is_test=false
    and coalesce(b.booking_reference,'') not ilike 'DEVSEED%'
    and coalesce(b.customer_email,'') not ilike '%@example.com'
    and coalesce(b.customer_email,'') not ilike '%@example.invalid';
$function$;
revoke all on function public.booking_review_rating_summary() from public,anon,authenticated;
grant execute on function public.booking_review_rating_summary() to service_role;
