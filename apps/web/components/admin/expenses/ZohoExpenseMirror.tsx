"use client";
import { useMemo, useState } from 'react';
import { adminFetch, useAdminData } from '@/hooks/useAdminData';
import type { MirroredExpense } from '@/lib/zoho/expenseMirror';

const EMPTY_RECORDS: MirroredExpense[] = [];
type Snapshot = { records: MirroredExpense[]; last_success_at: string | null; last_attempt_at: string; last_error: string | null };
function defaultPeriod() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [year, month] = today.split('-').map(Number);
  return { from: `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}-01`, to: today };
}
const money = (cents: number, currency = 'ZAR') => new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(cents / 100);
const time = (value: string | null | undefined) => value ? new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) + ' SAST' : 'Never';
export function ZohoExpenseMirror() {
  const [period, setPeriod] = useState(defaultPeriod);
  const [search, setSearch] = useState(''), [category, setCategory] = useState(''), [account, setAccount] = useState('');
  const [showExcluded, setShowExcluded] = useState(false), [page, setPage] = useState(1);
  const [syncing, setSyncing] = useState(false), [syncError, setSyncError] = useState<string | null>(null);
  const { data, loading, error, refetch } = useAdminData<{ snapshot: Snapshot | null; organization_id: string; from: string; to: string }>('/api/admin/expenses/zoho', { params: period });
  // The shared read hook retains old data while loading. Never label it with a new period.
  const snapshot = data?.from === period.from && data?.to === period.to ? data.snapshot : null;
  const records = snapshot?.records ?? EMPTY_RECORDS;
  const filtered = useMemo(() => records.filter(r => (showExcluded || r.operating) &&
    (!category || r.category === category) && (!account || r.paid_through === account) &&
    [r.description, r.reference, r.vendor, r.id].join(' ').toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)), [records, showExcluded, category, account, search]);
  const total = filtered.filter(r => r.operating).reduce((sum, r) => sum + r.amount_cents, 0);
  async function sync() {
    setSyncing(true); setSyncError(null);
    try {
      const result = await adminFetch('/api/admin/expenses/zoho', { method: 'POST', body: JSON.stringify(period) });
      if (!result.ok) throw new Error(result.error ?? 'Expense sync failed.');
      await refetch();
    } catch (e) { setSyncError(e instanceof Error ? e.message : 'Expense sync failed.'); await refetch(); }
    finally { setSyncing(false); }
  }
  return <section className="space-y-4" aria-label="Zoho expenses">
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="font-semibold">Expenses from Zoho Books</h2>
      <p className="text-sm text-slate-600">Zoho owns these records. Use Sync from Zoho to import new expenses and refresh changes or removals for the selected dates. Edit records and view receipts in Zoho.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">From<input aria-label="Zoho expenses from" type="date" value={period.from} disabled={syncing} onChange={e => { setPeriod(p => ({ ...p, from: e.target.value })); setPage(1); setCategory(''); setAccount(''); }} className="block rounded border p-2" /></label>
        <label className="text-sm">To<input aria-label="Zoho expenses to" type="date" value={period.to} disabled={syncing} onChange={e => { setPeriod(p => ({ ...p, to: e.target.value })); setPage(1); setCategory(''); setAccount(''); }} className="block rounded border p-2" /></label>
        <button type="button" disabled={syncing || !period.from || !period.to} onClick={sync} className="rounded bg-sky-700 px-4 py-2 text-white disabled:opacity-50">{syncing ? 'Syncing…' : 'Sync from Zoho'}</button>
        <button type="button" onClick={() => refetch()} disabled={loading || syncing} className="rounded border px-4 py-2">Reload saved results</button>
      </div>
      <p className="text-sm">Last successful sync: {time(snapshot?.last_success_at)} · Last attempt: {time(snapshot?.last_attempt_at)}</p>
      {(error || syncError || snapshot?.last_error) && <p role="alert" className="text-sm text-red-700">{error || syncError || snapshot?.last_error}</p>}
      {!loading && !error && !snapshot?.last_success_at && <p className="text-sm">This date range has not been imported. Select Sync from Zoho.</p>}
      <p className="text-sm">Only ZAR expenses posted to expense or cost accounts enter the operating total. Transfers, assets, liabilities, personal items and unclassified records are excluded and available for review below. Paystack Clearing is a payment account, not an expense category.</p>
    </div>
    <div className="flex flex-wrap gap-3">
      <input aria-label="Search Zoho expenses" placeholder="Search description, reference, vendor or Zoho ID" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="min-w-72 rounded border p-2" />
      <select aria-label="Zoho expense category" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="rounded border p-2"><option value="">All categories</option>{[...new Set(records.map(r => r.category))].sort().map(c => <option key={c}>{c}</option>)}</select>
      <select aria-label="Zoho payment account" value={account} onChange={e => { setAccount(e.target.value); setPage(1); }} className="rounded border p-2"><option value="">All payment accounts</option>{[...new Set(records.map(r => r.paid_through).filter(Boolean))].sort().map(c => <option key={c}>{c}</option>)}</select>
      <label className="text-sm"><input type="checkbox" checked={showExcluded} onChange={e => { setShowExcluded(e.target.checked); setPage(1); }} /> Include excluded records for review ({records.filter(r => !r.operating).length})</label>
    </div>
    <p className="font-semibold">Operating total for {period.from} to {period.to}{search || category || account ? ' (filtered)' : ''}: {loading || error || !snapshot?.last_success_at ? '—' : money(total)}</p>
    {loading ? <p role="status">Loading saved Zoho expenses…</p> : !error && snapshot?.last_success_at && <>
      <div className="overflow-x-auto rounded border bg-white"><table className="w-full text-sm"><thead><tr>{['Date', 'Category', 'Description / reference', 'Vendor', 'Paid through', 'Amount', 'Zoho record'].map(h => <th key={h} className="p-3 text-left">{h}</th>)}</tr></thead>
        <tbody>{filtered.slice((page - 1) * 25, page * 25).map(r => <tr key={r.id} className="border-t"><td className="p-3 whitespace-nowrap">{r.date}</td><td className="p-3">{r.category}{r.exclusion && <p className="text-xs text-amber-800">{r.exclusion}</p>}</td><td className="p-3">{r.description}<p className="text-xs text-slate-500">{r.reference}</p></td><td className="p-3">{r.vendor || '—'}</td><td className="p-3">{r.paid_through || 'Not supplied by Zoho list API'}</td><td className="p-3 whitespace-nowrap">{money(r.amount_cents, r.currency)}</td><td className="p-3"><a className="text-sky-700 underline" target="_blank" rel="noopener noreferrer" href={`https://books.zoho.com/app/${data?.organization_id}#/expenses/${r.id}`}>View in Zoho</a><p className="text-xs">{r.status}</p></td></tr>)}</tbody></table></div>
      {!filtered.length && <p>No matching Zoho expenses in this successfully imported date range.</p>}
      <div className="flex items-center gap-3 text-sm"><span>{filtered.length} records</span><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page} of {Math.max(1, Math.ceil(filtered.length / 25))}</span><button type="button" disabled={page * 25 >= filtered.length} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
  </section>;
}
