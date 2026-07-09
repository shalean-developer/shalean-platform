import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpenseListItem, ExpenseSummary } from "@/lib/admin/expenses/types";

export type ExpenseListFilters = {
  from?: string;
  to?: string;
  category_id?: string;
  branch_id?: string;
  status?: string;
  payment_method?: string;
  vendor_id?: string;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
};

function johannesburgTodayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function johannesburgMonthStartYmd(): string {
  const today = johannesburgTodayYmd();
  return `${today.slice(0, 7)}-01`;
}

type ExpenseDbRow = {
  id: string;
  expense_date: string;
  category_id: string;
  description: string;
  amount_cents: number;
  payment_method: string;
  paid_from_account_id: string | null;
  vendor_id: string | null;
  branch_id: string;
  booking_id: string | null;
  receipt_path: string | null;
  receipt_mime: string | null;
  notes: string | null;
  status: string;
  rejection_reason: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  external_accounting_id: string | null;
  sync_status: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  expense_categories: { name: string; group_name: string } | null;
  expense_vendors: { name: string } | null;
  cities: { name: string } | null;
  expense_accounts: { name: string } | null;
  bookings: { id: string } | null;
};

function mapExpenseRow(row: ExpenseDbRow, emailMap: Record<string, string>): ExpenseListItem {
  return {
    id: row.id,
    expense_date: row.expense_date,
    category_id: row.category_id,
    description: row.description,
    amount_cents: row.amount_cents,
    payment_method: row.payment_method as ExpenseListItem["payment_method"],
    paid_from_account_id: row.paid_from_account_id,
    vendor_id: row.vendor_id,
    branch_id: row.branch_id,
    booking_id: row.booking_id,
    receipt_path: row.receipt_path,
    receipt_mime: row.receipt_mime,
    notes: row.notes,
    status: row.status as ExpenseListItem["status"],
    rejection_reason: row.rejection_reason,
    created_by: row.created_by,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    external_accounting_id: row.external_accounting_id,
    sync_status: row.sync_status as ExpenseListItem["sync_status"],
    last_synced_at: row.last_synced_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    category_name: row.expense_categories?.name ?? "",
    category_group: row.expense_categories?.group_name ?? "",
    vendor_name: row.expense_vendors?.name ?? null,
    branch_name: row.cities?.name ?? "",
    paid_from_account_name: row.expense_accounts?.name ?? null,
    created_by_email: row.created_by ? emailMap[row.created_by] ?? null : null,
    approved_by_email: row.approved_by ? emailMap[row.approved_by] ?? null : null,
    booking_ref: row.bookings?.id ? row.bookings.id.slice(0, 8) : null,
  };
}

export async function loadExpenseList(
  admin: SupabaseClient,
  filters: ExpenseListFilters,
): Promise<{ items: ExpenseListItem[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.page_size ?? 25));
  const sortBy = filters.sort_by ?? "expense_date";
  const sortDir = filters.sort_dir === "asc";

  let query = admin
    .from("expenses")
    .select(
      `
      *,
      expense_categories ( name, group_name ),
      expense_vendors ( name ),
      cities ( name ),
      expense_accounts ( name ),
      bookings ( id )
    `,
      { count: "exact" },
    );

  if (filters.from) query = query.gte("expense_date", filters.from);
  if (filters.to) query = query.lte("expense_date", filters.to);
  if (filters.category_id) query = query.eq("category_id", filters.category_id);
  if (filters.branch_id) query = query.eq("branch_id", filters.branch_id);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.payment_method) query = query.eq("payment_method", filters.payment_method);
  if (filters.vendor_id) query = query.eq("vendor_id", filters.vendor_id);
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    query = query.or(`description.ilike.${q},notes.ilike.${q}`);
  }

  const ascending = sortDir;
  if (sortBy === "amount_cents") query = query.order("amount_cents", { ascending });
  else if (sortBy === "status") query = query.order("status", { ascending });
  else if (sortBy === "category") query = query.order("category_id", { ascending });
  else query = query.order("expense_date", { ascending: !ascending }).order("created_at", { ascending: !ascending });

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ExpenseDbRow[];
  const userIds = [
    ...new Set(
      rows.flatMap((r) => [r.created_by, r.approved_by].filter(Boolean) as string[]),
    ),
  ];
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await admin.from("user_profiles").select("id, email").in("id", userIds);
    for (const p of profiles ?? []) {
      if (p.id && p.email) emailMap[p.id] = p.email;
    }
  }

  return {
    items: rows.map((r) => mapExpenseRow(r, emailMap)),
    total: count ?? 0,
  };
}

