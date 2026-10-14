-- Verified terminal outcomes are reconciliation, never authority for a new send.
begin;
create or replace function public.audit_03c02_has_verified_outcome(p_subject uuid, p_rail text, p_outcome text, p_code text default null)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select exists (
    select 1 from public.payout_transfers t
    join public.cleaner_payouts p on p.id=t.payout_id and p.cleaner_id=t.cleaner_id and p.total_amount_cents=t.amount_cents
    join public.payout_transfer_outbox o on o.transfer_row_id=t.id
      and o.cleaner_id=t.cleaner_id and o.amount_cents=t.amount_cents
      and o.reference=t.reference and o.rail='cleaner_payout' and o.subject_id=t.payout_id
    where p_rail='cleaner_payout' and t.payout_id=p_subject and t.status=p_outcome
      and nullif(t.transfer_code,'') is not null and t.webhook_processed_at is not null
      and (p_code is null or t.transfer_code=p_code)
  ) or exists (
    select 1 from public.earnings_disbursement_transfers t
    join public.cleaner_earnings_disbursements d on d.id=t.disbursement_id and d.cleaner_id=t.cleaner_id and d.total_amount_cents=t.amount_cents
    join public.payout_transfer_outbox o on o.transfer_row_id=t.id
      and o.cleaner_id=t.cleaner_id and o.amount_cents=t.amount_cents
      and o.reference=t.reference and o.rail='cleaner_earnings' and o.subject_id=t.disbursement_id
    where p_rail='cleaner_earnings' and t.disbursement_id=p_subject and t.status=p_outcome
      and nullif(t.transfer_code,'') is not null and t.webhook_processed_at is not null
      and (p_code is null or t.transfer_code=p_code)
  );
$$;
revoke all on function public.audit_03c02_has_verified_outcome(uuid,text,text,text) from public, anon, authenticated, service_role;

create or replace function public.audit_03c02_guard_payout_batch()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid;
begin
  if TG_OP <> 'INSERT' and OLD.period_start::date < date '2026-10-01' then
    if TG_OP = 'UPDATE' then
      -- Restrict reconciliation to the pre-existing intent; protect settled bank history.
      if OLD.status::text in ('approved','paid')
        and (OLD.payment_method is null or OLD.payment_method='paystack')
        and (to_jsonb(NEW) - array['status','paid_at','payment_status','payment_method','payment_reference','updated_at'])
          = (to_jsonb(OLD) - array['status','paid_at','payment_status','payment_method','payment_reference','updated_at'])
        and NEW.status::text='paid' and NEW.payment_status='success' and NEW.payment_method='paystack'
        and (OLD.paid_at is null or NEW.paid_at is not distinct from OLD.paid_at)
        and (NEW.payment_reference is not distinct from OLD.payment_reference
          or public.audit_03c02_has_verified_outcome(OLD.id,'cleaner_payout','success',NEW.payment_reference))
        and public.audit_03c02_has_verified_outcome(OLD.id,'cleaner_payout','success') then
        return NEW;
      end if;
      if OLD.status::text='approved' and OLD.payment_status is distinct from 'success'
        and NEW.payment_status in ('failed','partial_failed')
        and (to_jsonb(NEW) - array['payment_status','updated_at']) = (to_jsonb(OLD) - array['payment_status','updated_at'])
        and public.audit_03c02_has_verified_outcome(OLD.id,'cleaner_payout','failed') then
        return NEW;
      end if;
    end if;
    if TG_OP = 'DELETE' or NEW is distinct from OLD then
      raise exception 'historical_payout_deferred' using errcode = '23514';
    end if;
    return NEW;
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  if NEW.period_start is null or NEW.period_end is null
    or NEW.period_start::date < date '2026-10-01'
    or NEW.period_start::date <> date_trunc('month', NEW.period_start::date)::date
    or NEW.period_end::date <> (date_trunc('month', NEW.period_start::date) + interval '1 month - 1 day')::date
    or NEW.period_end::date >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date then
    raise exception 'closed_october_or_later_month_required' using errcode = '23514';
  end if;
  v_id := NEW.id;
  -- Lock all linked visits so a concurrent visit-date edit cannot race approval.
  perform b.id from public.bookings b where b.payout_id = v_id
    or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=b.id and r.cleaner_payout_id=v_id)
    or exists (select 1 from public.team_job_member_payouts t where t.booking_id=b.id and t.cleaner_payout_id=v_id)
    order by b.id for update;
  if exists (select 1 from public.bookings b where
    (b.payout_id=v_id
      or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=b.id and r.cleaner_payout_id=v_id)
      or exists (select 1 from public.team_job_member_payouts t where t.booking_id=b.id and t.cleaner_payout_id=v_id))
    and (b.date::date is null or b.date::date < NEW.period_start::date or b.date::date > NEW.period_end::date)) then
    raise exception 'historical_payout_item_deferred' using errcode = '23514';
  end if;
  return NEW;
