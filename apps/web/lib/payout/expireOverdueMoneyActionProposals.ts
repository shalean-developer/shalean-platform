import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpireOverdueMoneyActionProposalsResult =
  | { ok: true; expired_count: number; expired_ids: string[] }
  | { ok: false; error: string };

/**
 * Idempotently persist pending→expired for overdue proposals via SECURITY DEFINER RPC.
 * Only touches rows where status='pending' AND expires_at <= now().
 */
export async function expireOverdueMoneyActionProposals(
  admin: SupabaseClient,
  options?: { limit?: number },
): Promise<ExpireOverdueMoneyActionProposalsResult> {
  const { data, error } = await admin.rpc("expire_overdue_admin_money_action_proposals", {
    p_limit: options?.limit ?? 500,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = (data ?? {}) as {
    ok?: boolean;
    expired_count?: number;
    expired_ids?: string[] | null;
  };

  return {
    ok: true,
    expired_count: Number(raw.expired_count ?? 0) || 0,
    expired_ids: Array.isArray(raw.expired_ids) ? raw.expired_ids.map(String) : [],
  };
}
