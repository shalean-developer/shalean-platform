import "server-only";

/**
 * Zoho Books bank account used for customer money paid on Shalean's website.
 *
 * Canonical production account:
 *   FNB - Primary Cheque Account
 *   Zoho account id: 253016000000097002
 *
 * An env override is supported for staging/test organisations, but production
 * defaults to the explicitly approved FNB account rather than Undeposited Funds.
 */
export function zohoWebsiteReceiptAccountId(): string {
  return (
    process.env.ZOHO_WEBSITE_RECEIPT_ACCOUNT_ID?.trim() ||
    "253016000000097002"
  );
}

/**
 * Receivable for verified Paystack payments before actual net FNB settlement.
 * A staging/test override must point to the corresponding Zoho test chart account.
 * Never use this account for a customer-paid direct bank EFT.
 */
export function zohoPaystackClearingAccountId(): string {
  const configured = process.env.ZOHO_PAYSTACK_CLEARING_ACCOUNT_ID?.trim();
  if (configured) return configured;

  // Never accidentally use the production Zoho account ID in a staging/test organisation.
  const appEnvironment = String(process.env.SHALEAN_APP_ENV ?? "").trim().toLowerCase();
  if (appEnvironment === "staging" || appEnvironment === "development" || appEnvironment === "test") {
    throw new Error("zoho_paystack_clearing_account_id_required_for_nonproduction");
  }
  return "253016000000482521";
}