end; $$;

create or replace function public.audit_03c02_guard_payout_item()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare v_date date; v_changed boolean; v_payout_id uuid;
begin
  if TG_OP='UPDATE' then
    if TG_TABLE_NAME='bookings' then
      if NEW.payout_status='paid'
        and (to_jsonb(NEW)-array['payout_status','payout_paid_at','updated_at']) = (to_jsonb(OLD)-array['payout_status','payout_paid_at','updated_at'])
        and (OLD.payout_paid_at is null or NEW.payout_paid_at is not distinct from OLD.payout_paid_at)
        and (public.audit_03c02_has_verified_outcome(OLD.payout_id,'cleaner_payout','success')
          or exists (select 1 from public.cleaner_earnings ce where ce.booking_id=OLD.id
            and ce.disbursement_id is not null and ce.status::text='paid'
            and public.audit_03c02_has_verified_outcome(ce.disbursement_id,'cleaner_earnings','success'))) then
        return NEW;
      end if;
    elsif TG_TABLE_NAME='cleaner_earnings' then
      -- A verified failed transfer releases only its original ledger claim.
      -- Historical visits remain excluded from every future claim/send path.
      if OLD.status::text='processing' and NEW.status::text='approved'
        and OLD.disbursement_id is not null and NEW.disbursement_id is null
        and (to_jsonb(NEW)-array['status','disbursement_id','updated_at']) = (to_jsonb(OLD)-array['status','disbursement_id','updated_at'])
        and public.audit_03c02_has_verified_outcome(OLD.disbursement_id,'cleaner_earnings','failed')
        and not public.audit_03c02_has_verified_outcome(OLD.disbursement_id,'cleaner_earnings','success') then
        return NEW;
      end if;
      if OLD.status::text in ('processing','paid') and NEW.status::text='paid'
        and OLD.disbursement_id is not null
        and (to_jsonb(NEW)-array['status','paid_at','updated_at']) = (to_jsonb(OLD)-array['status','paid_at','updated_at'])
        and (OLD.paid_at is null or NEW.paid_at is not distinct from OLD.paid_at)
        and public.audit_03c02_has_verified_outcome(OLD.disbursement_id,'cleaner_earnings','success') then
        return NEW;
      end if;
    else
      if OLD.cleaner_payout_id is not null and NEW.status::text='paid'
        and (to_jsonb(NEW)-array['status','updated_at']) = (to_jsonb(OLD)-array['status','updated_at'])
        and public.audit_03c02_has_verified_outcome(OLD.cleaner_payout_id,'cleaner_payout','success') then
        return NEW;
      end if;
    end if;
  end if;
  if TG_TABLE_NAME = 'bookings' then
    v_date := NEW.date;
    v_payout_id := NEW.payout_id;
    v_changed := case when TG_OP = 'INSERT' then NEW.payout_id is not null
      else NEW.payout_id is distinct from OLD.payout_id
      or NEW.payout_status is distinct from OLD.payout_status
      or NEW.payout_paid_at is distinct from OLD.payout_paid_at
      or NEW.payout_frozen_cents is distinct from OLD.payout_frozen_cents
      or NEW.cleaner_payout_cents is distinct from OLD.cleaner_payout_cents
      or NEW.cleaner_bonus_cents is distinct from OLD.cleaner_bonus_cents end;
    if TG_OP = 'UPDATE' and NEW.date is distinct from OLD.date
      and ((OLD.date::date < date '2026-10-01' and lower(coalesce(OLD.status::text,'')) = 'completed')
        or exists (select 1 from public.cleaner_earnings ce where ce.booking_id=NEW.id and (ce.disbursement_id is not null or ce.status::text in ('processing','paid')))
        or NEW.payout_id is not null or OLD.payout_id is not null
        or exists (select 1 from public.booking_roster_member_payouts r where r.booking_id=NEW.id and r.cleaner_payout_id is not null)
        or exists (select 1 from public.team_job_member_payouts t where t.booking_id=NEW.id and t.cleaner_payout_id is not null)) then
      raise exception 'linked_visit_cannot_cross_cutoff' using errcode = '23514';
    end if;
  else
    select b.date::date into v_date from public.bookings b where b.id=NEW.booking_id for update;
    if TG_TABLE_NAME = 'cleaner_earnings' then
      v_changed := case when TG_OP = 'INSERT' then NEW.disbursement_id is not null or NEW.status::text in ('processing','paid')
        else NEW.disbursement_id is distinct from OLD.disbursement_id
          or NEW.status is distinct from OLD.status
          or NEW.amount_cents is distinct from OLD.amount_cents end;
    else
      v_payout_id := NEW.cleaner_payout_id;
      v_changed := case when TG_OP = 'INSERT' then NEW.cleaner_payout_id is not null or NEW.status::text = 'paid'
        else NEW.cleaner_payout_id is distinct from OLD.cleaner_payout_id
          or NEW.status is distinct from OLD.status
          or NEW.payout_cents is distinct from OLD.payout_cents end;
      if TG_TABLE_NAME = 'booking_roster_member_payouts' and TG_OP = 'UPDATE' then
        v_changed := v_changed or NEW.bonus_cents is distinct from OLD.bonus_cents;
      end if;
    end if;
  end if;
  if v_changed and v_payout_id is not null and not exists (
    select 1 from public.cleaner_payouts p where p.id=v_payout_id
      and p.period_start::date >= date '2026-10-01'
      and v_date between p.period_start::date and p.period_end::date
      and p.period_end::date < date_trunc('month', timezone('Africa/Johannesburg', now()))::date
  ) then
    raise exception 'historical_or_open_payout_link_forbidden' using errcode = '23514';
  end if;
  if v_changed and (v_date is null or v_date < date '2026-10-01') then
    raise exception 'historical_payout_item_deferred' using errcode = '23514';
  end if;
  if v_changed and TG_TABLE_NAME <> 'bookings'
    and NEW.status::text in ('processing','paid','batched')
    and v_date >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date then
    raise exception 'earning_month_still_open' using errcode = '23514';
  end if;
  return NEW;
