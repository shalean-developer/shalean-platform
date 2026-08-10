"use client";

import { useState } from "react";
import { Boxes, PackagePlus, RefreshCw, TriangleAlert, Wallet } from "lucide-react";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import { showToast } from "@/components/ui/notifications";
import { OfficeZohoMetricCard, OfficeZohoMetricsRow, OfficeZohoPageHeader, OfficeZohoPrimaryButton, OfficeZohoSecondaryButton, OfficeZohoTableShell } from "@/components/admin/office/OfficeZohoChrome";
import type { InventoryItem } from "@/lib/admin/inventory";

type InventoryData = {
  items: InventoryItem[];
  movements: Array<{ id: string; movement_type: string; quantity_delta: number; total_cost_cents: number; booking_id: string | null; created_at: string; inventory_items: { name: string; sku: string; unit: string } | null }>;
  openIssues: Array<{ id: string; quantity: number; due_at: string | null; cleaner_id: string | null; team_id: string | null; booking_id: string | null; inventory_items: { name: string; sku: string; unit: string } | null }>;
  summary: { activeItems: number; lowStockItems: number; stockValueCents: number };
};

const money = (cents: number) => `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

export default function InventoryPage() {
  const { data, loading, error, refetch } = useAdminData<InventoryData>("/api/admin/inventory");
  const [busy, setBusy] = useState(false);
  const [newItem, setNewItem] = useState({ sku: "", name: "", item_type: "supply", unit: "unit", reorder_level: "0", unit_cost: "0" });
  const [movement, setMovement] = useState({ item_id: "", movement_type: "purchase", quantity: "1", booking_id: "", cleaner_id: "", team_id: "", notes: "" });

  async function send(path: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await adminFetch(path, { method: "POST", body: JSON.stringify(body) });
      if (!result.ok) throw new Error(result.error ?? "Request failed.");
      showToast("Inventory updated.", "success");
      refetch();
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Request failed.", "error");
    } finally { setBusy(false); }
  }

  const items = data?.items ?? [];
  return (
    <div className="space-y-6 p-4 md:p-6">
      <OfficeZohoPageHeader title="Inventory" subtitle="Stock, booking consumption, losses and equipment custody" actions={<OfficeZohoSecondaryButton onClick={() => refetch()}><RefreshCw className="h-4 w-4" />Refresh</OfficeZohoSecondaryButton>} />
      <OfficeZohoMetricsRow>
        <OfficeZohoMetricCard icon={Boxes} label="Active items" value={loading ? "—" : String(data?.summary.activeItems ?? 0)} />
        <OfficeZohoMetricCard icon={TriangleAlert} label="At/below reorder" value={loading ? "—" : String(data?.summary.lowStockItems ?? 0)} />
        <OfficeZohoMetricCard icon={Wallet} label="Stock value" value={loading ? "—" : money(data?.summary.stockValueCents ?? 0)} />
        <OfficeZohoMetricCard icon={PackagePlus} label="Equipment out" value={loading ? "—" : String(data?.openIssues.length ?? 0)} />
      </OfficeZohoMetricsRow>
      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); void send("/api/admin/inventory", { ...newItem, reorder_level: Number(newItem.reorder_level), unit_cost_cents: Math.round(Number(newItem.unit_cost) * 100) }); }}>
          <h2 className="font-semibold text-slate-900">Add catalogue item</h2>
          <div className="grid grid-cols-2 gap-2">
            <input required placeholder="SKU" value={newItem.sku} onChange={(e) => setNewItem({ ...newItem, sku: e.target.value })} className="rounded-md border p-2 text-sm" />
            <input required placeholder="Name" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} className="rounded-md border p-2 text-sm" />
            <select value={newItem.item_type} onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value })} className="rounded-md border p-2 text-sm"><option value="supply">Supply</option><option value="equipment">Equipment</option></select>
            <input required placeholder="Unit" value={newItem.unit} onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })} className="rounded-md border p-2 text-sm" />
            <input type="number" min="0" step="0.01" placeholder="Reorder level" value={newItem.reorder_level} onChange={(e) => setNewItem({ ...newItem, reorder_level: e.target.value })} className="rounded-md border p-2 text-sm" />
            <input type="number" min="0" step="0.01" placeholder="Unit cost (R)" value={newItem.unit_cost} onChange={(e) => setNewItem({ ...newItem, unit_cost: e.target.value })} className="rounded-md border p-2 text-sm" />
          </div>
          <OfficeZohoPrimaryButton type="submit" disabled={busy}>Add item</OfficeZohoPrimaryButton>
        </form>

        <form className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" onSubmit={(event) => { event.preventDefault(); void send("/api/admin/inventory/actions", { action: movement.movement_type === "issue" ? "issue" : "movement", ...movement, quantity: Number(movement.quantity) }); }}>
          <h2 className="font-semibold text-slate-900">Record stock activity</h2>
          <div className="grid grid-cols-2 gap-2">
            <select required value={movement.item_id} onChange={(e) => setMovement({ ...movement, item_id: e.target.value })} className="rounded-md border p-2 text-sm"><option value="">Select item</option>{items.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select>
            <select value={movement.movement_type} onChange={(e) => setMovement({ ...movement, movement_type: e.target.value })} className="rounded-md border p-2 text-sm"><option value="purchase">Purchase / receive</option><option value="consume">Consume on booking</option><option value="issue">Issue equipment</option><option value="loss">Record loss</option><option value="adjustment_in">Adjustment in</option><option value="adjustment_out">Adjustment out</option></select>
            <input required type="number" min="0.01" step="0.01" value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} className="rounded-md border p-2 text-sm" />
            <input placeholder="Booking UUID" value={movement.booking_id} onChange={(e) => setMovement({ ...movement, booking_id: e.target.value })} className="rounded-md border p-2 text-sm" />
            {movement.movement_type === "issue" ? <><input placeholder="Cleaner UUID" value={movement.cleaner_id} onChange={(e) => setMovement({ ...movement, cleaner_id: e.target.value })} className="rounded-md border p-2 text-sm" /><input placeholder="Team UUID" value={movement.team_id} onChange={(e) => setMovement({ ...movement, team_id: e.target.value })} className="rounded-md border p-2 text-sm" /></> : null}
            <input placeholder="Notes" value={movement.notes} onChange={(e) => setMovement({ ...movement, notes: e.target.value })} className="col-span-2 rounded-md border p-2 text-sm" />
          </div>
          <OfficeZohoPrimaryButton type="submit" disabled={busy}>Record activity</OfficeZohoPrimaryButton>
        </form>
      </div>

      <OfficeZohoTableShell>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Item</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reorder</th><th className="px-4 py-3 text-right">Unit cost</th></tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="px-4 py-3"><b>{item.name}</b><div className="text-xs text-slate-500">{item.sku}</div></td><td className="px-4 py-3 capitalize">{item.item_type}</td><td className="px-4 py-3 text-right">{item.quantity_on_hand} {item.unit}</td><td className="px-4 py-3 text-right">{item.reorder_level}</td><td className="px-4 py-3 text-right">{money(item.unit_cost_cents)}</td></tr>)}</tbody></table></div>
      </OfficeZohoTableShell>

      {data?.openIssues.length ? <OfficeZohoTableShell><div className="border-b p-4 font-semibold">Open equipment issues</div><div className="divide-y">{data.openIssues.map((issue) => <div key={issue.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><span>{issue.inventory_items?.name ?? "Equipment"} · {issue.quantity} {issue.inventory_items?.unit}</span><span className="text-slate-500">Booking/cleaner/team: {issue.booking_id ?? issue.cleaner_id ?? issue.team_id}</span><div className="flex gap-2"><OfficeZohoSecondaryButton disabled={busy} onClick={() => void send("/api/admin/inventory/actions", { action: "close_issue", issue_id: issue.id, outcome: "returned" })}>Returned</OfficeZohoSecondaryButton><OfficeZohoSecondaryButton disabled={busy} onClick={() => void send("/api/admin/inventory/actions", { action: "close_issue", issue_id: issue.id, outcome: "lost" })}>Lost</OfficeZohoSecondaryButton></div></div>)}</div></OfficeZohoTableShell> : null}
    </div>
  );
}

