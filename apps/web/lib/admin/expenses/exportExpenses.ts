import { downloadCsv, rowsToCsv } from "@/lib/admin/csvExport";
import type { ExpenseListItem } from "@/lib/admin/expenses/types";
import { EXPENSE_PAYMENT_METHOD_LABELS, EXPENSE_STATUS_LABELS } from "@/lib/admin/expenses/types";

function formatZar(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

export function expensesToCsvRows(items: ExpenseListItem[]): string {
  const headers = [
    "date",
    "category",
    "group",
    "description",
    "vendor",
    "amount_zar",
    "payment_method",
    "status",
    "branch",
    "created_by",
    "notes",
  ];
  const rows = items.map((e) => ({
    date: e.expense_date,
    category: e.category_name,
    group: e.category_group,
    description: e.description,
    vendor: e.vendor_name ?? "",
    amount_zar: formatZar(e.amount_cents),
    payment_method: EXPENSE_PAYMENT_METHOD_LABELS[e.payment_method],
    status: EXPENSE_STATUS_LABELS[e.status],
    branch: e.branch_name,
    created_by: e.created_by_email ?? "",
    notes: e.notes ?? "",
  }));
  return rowsToCsv(headers, rows);
}

export function downloadExpensesCsv(items: ExpenseListItem[], filename = "expenses.csv"): void {
  downloadCsv(filename, expensesToCsvRows(items));
}

/** Excel-compatible export via HTML table (opens in Excel without extra deps). */
export function downloadExpensesExcel(items: ExpenseListItem[], filename = "expenses.xls"): void {
  if (typeof document === "undefined") return;
  const headers = ["Date", "Category", "Description", "Vendor", "Amount", "Payment Method", "Status", "Branch"];
  const rows = items.map(
    (e) =>
      `<tr>
        <td>${e.expense_date}</td>
        <td>${e.category_name}</td>
        <td>${escapeHtml(e.description)}</td>
        <td>${escapeHtml(e.vendor_name ?? "")}</td>
        <td>${formatZar(e.amount_cents)}</td>
        <td>${EXPENSE_PAYMENT_METHOD_LABELS[e.payment_method]}</td>
        <td>${EXPENSE_STATUS_LABELS[e.status]}</td>
        <td>${escapeHtml(e.branch_name)}</td>
      </tr>`,
  );
  const html = `<html><head><meta charset="utf-8"></head><body><table border="1">
    <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${rows.join("")}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function printExpensesTable(items: ExpenseListItem[], title = "Expense Report"): void {
  if (typeof window === "undefined") return;
  const w = window.open("", "_blank");
  if (!w) return;
  const rows = items
    .map(
      (e) =>
        `<tr>
          <td>${e.expense_date}</td>
          <td>${e.category_name}</td>
          <td>${escapeHtml(e.description)}</td>
          <td>${escapeHtml(e.vendor_name ?? "")}</td>
          <td>${formatZar(e.amount_cents)}</td>
          <td>${EXPENSE_STATUS_LABELS[e.status]}</td>
          <td>${escapeHtml(e.branch_name)}</td>
        </tr>`,
    )
    .join("");
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}</style></head>
    <body><h1>${title}</h1><table>
    <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Branch</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`);
  w.document.close();
  w.print();
}
