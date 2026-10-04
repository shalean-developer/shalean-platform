"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Settings, XCircle } from "lucide-react";
import {
  OfficeZohoPageHeader,
  OfficeZohoPrimaryButton,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";
import { adminFetch } from "@/hooks/useAdminData";
import { cn } from "@/lib/utils";

type CategoryMapping = { platform_category: string; zoho_account_name: string };

type RepairDryRunCheck = {
  kind: "booking" | "monthly_invoice" | "sales_document";
  id: string;
  expected_amount_cents: number;
  payment_transaction_id: string | null;
  queue_record_id: string | null;
  current_zoho_invoice_id: string | null;
  current_zoho_invoice_number: string | null;
  action: "create_and_pay" | "already_linked_review" | "blocked";
  ok: boolean;
  issues: string[];
};

type RepairDryRunPayload = {
  ok: boolean;
  mode: "dry-run";
  writes_performed: false;
  allowlist_count: number;
  zoho_organization_id_masked: string | null;
  expected_zoho_organization_suffix: string;
  correct_zoho_organization: boolean;
  blocked_count: number;
  create_and_pay_count: number;
  already_linked_review_count: number;
  checks: RepairDryRunCheck[];
};

type RepairApplyResult = {
  kind: "booking" | "monthly_invoice" | "sales_document";
  id: string;
  ok: boolean;
  outcome: "created_paid_linked" | "resumed_paid_linked" | "already_complete" | "failed";
  invoice_number?: string | null;
  error?: string;
};

type RepairApplyPayload = {
  ok: boolean;
  attempted: number;
  succeeded: number;
  failed: number;
  writes_performed: true;
  scope: string;
  results: RepairApplyResult[];
};

type IntegrationPayload = {
  zoho_configured: boolean;
  organization_id: string | null;
  oauth_configured: boolean;
  settings: {
    expense_category_mappings: CategoryMapping[];
    default_paystack_vendor_id: string | null;
    default_paystack_category_id: string | null;
    sync_frequency_minutes: number;
    max_retry_attempts: number;
    retry_base_delay_seconds: number;
    auto_sync_enabled: boolean;
    last_sync_at: string | null;
  };
  vendors: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string; group_name: string }>;
  sync_queue: {
    pending_count: number;
    failed_records: Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      sync_errors: string | null;
      retry_count: number;
    }>;
  };
};

