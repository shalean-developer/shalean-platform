// Isolated PostgreSQL behavior checks. Never connects to a remote database.
// AUDIT_PGLITE_MODULE=file:///absolute/path/to/pglite/dist/index.js node scripts/audits/paired-ledger-isolated.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.AUDIT_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let checks = 0;
try {
  await db.exec(`
    create role anon; create role authenticated;
    create table public.bookings (
      id uuid primary key, cleaner_id uuid, payout_owner_cleaner_id uuid,
      is_team_job boolean, status text, cleaner_line_earnings_finalized_at timestamptz,
      cleaner_earnings_total_cents integer, payout_status text, payout_run_id uuid,
      payout_paid_at timestamptz, payout_id uuid);
    create table public.cleaner_earnings (id uuid primary key, booking_id uuid unique,
      status text, cleaner_id uuid, amount_cents integer, disbursement_id uuid);
    create table public.booking_cleaners (booking_id uuid, cleaner_id uuid);
    create table public.cleaner_payouts (id uuid primary key, status text, payout_run_id uuid, paid_at timestamptz);
  `);
  await db.exec(await readFile(new URL('../../supabase/migrations/20261015151853_audit_03a02a_paired_ledger_prevention.sql', import.meta.url), 'utf8'));
  await db.exec(`create trigger sync after update of cleaner_earnings_total_cents, cleaner_id, payout_owner_cleaner_id
    on public.bookings for each row execute function public.sync_pending_cleaner_earnings_from_booking_update();`);
  async function scenario({ team = false, roster = [1], ledgerStatus = 'pending', disbursed = false, payout = '', child = '', bookingRun = false, bookingPaidAt = false, childRun = false, childPaidAt = false, missingChild = false, reject = false, paired = false }) {
    await db.exec('truncate bookings, cleaner_earnings, booking_cleaners, cleaner_payouts;');
    await db.query(`insert into bookings values ($1,$2,$2,$3,'completed',now(),26000,$4,$6,$7,$5)`,
      [id(100),id(1),team,payout,(child || missingChild) ? id(200) : null,bookingRun ? id(301) : null,bookingPaidAt ? '2026-10-01T10:00:00Z' : null]);
    await db.query('insert into cleaner_earnings values ($1,$2,$3,$4,26000,$5)',
      [id(101),id(100),ledgerStatus,id(1),disbursed ? id(300) : null]);
    for (const member of roster) await db.query('insert into booking_cleaners values ($1,$2)',[id(100),id(member)]);
    if (child) await db.query('insert into cleaner_payouts values ($1,$2,$3,$4)',[id(200),child,childRun ? id(302) : null,childPaidAt ? '2026-10-01T10:00:00Z' : null]);
    const update = () => db.query('update bookings set cleaner_earnings_total_cents=52000 where id=$1',[id(100)]);
    if (reject) await assert.rejects(update, error => error.code === '55000');
    else await update();
    const { rows } = await db.query('select amount_cents from cleaner_earnings');
    assert.equal(rows[0].amount_cents, reject || paired || team ? 26000 : 52000);
    checks++;
  }
  await scenario({ roster: [1,2], paired: true });
  await scenario({ roster: [1,2,2], paired: true });
  await scenario({ roster: [1] });
  await scenario({ roster: [1,1] });
  await scenario({ roster: [] });
  await scenario({ team: true, roster: [1,2] });
  for (const lock of [{ledgerStatus:'approved'},{ledgerStatus:'paid'},{disbursed:true},{payout:'paid'},{child:'paid'},{bookingRun:true},{bookingPaidAt:true},{child:'pending',childRun:true},{child:'pending',childPaidAt:true}]) {
    await scenario({ ...lock, reject: true });
    await scenario({ ...lock, team: true, roster: [1,2], reject: true });
    await scenario({ ...lock, roster: [1,2], reject: true });
  }
  await scenario({ roster: [1,2], missingChild: true, reject: true });
  const { rows } = await db.query(`select has_function_privilege('anon',
    'public.sync_pending_cleaner_earnings_from_booking_update()', 'EXECUTE') as allowed`);
  assert.equal(rows[0].allowed, false); checks++;
  console.log(`${checks} isolated paired-ledger PostgreSQL checks passed; no remote connection.`);
} finally { await db.close(); }
