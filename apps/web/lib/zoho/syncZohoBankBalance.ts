import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";
import { logSystemEvent } from "@/lib/logging/systemLog";

type ZohoBankAccount = {
  account_id?: string;
  account_name?: string;
  account_type?: string;
  currency_code?: string;
  is_active?: boolean;
  is_primary_account?: boolean;
  is_feeds_active?: boolean;
  bank_balance?: number;
  balance?: number;
  feeds_last_refresh_date?: string;
};

type ZohoBankListResponse = { bankaccounts?: ZohoBankAccount[] };

export type ZohoBankSyncResult = {
  ok: boolean;
  configured: boolean;
  finance_account_id?: string;
  zoho_account_id?: string;
  zoho_account_name?: string;
  balance_cents?: number;
  feed_last_refresh_date?: string | null;
  error?: string;
};

function isConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET &&
      process.env.ZOHO_REFRESH_TOKEN &&
      process.env.ZOHO_ORGANIZATION_ID,
  );
}

function selectZohoBankAccount(accounts: ZohoBankAccount[]): ZohoBankAccount {
  const activeBanks = accounts.filter(
    (a) => a.is_active !== false && String(a.account_type ?? "").toLowerCase() === "bank",
  );
  const explicitId = String(process.env.ZOHO_BANK_ACCOUNT_ID ?? "").trim();
  if (explicitId) {
    const match = activeBanks.find((a) => String(a.account_id ?? "") === explicitId);
    if (!match) throw new Error("Configured ZOHO_BANK_ACCOUNT_ID was not found in active Zoho bank accounts.");
    return match;
  }
  const zar = activeBanks.filter((a) => !a.currency_code || a.currency_code === "ZAR");
  const primary = zar.find((a) => a.is_primary_account === true);
  if (primary) return primary;
  if (zar.length === 1) return zar[0];
  if (activeBanks.length === 1) return activeBanks[0];
  throw new Error("Multiple Zoho bank accounts found. Set ZOHO_BANK_ACCOUNT_ID to the Shalean operating account.");
}

function feedIsFresh(feedDate: string | undefined, now: Date): boolean {
  if (!feedDate) return false;
  const ms = Date.parse(feedDate);
  return Number.isFinite(ms) && ms >= now.getTime() - 48 * 60 * 60 * 1000;
}

export async function syncZohoBankBalance(admin: SupabaseClient, actorUserId?: string | null): Promise<ZohoBankSyncResult> {
  if (!isConfigured()) return { ok: false, configured: false, error: "Zoho Books is not configured." };

  const { data: financeBanks, error: bankErr } = await admin
    .from("expense_accounts")
    .select("id, name, account_type, balance_cents")
    .eq("is_active", true)
    .eq("account_type", "bank");
  if (bankErr) return { ok: false, configured: true, error: bankErr.message };
  if (!financeBanks?.length) return { ok: false, configured: true, error: "No active Shalean bank finance account exists." };
  if (financeBanks.length > 1) return { ok: false, configured: true, error: "Multiple Shalean bank finance accounts exist; mapping is required before automatic sync." };

  try {
    const response = await zohoBooksClient.get<ZohoBankListResponse>("/bankaccounts?filter_by=Status.Active");
    const zoho = selectZohoBankAccount(response.bankaccounts ?? []);
    const feedDate = zoho.feeds_last_refresh_date ?? null;
    if (zoho.is_feeds_active !== true) {
      throw new Error("Zoho bank feed is not active. Manual bank balance remains available as fallback.");
    }
    if (!feedIsFresh(feedDate ?? undefined, new Date())) {
      throw new Error(`Zoho bank feed is stale${feedDate ? ` (last refresh ${feedDate})` : ""}. Refresh the feed in Zoho or enter the balance manually.`);
    }
    const bankBalance = Number(zoho.bank_balance);
    if (!Number.isFinite(bankBalance) || bankBalance < 0) throw new Error("Zoho returned an invalid bank balance.");
    const balanceCents = Math.round(bankBalance * 100);
    const finance = financeBanks[0];
    const nowIso = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("expense_accounts")
      .update({ balance_cents: balanceCents, updated_at: nowIso })
      .eq("id", finance.id);
    if (updateErr) throw new Error(updateErr.message);

    void logSystemEvent({
      level: "info",
      source: "zoho_bank_balance_sync",
      message: "Finance bank balance synced from Zoho bank feed",
      context: {
        finance_account_id: finance.id,
        previous_balance_cents: finance.balance_cents ?? 0,
        balance_cents: balanceCents,
        zoho_account_id: zoho.account_id ?? null,
        zoho_account_name: zoho.account_name ?? null,
        feed_last_refresh_date: feedDate,
        actor_user_id: actorUserId ?? null,
      },
    });

    return {
      ok: true,
      configured: true,
      finance_account_id: String(finance.id),
      zoho_account_id: zoho.account_id,
      zoho_account_name: zoho.account_name,
      balance_cents: balanceCents,
      feed_last_refresh_date: feedDate,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Zoho bank balance sync failed.";
    const scopeHint = /scope|permission|unauthor|57|401|403/i.test(raw)
      ? " Ensure the Zoho refresh token includes ZohoBooks.banking.READ."
      : "";
    return { ok: false, configured: true, error: `${raw}${scopeHint}` };
  }
}