end; $$;

create or replace function public.audit_03c02_guard_payout_run()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if NEW is not distinct from OLD then return NEW; end if;
  if OLD.status::text='processing' and NEW.status::text='paid'
    and (to_jsonb(NEW)-array['status','paid_at','updated_at'])=(to_jsonb(OLD)-array['status','paid_at','updated_at'])
    and exists (select 1 from public.cleaner_payouts p where p.payout_run_id=OLD.id)
    and not exists (select 1 from public.cleaner_payouts p where p.payout_run_id=OLD.id and p.status::text <> 'paid')
    and not exists (select 1 from public.cleaner_payouts p where p.payout_run_id=OLD.id
      and p.period_start::date < date '2026-10-01'
      and not public.audit_03c02_has_verified_outcome(p.id,'cleaner_payout','success')) then
    return NEW;
  end if;
  if exists (select 1 from public.cleaner_payouts p where p.payout_run_id=NEW.id
    and (p.period_start is null or p.period_start::date < date '2026-10-01')) then
    raise exception 'historical_payout_run_deferred' using errcode = '23514';
  end if;
  if NEW.status::text in ('approved','processing','paid') and (
    not exists (select 1 from public.cleaner_payouts p where p.payout_run_id=NEW.id)
    or exists (select 1 from public.cleaner_payouts p where p.payout_run_id=NEW.id
      and (p.period_start::date <> date_trunc('month', p.period_start::date)::date
        or p.period_end is null
        or p.period_end::date <> (date_trunc('month', p.period_start::date) + interval '1 month - 1 day')::date
        or p.period_end::date >= date_trunc('month', timezone('Africa/Johannesburg', now()))::date))
  ) then
    raise exception 'closed_october_or_later_run_required' using errcode = '23514';
  end if;
  return NEW;
end; $$;
commit;