export async function loadExpenseSummary(admin: SupabaseClient): Promise<ExpenseSummary> {
  const today = johannesburgTodayYmd();
  const monthStart = johannesburgMonthStartYmd();

  const { data: allApproved, error: approvedErr } = await admin
    .from("expenses")
    .select("amount_cents, expense_date, status")
    .eq("status", "approved");
  if (approvedErr) throw new Error(approvedErr.message);

  const { data: pending, error: pendingErr } = await admin
    .from("expenses")
    .select("amount_cents")
    .eq("status", "pending");
  if (pendingErr) throw new Error(pendingErr.message);

  const approvedRows = allApproved ?? [];
  const totalExpenses = approvedRows.reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  const todayExpenses = approvedRows
    .filter((r) => r.expense_date === today)
    .reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  const monthExpenses = approvedRows
    .filter((r) => r.expense_date >= monthStart)
    .reduce((s, r) => s + (r.amount_cents ?? 0), 0);

  const pendingRows = pending ?? [];
  const pendingCents = pendingRows.reduce((s, r) => s + (r.amount_cents ?? 0), 0);

  const uniqueDays = new Set(approvedRows.map((r) => r.expense_date)).size;
  const avgDaily = uniqueDays > 0 ? Math.round(totalExpenses / uniqueDays) : 0;

  return {
    total_expenses_cents: totalExpenses,
    today_expenses_cents: todayExpenses,
    month_expenses_cents: monthExpenses,
    pending_count: pendingRows.length,
    pending_cents: pendingCents,
    approved_cents: totalExpenses,
    approved_count: approvedRows.length,
    avg_daily_spend_cents: avgDaily,
  };
}

export async function sumApprovedExpensesInRange(
  admin: SupabaseClient,
  from: string,
  to: string,
  branchId?: string,
): Promise<number> {
  let query = admin
    .from("expenses")
    .select("amount_cents")
    .eq("status", "approved")
    .gte("expense_date", from)
    .lte("expense_date", to);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
}

export async function sumApprovedBookingExpenses(
  admin: SupabaseClient,
  bookingId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("expenses")
    .select("amount_cents")
    .eq("booking_id", bookingId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
}

export async function loadExpensesByCategory(
  admin: SupabaseClient,
  from: string,
  to: string,
  branchId?: string,
): Promise<Array<{ category: string; group: string; amount_cents: number; count: number }>> {
  let query = admin
    .from("expenses")
    .select("amount_cents, expense_categories ( name, group_name )")
    .eq("status", "approved")
    .gte("expense_date", from)
    .lte("expense_date", to);
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const map = new Map<string, { category: string; group: string; amount_cents: number; count: number }>();
  for (const row of data ?? []) {
    const cat = row.expense_categories as unknown as { name: string; group_name: string } | null;
    const key = cat?.name ?? "Unknown";
    const existing = map.get(key) ?? {
      category: key,
      group: cat?.group_name ?? "",
      amount_cents: 0,
      count: 0,
    };
    existing.amount_cents += row.amount_cents ?? 0;
    existing.count += 1;
    map.set(key, existing);
  }
  return [...map.values()].sort((a, b) => b.amount_cents - a.amount_cents);
}

export async function loadExpensesByBranch(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<Array<{ branch_id: string; branch_name: string; amount_cents: number; count: number }>> {
  const { data, error } = await admin
    .from("expenses")
    .select("amount_cents, branch_id, cities ( name )")
    .eq("status", "approved")
    .gte("expense_date", from)
    .lte("expense_date", to);
  if (error) throw new Error(error.message);

  const map = new Map<string, { branch_id: string; branch_name: string; amount_cents: number; count: number }>();
  for (const row of data ?? []) {
    const city = row.cities as unknown as { name: string } | null;
    const bid = row.branch_id ?? "unknown";
    const existing = map.get(bid) ?? {
      branch_id: bid,
      branch_name: city?.name ?? "Unknown",
      amount_cents: 0,
      count: 0,
    };
    existing.amount_cents += row.amount_cents ?? 0;
    existing.count += 1;
    map.set(bid, existing);
  }
  return [...map.values()].sort((a, b) => b.amount_cents - a.amount_cents);
}
