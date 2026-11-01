import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { zohoBooksClient } from '@/lib/zoho/zohoBooksClient';
import { acquireCronLock, releaseCronLock } from '@/lib/cron/cronLock';
import { expectedSupabaseRefForDeployment, resolveDeploymentEnvironment, SHALEAN_SUPABASE_REFS, supabaseRefFromUrl } from '@/lib/env/deploymentEnvironment';
import { projectZohoExpenses, readCompleteZohoPages, validateExpensePeriod, type ProviderRow } from './expenseMirror';

export function expenseMirrorOrganization(env: Record<string, string | undefined> = process.env) {
  const deployment = resolveDeploymentEnvironment(env);
  const ref = supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const expected = expectedSupabaseRefForDeployment(deployment, env);
  const org = env.ZOHO_ORGANIZATION_ID?.trim();
  if (!ref || !expected || ref !== expected) throw new Error('Expense sync environment identity is not verified.');
  if (deployment === 'production') {
    if (org !== '927500285') throw new Error('Expense sync requires Shalean Zoho organisation 927500285.');
  } else if (ref === SHALEAN_SUPABASE_REFS.production || !org || org === '927500285' || env.ZOHO_EXPENSE_IMPORT_TEST_ORG_ID !== org) {
    throw new Error('Staging expense sync requires a separate explicitly configured Zoho test organisation.');
  }
  return org!;
}
export async function syncExpenseMirror(admin: SupabaseClient, from: string, to: string) {
  validateExpensePeriod(from, to);
  const org = expenseMirrorOrganization();
  const lock = await acquireCronLock(admin, { jobName: `zoho-expenses:${org}:${from}:${to}`, leaseSeconds: 600 });
  if (!lock.ok || lock.degraded) throw new Error('Expense sync is busy or its lock is unavailable. Retry shortly.');
  const key = { organization_id: org, date_from: from, date_to: to };
  const started = Date.now();
  try {
    // Retain the previous complete snapshot if any request or validation fails.
    const { error: startError } = await admin.from('zoho_expense_period_mirror').upsert({ ...key,
      last_attempt_at: new Date().toISOString(), last_error: null }, { onConflict: 'organization_id,date_from,date_to', ignoreDuplicates: true });
    if (startError) throw startError;
    const { error: attemptError } = await admin.from('zoho_expense_period_mirror').update({ last_attempt_at: new Date().toISOString(), last_error: null }).match(key);
    if (attemptError) throw attemptError;
    const get = async (path: string) => {
      if (Date.now() - started > 180000) throw new Error('Sync time limit reached. Choose a smaller date range.');
      return zohoBooksClient.getWithTokenRecovery<ProviderRow>(path);
    };
    const accounts = await readCompleteZohoPages('chartofaccounts', {}, get);
    const expenses = await readCompleteZohoPages('expenses', { date_start: from, date_end: to, filter_by: 'Status.All', sort_column: 'created_time', sort_order: 'A' }, get);
    const detailed: ProviderRow[] = [];
    for (const expense of expenses) {
      if (typeof expense.is_personal === 'boolean') { detailed.push(expense); continue; }
      // Zoho's list shape may omit personal status. Verify it before counting cash.
      const response = await get(`/expenses/${String(expense.expense_id)}`);
      const detail = response.expense;
      if (!detail || typeof detail !== 'object' || Array.isArray(detail) ||
          String((detail as ProviderRow).expense_id) !== String(expense.expense_id))
        throw new Error('Invalid Zoho expense detail. Retry the sync.');
      detailed.push({ ...expense, ...(detail as ProviderRow) });
    }
    const records = projectZohoExpenses(detailed, accounts, from, to);
    const { error } = await admin.from('zoho_expense_period_mirror').update({ records,
      last_success_at: new Date().toISOString(), last_error: null }).match(key);
    if (error) throw error;
    return { count: records.length, operating_count: records.filter(r => r.operating).length };
  } catch (error) {
    // Do not persist OAuth responses, URLs, payloads, or financial identifiers in error text.
    const message = error instanceof Error && /Choose a smaller|pagination|invalid expense|outside the requested|repeated Zoho|Missing Zoho/i.test(error.message)
      ? error.message : 'Could not refresh Zoho expenses. Check connection, expenses.READ and accountants.READ permissions, then retry. The last complete snapshot is retained.';
    await admin.from('zoho_expense_period_mirror').update({ last_error: message }).match(key);
    throw new Error(message);
  } finally { await releaseCronLock(admin, lock.jobName, lock.holderId); }
}
