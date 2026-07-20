select 'accounting_sync' as probe, entity_type, sync_status, count(*)::int as n
from public.accounting_sync_records
group by entity_type, sync_status
order by entity_type, sync_status;
