import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type ExpenseCategoryMapping = {
  platform_category: string;
  zoho_account_name: string;
};

export const DEFAULT_EXPENSE_CATEGORY_MAPPINGS: ExpenseCategoryMapping[] = [
  { platform_category: "Fuel", zoho_account_name: "Fuel Expense" },
  { platform_category: "Internet", zoho_account_name: "Internet Expense" },
  { platform_category: "Google Ads", zoho_account_name: "Advertising Expense" },
  { platform_category: "Facebook Ads", zoho_account_name: "Advertising Expense" },
  { platform_category: "Flyers", zoho_account_name: "Advertising Expense" },
  { platform_category: "Promotions", zoho_account_name: "Advertising Expense" },
  { platform_category: "Website Hosting", zoho_account_name: "Hosting Expense" },
  { platform_category: "Domain", zoho_account_name: "Hosting Expense" },
  { platform_category: "Paystack Fees", zoho_account_name: "Merchant Processing Fees" },
  { platform_category: "Bank Charges", zoho_account_name: "Bank Charges" },
  { platform_category: "Cleaning Supplies", zoho_account_name: "Cleaning Supplies" },
  { platform_category: "Uniforms", zoho_account_name: "Uniform Expense" },
];

export type ZohoIntegrationSettings = {
  id: string;
  expense_category_mappings: ExpenseCategoryMapping[];
  default_paystack_vendor_id: string | null;
  default_paystack_category_id: string | null;
  sync_frequency_minutes: number;
  max_retry_attempts: number;
  retry_base_delay_seconds: number;
  auto_sync_enabled: boolean;
  last_sync_at: string | null;
};

export function isZohoConfigured(): boolean {
  return Boolean(
    process.env.ZOHO_CLIENT_ID &&
      process.env.ZOHO_CLIENT_SECRET &&
      process.env.ZOHO_REFRESH_TOKEN &&
      process.env.ZOHO_ORGANIZATION_ID,
  );
}

export async function loadZohoIntegrationSettings(
  admin: SupabaseClient,
): Promise<ZohoIntegrationSettings> {
  const { data } = await admin
    .from("zoho_integration_settings")
    .select("*")
    .eq("singleton_key", "default")
    .maybeSingle();

  const mappings =
    Array.isArray(data?.expense_category_mappings) && data.expense_category_mappings.length > 0
      ? (data.expense_category_mappings as ExpenseCategoryMapping[])
      : DEFAULT_EXPENSE_CATEGORY_MAPPINGS;

  return {
    id: data?.id ?? "",
    expense_category_mappings: mappings,
    default_paystack_vendor_id: data?.default_paystack_vendor_id ?? null,
    default_paystack_category_id: data?.default_paystack_category_id ?? null,
    sync_frequency_minutes: data?.sync_frequency_minutes ?? 15,
    max_retry_attempts: data?.max_retry_attempts ?? 5,
    retry_base_delay_seconds: data?.retry_base_delay_seconds ?? 60,
    auto_sync_enabled: data?.auto_sync_enabled ?? true,
    last_sync_at: data?.last_sync_at ?? null,
  };
}

export function resolveZohoAccountNameForCategory(
  categoryName: string,
  mappings: ExpenseCategoryMapping[],
): string {
  const exact = mappings.find(
    (m) => m.platform_category.toLowerCase() === categoryName.toLowerCase(),
  );
  if (exact) return exact.zoho_account_name;
  return categoryName;
}

export async function ensurePaystackVendor(
  admin: SupabaseClient,
  settings: ZohoIntegrationSettings,
): Promise<string | null> {
  if (settings.default_paystack_vendor_id) {
    const { data } = await admin
      .from("expense_vendors")
      .select("id")
      .eq("id", settings.default_paystack_vendor_id)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: existing } = await admin
    .from("expense_vendors")
    .select("id")
    .ilike("name", "Paystack")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created } = await admin
    .from("expense_vendors")
    .insert({ name: "Paystack", notes: "Payment gateway — auto-created" })
    .select("id")
    .single();
  return created?.id ?? null;
}
