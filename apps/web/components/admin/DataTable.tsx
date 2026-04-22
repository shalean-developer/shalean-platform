"use client";

import type { ReactNode } from "react";

type DataTableProps = {
  headers: string[];
  loading?: boolean;
  emptyMessage?: string;
  hasRows: boolean;
  children: ReactNode;
};

export default function DataTable({ headers, loading, emptyMessage, hasRows, children }: DataTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/70">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loading ? (
            <tr>
              <td className="px-3 py-8 text-zinc-500" colSpan={headers.length}>
                Loading...
              </td>
            </tr>
          ) : hasRows ? (
            children
          ) : (
            <tr>
              <td className="px-3 py-8 text-zinc-500" colSpan={headers.length}>
                {emptyMessage ?? "No data yet."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
