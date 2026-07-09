"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoPillTabs,
  OfficeZohoSecondaryButton,
  OfficeZohoTableShell,
} from "@/components/admin/office/OfficeZohoChrome";
import { useAdminData } from "@/hooks/useAdminData";
import { defaultOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";
import { downloadExpensesCsv, downloadExpensesExcel, printExpensesTable } from "@/lib/admin/expenses/exportExpenses";
import type { ExpenseListItem } from "@/lib/admin/expenses/types";
import { EXPENSE_STATUS_LABELS } from "@/lib/admin/expenses/types";

const REPORT_TABS = [
  { id: "profit-loss", label: "Profit & Loss" },
  { id: "expenses", label: "Expense report" },
  { id: "category", label: "Category report" },
  { id: "branch", label: "Branch report" },
  { id: "vendor", label: "Vendor report" },
  { id: "monthly", label: "Monthly summary" },
] as const;

type ReportTab = (typeof REPORT_TABS)[number]["id"];

type ReportResponse = {
  type: string;
  period: { from: string; to: string };
  profit?: {
    customer_revenue_cents: number;
    cleaner_payouts_cents: number;
    gross_margin_cents: number;
    operating_expenses_cents: number;
    net_profit_cents: number;
    gross_margin_percent: number | null;
    net_profit_percent: number | null;
  };
  visit_count?: number;
  gateway_payments?: {
    gross_cents: number;
    processing_fee_cents: number;
    net_settlement_cents: number;
    transaction_count: number;
  };
  expenses?: ExpenseListItem[];
  expenses_by_category?: Array<{ category: string; group: string; amount_cents: number; count: number }>;
  expenses_by_branch?: Array<{ branch_id: string; branch_name: string; amount_cents: number; count: number }>;
  vendors?: Array<{ vendor: string; amount_cents: number; count: number }>;
  monthly_trend?: Array<{ month: string; revenue_cents: number; expenses_cents: number; net_profit_cents: number }>;
};

function formatZar(cents: number): string {
  return `R ${Math.round(cents / 100).toLocaleString("en-ZA")}`;
}

export default function ExpenseReportsPage() {
  const defaults = defaultOfficePayoutPeriodRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [tab, setTab] = useState<ReportTab>("profit-loss");

  const params = useMemo(() => ({ from, to, type: tab }), [from, to, tab]);
  const { data, loading, error, refetch } = useAdminData<ReportResponse>("/api/admin/expenses/reports", { params });

  const expenses = data?.expenses ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader
        title="Financial reports"
        subtitle="Profit & loss, expense breakdowns, and exportable summaries"
        actions={
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <span className="text-slate-400">–</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-200 px-3 py-2 text-sm" />
            <OfficeZohoSecondaryButton onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </OfficeZohoSecondaryButton>
          </>
        }
      />

      <OfficeZohoPillTabs
        tabs={REPORT_TABS.map((t) => ({ key: t.id, label: t.label }))}
        activeKey={tab}
        onChange={(key) => setTab(key as ReportTab)}
      />

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {tab === "profit-loss" && data?.profit ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">
            Profit & Loss — {data.period.from} to {data.period.to}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Customer revenue", data.profit.customer_revenue_cents, "text-blue-700"],
              ["Cleaner payouts", data.profit.cleaner_payouts_cents, "text-slate-700"],
              ["Gross margin", data.profit.gross_margin_cents, "text-emerald-700"],
              ["Operating expenses", data.profit.operating_expenses_cents, "text-amber-700"],
              ["Gateway fees (Paystack)", data.gateway_payments?.processing_fee_cents ?? 0, "text-orange-700"],
              ["Net settlement", data.gateway_payments?.net_settlement_cents ?? 0, "text-teal-700"],
              ["Net profit", data.profit.net_profit_cents, data.profit.net_profit_cents >= 0 ? "text-violet-700" : "text-red-600"],
            ].map(([label, cents, cls]) => (
              <div key={String(label)} className="rounded-lg border border-slate-100 p-4">
                <p className="text-xs text-slate-500">{label}</p>
                <p className={`mt-1 text-xl font-bold tabular-nums ${cls}`}>{formatZar(cents as number)}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">{data.visit_count ?? 0} completed visits in period</p>
        </section>
      ) : null}

      {(tab === "category" || tab === "branch" || tab === "vendor" || tab === "monthly") && !loading ? (
        <OfficeZohoTableShell>
          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
            {expenses.length > 0 ? (
              <>
                <OfficeZohoSecondaryButton onClick={() => downloadExpensesCsv(expenses, `${tab}-report.csv`)}>
                  <Download className="h-4 w-4" /> CSV
                </OfficeZohoSecondaryButton>
                <OfficeZohoSecondaryButton onClick={() => downloadExpensesExcel(expenses, `${tab}-report.xls`)}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel
                </OfficeZohoSecondaryButton>
                <OfficeZohoSecondaryButton onClick={() => printExpensesTable(expenses, `${tab} report`)}>
                  <Printer className="h-4 w-4" /> Print
                </OfficeZohoSecondaryButton>
              </>
            ) : null}
          </div>
          <div className="overflow-x-auto p-4">
            {tab === "category" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="pb-2">Group</th><th className="pb-2">Category</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.expenses_by_category ?? []).map((r) => (
                    <tr key={r.category} className="border-b border-slate-50">
                      <td className="py-2 text-slate-500">{r.group}</td>
                      <td className="py-2 font-medium">{r.category}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right font-semibold">{formatZar(r.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === "branch" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="pb-2">Branch</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.expenses_by_branch ?? []).map((r) => (
                    <tr key={r.branch_id} className="border-b border-slate-50">
                      <td className="py-2 font-medium">{r.branch_name}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right font-semibold">{formatZar(r.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === "vendor" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="pb-2">Vendor</th><th className="pb-2 text-right">Count</th><th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.vendors ?? []).map((r) => (
                    <tr key={r.vendor} className="border-b border-slate-50">
                      <td className="py-2 font-medium">{r.vendor}</td>
                      <td className="py-2 text-right">{r.count}</td>
                      <td className="py-2 text-right font-semibold">{formatZar(r.amount_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === "monthly" ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-slate-500">
                    <th className="pb-2">Month</th><th className="pb-2 text-right">Revenue</th><th className="pb-2 text-right">Expenses</th><th className="pb-2 text-right">Net profit</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.monthly_trend ?? []).map((r) => (
                    <tr key={r.month} className="border-b border-slate-50">
                      <td className="py-2 font-medium">{r.month}</td>
                      <td className="py-2 text-right">{formatZar(r.revenue_cents)}</td>
                      <td className="py-2 text-right">{formatZar(r.expenses_cents)}</td>
                      <td className="py-2 text-right font-semibold">{formatZar(r.net_profit_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </OfficeZohoTableShell>
      ) : null}

      {tab === "expenses" ? (
        <OfficeZohoTableShell>
          <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
            <OfficeZohoSecondaryButton onClick={() => downloadExpensesCsv(expenses)}>
              <Download className="h-4 w-4" /> CSV
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton onClick={() => downloadExpensesExcel(expenses)}>
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton onClick={() => printExpensesTable(expenses, "Expense report")}>
              <Printer className="h-4 w-4" /> Print
            </OfficeZohoSecondaryButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-4 py-3">Date</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
                ) : expenses.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50">
                    <td className="px-4 py-2">{e.expense_date}</td>
                    <td className="px-4 py-2">{e.category_name}</td>
                    <td className="px-4 py-2">{e.description}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatZar(e.amount_cents)}</td>
                    <td className="px-4 py-2">{EXPENSE_STATUS_LABELS[e.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </OfficeZohoTableShell>
      ) : null}
    </div>
  );
}
