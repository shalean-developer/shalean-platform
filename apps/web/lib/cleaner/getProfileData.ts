import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import type { CleanerMeRow } from "@/lib/cleaner/cleanerMobileProfileFromMe";
import type { CleanerRosterSnapshot } from "@/lib/cleaner/cleanerProfileTypes";
import { bankDisplayNameFromCode } from "@/lib/cleaner/southAfricanPaystackBanks";

type PaymentDetailsJson = {
  details?: {
    bankCode?: string | null;
    accountNumberMasked?: string | null;
    hasRecipientCode?: boolean;
  } | null;
};

export type CleanerProfileClientData = {
  cleaner: CleanerMeRow | null;
  roster: CleanerRosterSnapshot | null;
  /** True when Paystack recipient exists on file. */
  hasPayoutRecipient: boolean;
  /** One-line bank summary for cards, or null. */
  payoutSummaryLine: string | null;
};

/**
 * Loads profile shell data in the browser (Bearer session).
 * Not a Supabase server loader — matches how the rest of the cleaner app authenticates.
 */
export async function getProfileData(): Promise<
  { ok: true; data: CleanerProfileClientData } | { ok: false; error: string }
> {
  const headers = await getCleanerAuthHeaders();
  if (!headers) return { ok: false, error: "Not signed in." };

  try {
    const [meRes, rosterRes, payRes] = await Promise.all([
      cleanerAuthenticatedFetch("/api/cleaner/me", { headers }),
      cleanerAuthenticatedFetch("/api/cleaner/roster", { headers }),
      cleanerAuthenticatedFetch("/api/cleaner/payment-details", { headers }),
    ]);

    const meJson = (await meRes.json().catch(() => ({}))) as {
      cleaner?: CleanerMeRow | null;
      error?: string;
    };
    if (!meRes.ok) {
      return { ok: false, error: meJson.error ?? "Could not load profile." };
    }

    let roster: CleanerRosterSnapshot | null = null;
    if (rosterRes.ok) {
      roster = (await rosterRes.json().catch(() => null)) as CleanerRosterSnapshot | null;
    }

    let hasPayoutRecipient = false;
    let payoutSummaryLine: string | null = null;
    if (payRes.ok) {
      const payJson = (await payRes.json().catch(() => ({}))) as PaymentDetailsJson;
      const d = payJson.details;
      hasPayoutRecipient = Boolean(d?.hasRecipientCode);
      if (d?.accountNumberMasked || d?.bankCode) {
        const bank = bankDisplayNameFromCode(d?.bankCode ?? null);
        const mask = d?.accountNumberMasked?.trim() || "";
        payoutSummaryLine = mask ? `${bank} · ${mask}` : bank;
      }
    }

    return {
      ok: true,
      data: {
        cleaner: meJson.cleaner ?? null,
        roster,
        hasPayoutRecipient,
        payoutSummaryLine,
      },
    };
  } catch {
    return { ok: false, error: "Network error." };
  }
}
