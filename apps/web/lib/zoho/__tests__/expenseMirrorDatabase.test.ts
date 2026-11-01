import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { it, expect } from 'vitest';
it('isolated SQL: deny browser roles and atomically retain/replace snapshots without duplicates', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
    await db.exec(readFileSync(resolve(process.cwd(), '../../supabase/migrations/20261101095639_zoho_expense_period_mirror.sql'), 'utf8'));
    await db.exec(`set role service_role; insert into zoho_expense_period_mirror(organization_id,date_from,date_to,records,last_success_at) values ('123','2026-10-01','2026-10-31','[{"id":"101","amount_cents":123}]',now());`);
    await db.exec(`insert into zoho_expense_period_mirror(organization_id,date_from,date_to,last_error) values ('123','2026-10-01','2026-10-31',null) on conflict do nothing; update zoho_expense_period_mirror set last_error='provider failed';`);
    expect((await db.query<{records: unknown[]}>('select records from zoho_expense_period_mirror')).rows[0].records).toHaveLength(1);
    await db.exec(`begin; update zoho_expense_period_mirror set records='[]'; rollback;`);
    expect((await db.query<{records: unknown[]}>('select records from zoho_expense_period_mirror')).rows[0].records).toHaveLength(1);
    for (let i=0;i<2;i++) await db.exec(`update zoho_expense_period_mirror set records='[{"id":"101","amount_cents":456}]',last_error=null,last_success_at=now();`);
    const result = await db.query<{records: {amount_cents:number}[]}>('select records from zoho_expense_period_mirror');
    expect(result.rows).toHaveLength(1); expect(result.rows[0].records).toEqual([{id:'101',amount_cents:456}]);
    await db.exec('reset role; set role anon;'); await expect(db.query('select * from zoho_expense_period_mirror')).rejects.toThrow(/permission denied/);
    await db.exec('reset role; set role authenticated;'); await expect(db.query('select * from zoho_expense_period_mirror')).rejects.toThrow(/permission denied/);
  } finally { await db.close(); }
});
