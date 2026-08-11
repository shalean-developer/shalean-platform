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
