-- Phase 1 revenue integrity: atomic promotion budget / usage increments.
-- Prevents concurrent redemptions from overshooting usage_limit_total or budget_zar.

create or replace function public.increment_promotion_redemption_counters(
  p_promotion_id uuid,
  p_discount_zar numeric,
  p_revenue_zar numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.promotions%rowtype;
begin
  if p_promotion_id is null then
    return jsonb_build_object('ok', false, 'reason', 'missing_promotion_id');
  end if;
  if p_discount_zar is null or p_discount_zar < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_discount');
  end if;

  update public.promotions
  set
    redemptions_count = redemptions_count + 1,
    budget_spent_zar = budget_spent_zar + p_discount_zar,
    revenue_generated_zar = revenue_generated_zar + greatest(coalesce(p_revenue_zar, 0), 0),
    updated_at = now()
  where id = p_promotion_id
    and (usage_limit_total is null or redemptions_count < usage_limit_total)
    and (budget_zar is null or budget_spent_zar + p_discount_zar <= budget_zar)
  returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'limit_or_budget_exceeded');
  end if;

  return jsonb_build_object(
    'ok', true,
    'redemptions_count', v_row.redemptions_count,
    'budget_spent_zar', v_row.budget_spent_zar,
    'revenue_generated_zar', v_row.revenue_generated_zar
  );
end;
$$;

revoke all on function public.increment_promotion_redemption_counters(uuid, numeric, numeric) from public;
grant execute on function public.increment_promotion_redemption_counters(uuid, numeric, numeric) to service_role;

comment on function public.increment_promotion_redemption_counters(uuid, numeric, numeric) is
  'Atomically increments promotion redemption counters with usage/budget guards. Phase 1 revenue integrity.';