export default function ZohoIntegrationPage() {
  const [data, setData] = useState<IntegrationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRun, setDryRun] = useState<RepairDryRunPayload | null>(null);
  const [applyingRepair, setApplyingRepair] = useState(false);
  const [applyResult, setApplyResult] = useState<RepairApplyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [autoSync, setAutoSync] = useState(true);
  const [syncFrequency, setSyncFrequency] = useState(15);
  const [maxRetries, setMaxRetries] = useState(5);
  const [retryDelay, setRetryDelay] = useState(60);
  const [paystackVendorId, setPaystackVendorId] = useState<string>("");
  const [paystackCategoryId, setPaystackCategoryId] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch<IntegrationPayload>("/api/admin/zoho-integration");
      if (!res.ok || !res.data) throw new Error(res.error ?? "Failed to load");
      setData(res.data);
      setMappings(res.data.settings.expense_category_mappings);
      setAutoSync(res.data.settings.auto_sync_enabled);
      setSyncFrequency(res.data.settings.sync_frequency_minutes);
      setMaxRetries(res.data.settings.max_retry_attempts);
      setRetryDelay(res.data.settings.retry_base_delay_seconds);
      setPaystackVendorId(res.data.settings.default_paystack_vendor_id ?? "");
      setPaystackCategoryId(res.data.settings.default_paystack_category_id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await adminFetch("/api/admin/zoho-integration", {
        method: "PATCH",
        body: JSON.stringify({
          expense_category_mappings: mappings,
          auto_sync_enabled: autoSync,
          sync_frequency_minutes: syncFrequency,
          max_retry_attempts: maxRetries,
          retry_base_delay_seconds: retryDelay,
          default_paystack_vendor_id: paystackVendorId || null,
          default_paystack_category_id: paystackCategoryId || null,
        }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const runSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await adminFetch("/api/admin/zoho-integration", { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const runRepairDryRun = async () => {
    setDryRunning(true);
    setError(null);
    try {
      const res = await adminFetch<RepairDryRunPayload>(
        "/api/admin/inv-e2e-01d/zoho-repair-dry-run",
      );
      if (!res.ok || !res.data) throw new Error(res.error ?? "Dry-run audit failed");
      setDryRun(res.data);
    } catch (e) {
      setDryRun(null);
      setError(e instanceof Error ? e.message : "Dry-run audit failed");
    } finally {
      setDryRunning(false);
    }
  };

  const applyTargetedRepair = async () => {
    const confirmation = window.prompt(
      "Production write action. Type APPLY_INV_E2E_01D_10 exactly to create or resume payment for the 10 audited Zoho invoices.",
    );
    if (confirmation !== "APPLY_INV_E2E_01D_10") return;

    setApplyingRepair(true);
    setApplyResult(null);
    setError(null);
    try {
      const res = await adminFetch<RepairApplyPayload>(
        "/api/admin/inv-e2e-01d/zoho-repair-apply",
        {
          method: "POST",
          body: JSON.stringify({ confirmation }),
        },
      );
      if (!res.data) throw new Error(res.error ?? "Targeted repair failed");
      setApplyResult(res.data);
      await load();
      await runRepairDryRun();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Targeted repair failed");
    } finally {
      setApplyingRepair(false);
    }
  };

  const retrySync = async (recordId: string) => {
    try {
      await adminFetch("/api/admin/zoho-integration/retry", {
        method: "POST",
        body: JSON.stringify({ record_id: recordId }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const updateMapping = (index: number, field: keyof CategoryMapping, value: string) => {
    setMappings((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  };

  const addMapping = () => {
    setMappings((prev) => [...prev, { platform_category: "", zoho_account_name: "" }]);
  };

  return (
    <div className="space-y-6">
      <OfficeZohoPageHeader
        title="Zoho Books Integration"
        subtitle="Configure accounting sync between Shalean, Paystack, and Zoho Books. OAuth credentials are managed via environment variables."
        actions={
          <div className="flex gap-2">
            <OfficeZohoSecondaryButton onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </OfficeZohoSecondaryButton>
            <OfficeZohoSecondaryButton onClick={() => void runRepairDryRun()} disabled={dryRunning}>
              <RefreshCw className={cn("h-4 w-4", dryRunning && "animate-spin")} />
              {dryRunning ? "Running dry run…" : "Run INV-E2E dry run"}
            </OfficeZohoSecondaryButton>
            <OfficeZohoPrimaryButton onClick={() => void runSync()} disabled={syncing}>
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              Run sync now
            </OfficeZohoPrimaryButton>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {dryRun && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">INV-E2E repair dry run</h2>
              <p className="mt-1 text-sm text-slate-600">
                Read-only audit. No Zoho or Supabase writes were performed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dryRun.ok &&
                dryRun.correct_zoho_organization &&
                dryRun.blocked_count === 0 &&
                dryRun.create_and_pay_count + dryRun.already_linked_review_count === 10 && (
                  <OfficeZohoPrimaryButton
                    onClick={() => void applyTargetedRepair()}
                    disabled={applyingRepair}
                  >
                    {applyingRepair ? "Applying targeted repair…" : "Apply INV-E2E repair"}
                  </OfficeZohoPrimaryButton>
                )}
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  dryRun.ok && dryRun.correct_zoho_organization
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800",
                )}
              >
                {dryRun.ok && dryRun.correct_zoho_organization ? "PASS" : "REVIEW"}
              </span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatusCard label="Allowlist" ok={dryRun.allowlist_count === 10} detail={`${dryRun.allowlist_count} records`} />
            <StatusCard label="Zoho org" ok={dryRun.correct_zoho_organization} detail={dryRun.zoho_organization_id_masked ?? "Missing"} />
            <StatusCard label="Blocked" ok={dryRun.blocked_count === 0} detail={`${dryRun.blocked_count} blocked`} />
            <StatusCard
              label="Ready to repair"
              ok={dryRun.create_and_pay_count + dryRun.already_linked_review_count === 10}
              detail={`${dryRun.create_and_pay_count} create · ${dryRun.already_linked_review_count} resume/review`}
            />
          </div>

          <div className="mt-4 space-y-2">
            {dryRun.checks.map((check) => (
              <div key={`${check.kind}:${check.id}`} className="rounded border bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {check.kind} · {check.id.slice(0, 8)}…
                  </span>
                  <span className={check.ok ? "text-emerald-700" : "text-amber-700"}>
                    {check.action}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Expected R{(check.expected_amount_cents / 100).toFixed(2)}
                  {check.current_zoho_invoice_number ? ` · linked ${check.current_zoho_invoice_number}` : ""}
                </p>
                {check.issues.length > 0 && (
                  <p className="mt-1 text-xs text-red-600">{check.issues.join(" · ")}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {applyResult && (
        <section
          className={cn(
            "rounded-xl border p-5",
            applyResult.ok ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50",
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">INV-E2E targeted repair result</h2>
              <p className="mt-1 text-sm text-slate-600">
                {applyResult.succeeded} succeeded · {applyResult.failed} failed · {applyResult.attempted} attempted
              </p>
            </div>
            <span className={applyResult.ok ? "text-emerald-700" : "text-amber-700"}>
              {applyResult.ok ? "COMPLETE" : "REVIEW FAILURES"}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {applyResult.results.map((item) => (
              <div key={`${item.kind}:${item.id}`} className="rounded border bg-white px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.kind} · {item.id.slice(0, 8)}…</span>
                  <span className={item.ok ? "text-emerald-700" : "text-red-700"}>{item.outcome}</span>
                </div>
                {item.invoice_number && <p className="mt-1 text-xs text-slate-500">{item.invoice_number}</p>}
                {item.error && <p className="mt-1 text-xs text-red-600">{item.error}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          label="Zoho configured"
          ok={data?.zoho_configured ?? false}
          detail={data?.organization_id ? `Org ${data.organization_id}` : "Missing env vars"}
        />
        <StatusCard label="OAuth" ok={data?.oauth_configured ?? false} detail="Refresh token in env" />
        <StatusCard
          label="Sync queue"
          ok={(data?.sync_queue.pending_count ?? 0) === 0 && (data?.sync_queue.failed_records.length ?? 0) === 0}
          detail={`${data?.sync_queue.pending_count ?? 0} pending · ${data?.sync_queue.failed_records.length ?? 0} failed`}
        />
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Sync settings</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} />
            Automatic background sync
          </label>
          <label className="text-sm">
            Sync frequency (minutes)
            <input
              type="number"
              min={5}
              max={1440}
              value={syncFrequency}
              onChange={(e) => setSyncFrequency(Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Max retry attempts
            <input
              type="number"
              min={1}
              max={20}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Retry base delay (seconds)
            <input
              type="number"
              min={10}
              max={3600}
              value={retryDelay}
              onChange={(e) => setRetryDelay(Number(e.target.value))}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="text-sm">
            Default Paystack vendor
            <select
              value={paystackVendorId}
              onChange={(e) => setPaystackVendorId(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              <option value="">Auto (Paystack)</option>
              {(data?.vendors ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Default Paystack expense category
            <select
              value={paystackCategoryId}
              onChange={(e) => setPaystackCategoryId(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            >
              <option value="">Paystack Fees (default)</option>
              {(data?.categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.group_name} · {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {data?.settings.last_sync_at && (
          <p className="mt-3 text-xs text-slate-500">
            Last sync: {new Date(data.settings.last_sync_at).toLocaleString("en-ZA")}
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Expense category mapping</h2>
          <OfficeZohoSecondaryButton onClick={addMapping}>Add mapping</OfficeZohoSecondaryButton>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Map platform expense categories to Zoho Books expense accounts.
        </p>
        <div className="mt-4 space-y-2">
          {mappings.map((m, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-2">
              <input
                value={m.platform_category}
                onChange={(e) => updateMapping(i, "platform_category", e.target.value)}
                placeholder="Platform category"
                className="rounded border px-3 py-2 text-sm"
              />
              <input
                value={m.zoho_account_name}
                onChange={(e) => updateMapping(i, "zoho_account_name", e.target.value)}
                placeholder="Zoho account name"
                className="rounded border px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      </section>

      {(data?.sync_queue.failed_records.length ?? 0) > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-5">
          <h2 className="text-lg font-semibold text-amber-900">Failed synchronizations</h2>
          <div className="mt-3 space-y-2">
            {data!.sync_queue.failed_records.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border bg-white px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{r.entity_type}</span>
                  <span className="ml-2 text-slate-500">{r.entity_id.slice(0, 8)}…</span>
                  {r.sync_errors && <p className="text-xs text-red-600">{r.sync_errors}</p>}
                </div>
                <OfficeZohoSecondaryButton onClick={() => void retrySync(r.id)}>
                  Retry
                </OfficeZohoSecondaryButton>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <OfficeZohoPrimaryButton onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </OfficeZohoPrimaryButton>
      </div>
    </div>
  );
}

function StatusCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <XCircle className="h-5 w-5 text-amber-600" />
        )}
        <span className="font-medium text-slate-900">{label}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}
