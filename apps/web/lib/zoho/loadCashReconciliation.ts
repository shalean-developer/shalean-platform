import 'server-only';
import { zohoBooksClient } from './zohoBooksClient';
import { CASH_ACCOUNT_MAPPING, summarizeCashReconciliation, syntheticCashReconciliation, type BankEvidence } from '@/lib/admin/expenses/cashReconciliation';

type Account = { account_id?: string; account_name?: string; account_type?: string; currency_code?: string;
  is_active?: boolean; is_feeds_active?: boolean; feeds_last_refresh_date?: string; bank_balance?: unknown; balance?: unknown };
function money(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) ? result : null;
}
export async function loadCashReconciliation(scenario = 'differences', now = new Date()) {
  const environment = process.env.SHALEAN_APP_ENV?.trim().toLowerCase();
  // No external finance requests or local writes in staging/development.
  if (environment === 'staging' || environment === 'development') return syntheticCashReconciliation(scenario, now);
  const empty = (): BankEvidence[] => CASH_ACCOUNT_MAPPING.map(a => ({ id: a.id, name: a.name, bankCents: null, bookCents: null, feedAt: null, identityVerified: false }));
  if (!['production', 'prod'].includes(environment ?? '') || process.env.ZOHO_ORGANIZATION_ID !== '927500285') {
    return summarizeCashReconciliation(empty(), CASH_ACCOUNT_MAPPING.map(a => a.id), now);
  }
  const rows = await Promise.all(CASH_ACCOUNT_MAPPING.map(async mapping => {
    try {
      const result = await zohoBooksClient.getWithTokenRecovery<{ bankaccount?: Account }>(`/bankaccounts/${mapping.id}`);
      const a = result.bankaccount;
      const identityVerified = a?.account_id === mapping.id && a.account_name === mapping.name && a.account_type === 'bank' &&
        a.currency_code === 'ZAR' && a.is_active === true;
      return { id: mapping.id, name: mapping.name, identityVerified,
        bankCents: identityVerified ? money(a?.bank_balance) : null,
        bookCents: identityVerified ? money(a?.balance) : null,
        feedAt: a?.is_feeds_active === true ? a.feeds_last_refresh_date ?? null : null };
    } catch { return empty().find(a => a.id === mapping.id)!; }
  }));
  const ledger = async (id: string, name: string) => {
    try {
      const r = await zohoBooksClient.getWithTokenRecovery<{ bankaccount?: Account }>(`/bankaccounts/${id}`);
      return r.bankaccount?.account_id === id && r.bankaccount.account_name === name &&
        r.bankaccount.currency_code === 'ZAR' && r.bankaccount.is_active === true ? money(r.bankaccount.balance) : null;
    } catch { return null; }
  };
  const [processorLedgerCents, undepositedLedgerCents] = await Promise.all([
    ledger('253016000000482521', 'Paystack Clearing'), ledger('253016000000000358', 'Undeposited Funds'),
  ]);
  return { ...summarizeCashReconciliation(rows, CASH_ACCOUNT_MAPPING.map(a => a.id), now), processorLedgerCents, undepositedLedgerCents };
}
