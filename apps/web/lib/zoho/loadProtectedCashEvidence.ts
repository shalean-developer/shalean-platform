import 'server-only';
import { zohoBooksClient } from './zohoBooksClient';
import { emptyProtectedCashEvidence, syntheticProtectedCashEvidence } from '@/lib/admin/expenses/protectedCashEvidence';

/** Exact approved liability-account identities; no names/amounts used for mapping. */
export async function loadProtectedCashEvidence(now = new Date()) {
  const env = process.env.SHALEAN_APP_ENV?.trim().toLowerCase();
  if (env === 'staging' || env === 'development') return syntheticProtectedCashEvidence(now);
  const result = emptyProtectedCashEvidence();
  if (!['production', 'prod'].includes(env ?? '') || process.env.ZOHO_ORGANIZATION_ID !== '927500285') return result;
  result.accounts = await Promise.all(result.accounts.map(async account => {
    try {
      // GET account returns fields at the response root, not a bankaccount wrapper.
      const raw = await zohoBooksClient.getWithTokenRecovery(`/chartofaccounts/${account.id}`) as Record<string, unknown>;
      if (raw.code !== 0 || raw.account_id !== account.id || raw.account_type !== 'other_current_liability' || raw.currency_code !== 'ZAR' || raw.is_active !== true) return account;
      const value = raw.closing_balance;
      if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) return account;
      // Preserve the API sign. Never abs()/clamp a debit balance into a liability.
      return { ...account, balanceCents: Math.round(value * 100), readAt: new Date().toISOString() };
    } catch { return account; }
  }));
  // Book account totals alone cannot prove all-time cleaner payables, ownership,
  // customer allocation, restrictions or overlap. No additive protected total.
  return result;
}
