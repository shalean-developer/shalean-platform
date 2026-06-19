"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { adminFetch, getAdminToken } from "@/hooks/useAdminData";
import { emitAdminToast } from "@/lib/admin/toastBus";
import {
  defaultCleanerTiers,
  defaultTeamPricing,
  newTierId,
  normalizeCatalogSlug,
  type BookingPricingConfig,
  type CleanerPricingTier,
  type PricingExtraRow,
  type PricingServiceRow,
  type RecurringDiscountRule,
  type TeamPricingConfig,
} from "@/lib/admin/officePricingTypes";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type PricingSection = "base" | "extras" | "team" | "cleaner_count" | "discounts";

const TABS: { id: PricingSection; label: string }[] = [
  { id: "base", label: "Base Pricing" },
  { id: "extras", label: "Extras" },
  { id: "team", label: "Team Pricing" },
  { id: "cleaner_count", label: "Cleaner Count" },
  { id: "discounts", label: "Recurring Discounts" },
];

function formatZar(amount: number): string {
  return `R ${Math.round(amount).toLocaleString("en-ZA")}`;
}

function formatDuration(minHours: number, maxHours: number): string {
  const min = Number(minHours);
  const max = Number(maxHours);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  if (min === max) return `${min} hrs`;
  return `${min}–${max} hrs`;
}

function formatDiscount(rule: RecurringDiscountRule | undefined): string {
  if (!rule || rule.value <= 0) return "None";
  if (rule.type === "fixed") return formatZar(rule.value);
  return `${rule.value}%`;
}

function inputClassName(width = "w-full"): string {
  return cn(
    width,
    "rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100",
  );
}

export function OfficePricingPageView() {
  const [tab, setTab] = useState<PricingSection>("base");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<PricingServiceRow[]>([]);
  const [extras, setExtras] = useState<PricingExtraRow[]>([]);
  const [bookingConfig, setBookingConfig] = useState<BookingPricingConfig>({});

  const [serviceDialog, setServiceDialog] = useState<PricingServiceRow | "new" | null>(null);
  const [extraDialog, setExtraDialog] = useState<PricingExtraRow | "new" | null>(null);
  const [discountDialog, setDiscountDialog] = useState<{ key: string; rule: RecurringDiscountRule } | "new" | null>(
    null,
  );
  const [tierDialog, setTierDialog] = useState<CleanerPricingTier | "new" | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "service"; row: PricingServiceRow }
    | { kind: "extra"; row: PricingExtraRow }
    | { kind: "discount"; key: string }
    | { kind: "tier"; tier: CleanerPricingTier }
    | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getAdminToken();
    if (!token) {
      emitAdminToast("Sign in as admin.", "error");
      setLoading(false);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const [sRes, eRes, cRes] = await Promise.all([
      fetch("/api/admin/pricing-services", { headers, cache: "no-store" }),
      fetch("/api/admin/pricing-extras", { headers, cache: "no-store" }),
      fetch("/api/admin/pricing-booking-config", { headers, cache: "no-store" }),
    ]);

    const sJson = (await sRes.json()) as { services?: PricingServiceRow[]; error?: string };
    const eJson = (await eRes.json()) as { extras?: PricingExtraRow[]; error?: string };
    const cJson = (await cRes.json()) as { config?: BookingPricingConfig; error?: string };

    if (!sRes.ok) emitAdminToast(sJson.error ?? "Could not load services.", "error");
    else setServices(sJson.services ?? []);

    if (!eRes.ok) emitAdminToast(eJson.error ?? "Could not load extras.", "error");
    else setExtras(eJson.extras ?? []);

    if (!cRes.ok) emitAdminToast(cJson.error ?? "Could not load booking config.", "error");
    else setBookingConfig(cJson.config ?? {});

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const extraCleanerExtra = useMemo(
    () => extras.find((e) => e.slug === "extra-cleaner") ?? null,
    [extras],
  );

  const extraCleanerFee = extraCleanerExtra?.price ?? bookingConfig.extra_cleaner_fee_zar ?? 0;

  const referenceBasePrice = useMemo(() => {
    const standard = services.find((s) => s.slug === "standard");
    return standard?.base_price ?? services.find((s) => s.is_active)?.base_price ?? 0;
  }, [services]);

  const cleanerTiers = useMemo(() => {
    const stored = bookingConfig.cleaner_pricing_tiers;
    if (stored && stored.length > 0) return [...stored].sort((a, b) => a.cleaner_count - b.cleaner_count);
    return defaultCleanerTiers(extraCleanerFee);
  }, [bookingConfig.cleaner_pricing_tiers, extraCleanerFee]);

  const tiersAreCustom = (bookingConfig.cleaner_pricing_tiers?.length ?? 0) > 0;

  const teamPricing = bookingConfig.team_pricing ?? defaultTeamPricing();

  const discountEntries = useMemo(() => {
    const map = bookingConfig.recurring_discounts ?? {};
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [bookingConfig.recurring_discounts]);

  async function patchConfig(body: Record<string, unknown>) {
    const res = await adminFetch<{ config?: BookingPricingConfig }>("/api/admin/pricing-booking-config", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      emitAdminToast(res.error ?? "Save failed", "error");
      return false;
    }
    if (res.data?.config) setBookingConfig(res.data.config);
    emitAdminToast("Saved", "success");
    return true;
  }

  async function saveCleanerTiers(tiers: CleanerPricingTier[]) {
    setBusy(true);
    await patchConfig({ cleaner_pricing_tiers: tiers });
    setBusy(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setBusy(true);

    if (deleteTarget.kind === "service") {
      const res = await adminFetch(`/api/admin/pricing-services?id=${encodeURIComponent(deleteTarget.row.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) emitAdminToast(res.error ?? "Delete failed", "error");
      else {
        emitAdminToast("Service deleted", "success");
        setServices((prev) => prev.filter((s) => s.id !== deleteTarget.row.id));
      }
    } else if (deleteTarget.kind === "extra") {
      const res = await adminFetch(`/api/admin/pricing-extras?id=${encodeURIComponent(deleteTarget.row.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) emitAdminToast(res.error ?? "Delete failed", "error");
      else {
        emitAdminToast("Extra deleted", "success");
        setExtras((prev) => prev.filter((e) => e.id !== deleteTarget.row.id));
      }
    } else if (deleteTarget.kind === "discount") {
      await patchConfig({ remove_recurring_discounts: [deleteTarget.key] });
    } else if (deleteTarget.kind === "tier") {
      const next = cleanerTiers.filter((t) => t.id !== deleteTarget.tier.id);
      await saveCleanerTiers(next);
    }

    setBusy(false);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Pricing</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Manage checkout catalog, add-ons, cleaner tiers, and recurring discounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busy}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex gap-1 border-b border-slate-100 px-4 pt-3 pb-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "pb-2.5 px-3 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : null}

          {!loading && tab === "base" ? (
            <BasePricingTab
              services={services}
              onAdd={() => setServiceDialog("new")}
              onEdit={(row) => setServiceDialog(row)}
              onDelete={(row) => setDeleteTarget({ kind: "service", row })}
              onToggleActive={async (row) => {
                setBusy(true);
                const res = await adminFetch("/api/admin/pricing-services", {
                  method: "PATCH",
                  body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
                });
                setBusy(false);
                if (!res.ok) emitAdminToast(res.error ?? "Update failed", "error");
                else {
                  emitAdminToast("Saved", "success");
                  setServices((prev) =>
                    prev.map((s) => (s.id === row.id ? { ...s, is_active: !row.is_active } : s)),
                  );
                }
              }}
            />
          ) : null}

          {!loading && tab === "extras" ? (
            <ExtrasTab
              extras={extras}
              onAdd={() => setExtraDialog("new")}
              onEdit={(row) => setExtraDialog(row)}
              onDelete={(row) => setDeleteTarget({ kind: "extra", row })}
              onToggleActive={async (row) => {
                setBusy(true);
                const res = await adminFetch("/api/admin/pricing-extras", {
                  method: "PATCH",
                  body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
                });
                setBusy(false);
                if (!res.ok) emitAdminToast(res.error ?? "Update failed", "error");
                else {
                  emitAdminToast("Saved", "success");
                  setExtras((prev) =>
                    prev.map((e) => (e.id === row.id ? { ...e, is_active: !row.is_active } : e)),
                  );
                }
              }}
            />
          ) : null}

          {!loading && tab === "team" ? (
            <TeamTab
              extraCleanerFee={extraCleanerFee}
              extraCleanerExtra={extraCleanerExtra}
              teamPricing={teamPricing}
              onEditExtraFee={() => {
                if (extraCleanerExtra) setExtraDialog(extraCleanerExtra);
                else setTeamDialogOpen(true);
              }}
              onEditTeam={() => setTeamDialogOpen(true)}
            />
          ) : null}

          {!loading && tab === "cleaner_count" ? (
            <CleanerCountTab
              referenceBasePrice={referenceBasePrice}
              tiers={cleanerTiers}
              tiersAreCustom={tiersAreCustom}
              onAdd={() => setTierDialog("new")}
              onEdit={(tier) => setTierDialog(tier)}
              onDelete={(tier) => setDeleteTarget({ kind: "tier", tier })}
              onResetToComputed={async () => {
                setBusy(true);
                await patchConfig({ cleaner_pricing_tiers: defaultCleanerTiers(extraCleanerFee) });
                setBusy(false);
              }}
            />
          ) : null}

          {!loading && tab === "discounts" ? (
            <DiscountsTab
              entries={discountEntries}
              onAdd={() => setDiscountDialog("new")}
              onEdit={(key, rule) => setDiscountDialog({ key, rule })}
              onDelete={(key) => setDeleteTarget({ kind: "discount", key })}
            />
          ) : null}
        </div>
      </div>

      <ServiceDialog
        open={serviceDialog != null}
        initial={serviceDialog === "new" ? null : serviceDialog}
        onClose={() => setServiceDialog(null)}
        onSaved={(row) => {
          setServices((prev) => {
            const idx = prev.findIndex((s) => s.id === row.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = row;
              return next.sort((a, b) => a.sort_order - b.sort_order);
            }
            return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
          });
          setServiceDialog(null);
        }}
      />

      <ExtraDialog
        open={extraDialog != null}
        initial={extraDialog === "new" ? null : extraDialog}
        onClose={() => setExtraDialog(null)}
        onSaved={(row) => {
          setExtras((prev) => {
            const idx = prev.findIndex((e) => e.id === row.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = row;
              return next.sort((a, b) => a.sort_order - b.sort_order);
            }
            return [...prev, row].sort((a, b) => a.sort_order - b.sort_order);
          });
          setExtraDialog(null);
        }}
      />

      <DiscountDialog
        open={discountDialog != null}
        initial={discountDialog === "new" ? null : discountDialog}
        onClose={() => setDiscountDialog(null)}
        onSave={async (key, rule) => {
          setBusy(true);
          const ok = await patchConfig({ recurring_discounts: { [key]: rule } });
          setBusy(false);
          if (ok) setDiscountDialog(null);
        }}
      />

      <TierDialog
        open={tierDialog != null}
        initial={tierDialog === "new" ? null : tierDialog}
        existingCounts={cleanerTiers.map((t) => t.cleaner_count)}
        onClose={() => setTierDialog(null)}
        onSave={async (tier) => {
          const next = [...cleanerTiers.filter((t) => t.id !== tier.id), tier].sort(
            (a, b) => a.cleaner_count - b.cleaner_count,
          );
          setBusy(true);
          const ok = await patchConfig({ cleaner_pricing_tiers: next });
          setBusy(false);
          if (ok) setTierDialog(null);
        }}
      />

      <TeamDialog
        open={teamDialogOpen}
        teamPricing={teamPricing}
        extraCleanerFee={extraCleanerFee}
        hasExtraRow={Boolean(extraCleanerExtra)}
        onClose={() => setTeamDialogOpen(false)}
        onSave={async (team, fee) => {
          setBusy(true);
          if (extraCleanerExtra) {
            await adminFetch("/api/admin/pricing-extras", {
              method: "PATCH",
              body: JSON.stringify({ id: extraCleanerExtra.id, price: fee }),
            });
            setExtras((prev) =>
              prev.map((e) => (e.id === extraCleanerExtra.id ? { ...e, price: fee } : e)),
            );
          }
          const ok = await patchConfig({
            team_pricing: team,
            ...(extraCleanerExtra ? {} : { extra_cleaner_fee_zar: fee }),
          });
          setBusy(false);
          if (ok) setTeamDialogOpen(false);
        }}
      />

      <Dialog open={deleteTarget != null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            {deleteTarget?.kind === "service"
              ? `Delete service “${deleteTarget.row.name}”? This cannot be undone.`
              : deleteTarget?.kind === "extra"
                ? `Delete extra “${deleteTarget.row.name}”? This cannot be undone.`
                : deleteTarget?.kind === "discount"
                  ? `Remove recurring discount “${deleteTarget.key}”?`
                  : deleteTarget?.kind === "tier"
                    ? `Remove cleaner tier “${deleteTarget.tier.label}”?`
                    : ""}
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleDelete()}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowMenu({
  onEdit,
  onDelete,
  onToggleActive,
  isActive,
}: {
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive?: () => void;
  isActive?: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        {onToggleActive ? (
          <DropdownMenuItem onClick={onToggleActive}>
            {isActive ? "Deactivate" : "Activate"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TabHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">{title}</p>
      {action}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
    >
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function BasePricingTab({
  services,
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  services: PricingServiceRow[];
  onAdd: () => void;
  onEdit: (row: PricingServiceRow) => void;
  onDelete: (row: PricingServiceRow) => void;
  onToggleActive: (row: PricingServiceRow) => void;
}) {
  return (
    <div className="space-y-3">
      <TabHeader title="Checkout service lines (`pricing_services`)." action={<AddButton label="Add service" onClick={onAdd} />} />
      {services.length === 0 ? (
        <p className="text-sm text-slate-500">No services yet.</p>
      ) : (
        services.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 hover:bg-slate-50/50"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800">{item.name}</p>
              <p className="text-xs text-slate-400">
                {item.slug} · {formatDuration(item.min_hours, item.max_hours)} · /bed {formatZar(item.price_per_bedroom)} · /bath{" "}
                {formatZar(item.price_per_bathroom)}
                {!item.is_active ? " · inactive" : ""}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-base font-bold text-slate-800">{formatZar(item.base_price)}</span>
              <RowMenu
                onEdit={() => onEdit(item)}
                onDelete={() => onDelete(item)}
                onToggleActive={() => onToggleActive(item)}
                isActive={item.is_active}
              />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ExtrasTab({
  extras,
  onAdd,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  extras: PricingExtraRow[];
  onAdd: () => void;
  onEdit: (row: PricingExtraRow) => void;
  onDelete: (row: PricingExtraRow) => void;
  onToggleActive: (row: PricingExtraRow) => void;
}) {
  return (
    <div className="space-y-3">
      <TabHeader title="Booking add-ons (`pricing_extras`)." action={<AddButton label="Add extra" onClick={onAdd} />} />
      {extras.length === 0 ? (
        <p className="text-sm text-slate-500">No extras yet.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {extras.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700">{e.name}</p>
                <p className="text-xs text-slate-400 truncate">
                  {e.slug} · {e.service_type}
                  {e.is_popular ? " · popular" : ""}
                  {!e.is_active ? " · inactive" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-sm font-bold text-slate-800">{formatZar(e.price)}</span>
                <RowMenu
                  onEdit={() => onEdit(e)}
                  onDelete={() => onDelete(e)}
                  onToggleActive={() => onToggleActive(e)}
                  isActive={e.is_active}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamTab({
  extraCleanerFee,
  extraCleanerExtra,
  teamPricing,
  onEditExtraFee,
  onEditTeam,
}: {
  extraCleanerFee: number;
  extraCleanerExtra: PricingExtraRow | null;
  teamPricing: TeamPricingConfig;
  onEditExtraFee: () => void;
  onEditTeam: () => void;
}) {
  return (
    <div className="space-y-3">
      <TabHeader title="Extra cleaner surcharge and fixed team roster settings." />
      <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Extra cleaner surcharge</p>
          <p className="text-xs text-slate-400">
            {extraCleanerExtra ? "pricing_extras.extra-cleaner" : "pricing_booking_config.extra_cleaner_fee_zar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
            {formatZar(extraCleanerFee)} / cleaner
          </span>
          <button type="button" onClick={onEditExtraFee} className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3 bg-slate-50/50">
        <div>
          <p className="text-sm font-semibold text-slate-800">{teamPricing.label}</p>
          <p className="text-xs text-slate-400">
            {teamPricing.team_member_count} cleaners · {teamPricing.notes}
          </p>
        </div>
        <button type="button" onClick={onEditTeam} className="rounded-lg p-1.5 text-slate-300 hover:bg-blue-50 hover:text-blue-600">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CleanerCountTab({
  referenceBasePrice,
  tiers,
  tiersAreCustom,
  onAdd,
  onEdit,
  onDelete,
  onResetToComputed,
}: {
  referenceBasePrice: number;
  tiers: CleanerPricingTier[];
  tiersAreCustom: boolean;
  onAdd: () => void;
  onEdit: (tier: CleanerPricingTier) => void;
  onDelete: (tier: CleanerPricingTier) => void;
  onResetToComputed: () => void;
}) {
  return (
    <div className="space-y-3">
      <TabHeader
        title={`Cleaner surcharges (standard base ${formatZar(referenceBasePrice)}).`}
        action={
          <div className="flex gap-2">
            {!tiersAreCustom ? (
              <button
                type="button"
                onClick={onResetToComputed}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Save computed tiers
              </button>
            ) : null}
            <AddButton label="Add tier" onClick={onAdd} />
          </div>
        }
      />
      {!tiersAreCustom ? (
        <p className="text-xs text-amber-700 rounded-lg bg-amber-50 px-3 py-2">
          Showing computed tiers from the extra-cleaner fee. Edit or add tiers to store custom values.
        </p>
      ) : null}
      {tiers.map((tier) => {
        const total = referenceBasePrice + tier.surcharge_zar;
        return (
          <div key={tier.id} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{tier.label}</p>
              <p className="text-xs text-slate-400">
                {tier.cleaner_count} cleaner{tier.cleaner_count > 1 ? "s" : ""} · surcharge {formatZar(tier.surcharge_zar)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-800">{formatZar(total)} total base</span>
              <RowMenu onEdit={() => onEdit(tier)} onDelete={() => onDelete(tier)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DiscountsTab({
  entries,
  onAdd,
  onEdit,
  onDelete,
}: {
  entries: [string, RecurringDiscountRule][];
  onAdd: () => void;
  onEdit: (key: string, rule: RecurringDiscountRule) => void;
  onDelete: (key: string) => void;
}) {
  return (
    <div className="space-y-3">
      <TabHeader title="Recurring plan discounts (`pricing_booking_config`)." action={<AddButton label="Add discount" onClick={onAdd} />} />
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No recurring discounts configured.</p>
      ) : (
        entries.map(([key, rule]) => (
          <div key={key} className="flex items-center justify-between rounded-xl border border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold capitalize text-slate-800">{key.replace(/_/g, " ")}</p>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                {formatDiscount(rule)} off
              </span>
              <RowMenu onEdit={() => onEdit(key, rule)} onDelete={() => onDelete(key)} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ServiceDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: PricingServiceRow | null;
  onClose: () => void;
  onSaved: (row: PricingServiceRow) => void;
}) {
  const isNew = initial == null;
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [basePrice, setBasePrice] = useState("0");
  const [bed, setBed] = useState("0");
  const [bath, setBath] = useState("0");
  const [minH, setMinH] = useState("2");
  const [maxH, setMaxH] = useState("8");
  const [sortOrder, setSortOrder] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSlug(initial?.slug ?? "");
    setName(initial?.name ?? "");
    setBasePrice(String(initial?.base_price ?? 0));
    setBed(String(initial?.price_per_bedroom ?? 0));
    setBath(String(initial?.price_per_bathroom ?? 0));
    setMinH(String(initial?.min_hours ?? 2));
    setMaxH(String(initial?.max_hours ?? 8));
    setSortOrder(String(initial?.sort_order ?? 0));
    setActive(initial?.is_active ?? true);
  }, [open, initial]);

  async function submit() {
    const payload = {
      slug: normalizeCatalogSlug(slug),
      name: name.trim(),
      base_price: Math.max(0, Math.round(Number(basePrice) || 0)),
      price_per_bedroom: Math.max(0, Math.round(Number(bed) || 0)),
      price_per_bathroom: Math.max(0, Math.round(Number(bath) || 0)),
      min_hours: Number(minH) || 2,
      max_hours: Number(maxH) || 8,
      sort_order: Math.round(Number(sortOrder) || 0),
      is_active: active,
    };
    if (!payload.slug || !payload.name) {
      emitAdminToast("Slug and name are required.", "error");
      return;
    }

    setBusy(true);
    const res = isNew
      ? await adminFetch<{ service?: PricingServiceRow }>("/api/admin/pricing-services", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      : await adminFetch<{ service?: PricingServiceRow }>("/api/admin/pricing-services", {
          method: "PATCH",
          body: JSON.stringify({ id: initial!.id, ...payload }),
        });
    setBusy(false);

    if (!res.ok) {
      emitAdminToast(res.error ?? "Save failed", "error");
      return;
    }

    emitAdminToast(isNew ? "Service created" : "Service updated", "success");
    if (isNew && res.data?.service) onSaved(res.data.service);
    else if (!isNew && initial) onSaved({ ...initial, ...payload });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add service" : "Edit service"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-xs font-semibold text-slate-600">
            Name
            <input className={cn(inputClassName(), "mt-1")} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="sm:col-span-2 text-xs font-semibold text-slate-600">
            Slug
            <input className={cn(inputClassName(), "mt-1")} value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Base price (ZAR)
            <input className={cn(inputClassName(), "mt-1")} type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Sort order
            <input className={cn(inputClassName(), "mt-1")} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            / Bedroom
            <input className={cn(inputClassName(), "mt-1")} type="number" value={bed} onChange={(e) => setBed(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            / Bathroom
            <input className={cn(inputClassName(), "mt-1")} type="number" value={bath} onChange={(e) => setBath(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Min hours
            <input className={cn(inputClassName(), "mt-1")} type="number" step="0.25" value={minH} onChange={(e) => setMinH(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Max hours
            <input className={cn(inputClassName(), "mt-1")} type="number" step="0.25" value={maxH} onChange={(e) => setMaxH(e.target.value)} />
          </label>
          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (visible at checkout)
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExtraDialog({
  open,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: PricingExtraRow | null;
  onClose: () => void;
  onSaved: (row: PricingExtraRow) => void;
}) {
  const isNew = initial == null;
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("0");
  const [serviceType, setServiceType] = useState("all");
  const [popular, setPopular] = useState(false);
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");

  useEffect(() => {
    if (!open) return;
    setSlug(initial?.slug ?? "");
    setName(initial?.name ?? "");
    setPrice(String(initial?.price ?? 0));
    setServiceType(initial?.service_type ?? "all");
    setPopular(initial?.is_popular ?? false);
    setActive(initial?.is_active ?? true);
    setSortOrder(String(initial?.sort_order ?? 0));
  }, [open, initial]);

  async function submit() {
    const payload = {
      slug: normalizeCatalogSlug(slug),
      name: name.trim(),
      price: Math.max(0, Math.round(Number(price) || 0)),
      service_type: serviceType,
      is_popular: popular,
      is_active: active,
      sort_order: Math.round(Number(sortOrder) || 0),
    };
    if (!payload.slug || !payload.name) {
      emitAdminToast("Slug and name are required.", "error");
      return;
    }

    setBusy(true);
    const res = isNew
      ? await adminFetch<{ extra?: PricingExtraRow }>("/api/admin/pricing-extras", {
          method: "POST",
          body: JSON.stringify(payload),
        })
      : await adminFetch<{ extra?: PricingExtraRow }>("/api/admin/pricing-extras", {
          method: "PATCH",
          body: JSON.stringify({ id: initial!.id, ...payload }),
        });
    setBusy(false);

    if (!res.ok) {
      emitAdminToast(res.error ?? "Save failed", "error");
      return;
    }

    emitAdminToast(isNew ? "Extra created" : "Extra updated", "success");
    if (isNew && res.data?.extra) onSaved(res.data.extra);
    else if (!isNew && initial) onSaved({ ...initial, ...payload });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add extra" : "Edit extra"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 text-xs font-semibold text-slate-600">
            Name
            <input className={cn(inputClassName(), "mt-1")} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="sm:col-span-2 text-xs font-semibold text-slate-600">
            Slug
            <input className={cn(inputClassName(), "mt-1")} value={slug} onChange={(e) => setSlug(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Price (ZAR)
            <input className={cn(inputClassName(), "mt-1")} type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Service type
            <select className={cn(inputClassName(), "mt-1")} value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
              <option value="light">light</option>
              <option value="heavy">heavy</option>
              <option value="all">all</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Sort order
            <input className={cn(inputClassName(), "mt-1")} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
          <div className="sm:col-span-2 space-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={popular} onChange={(e) => setPopular(e.target.checked)} /> Popular
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
          </div>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DiscountDialog({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: { key: string; rule: RecurringDiscountRule } | null;
  onClose: () => void;
  onSave: (key: string, rule: RecurringDiscountRule) => Promise<void>;
}) {
  const isNew = initial == null;
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [type, setType] = useState<"percent" | "fixed">("percent");
  const [value, setValue] = useState("0");

  useEffect(() => {
    if (!open) return;
    setKey(initial?.key ?? "");
    setType(initial?.rule.type ?? "percent");
    setValue(String(initial?.rule.value ?? 0));
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add recurring discount" : "Edit recurring discount"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Frequency key (e.g. weekly)
            <input
              className={cn(inputClassName(), "mt-1")}
              value={key}
              disabled={!isNew}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Type
            <select className={cn(inputClassName(), "mt-1")} value={type} onChange={(e) => setType(e.target.value as "percent" | "fixed")}>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed ZAR</option>
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Value
            <input className={cn(inputClassName(), "mt-1")} type="number" value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const freq = normalizeCatalogSlug(key).replace(/-/g, "_");
              const n = Math.max(0, Math.round(Number(value) || 0));
              if (!freq) {
                emitAdminToast("Frequency key required.", "error");
                return;
              }
              setBusy(true);
              void onSave(freq, { type, value: n }).finally(() => setBusy(false));
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TierDialog({
  open,
  initial,
  existingCounts,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: CleanerPricingTier | null;
  existingCounts: number[];
  onClose: () => void;
  onSave: (tier: CleanerPricingTier) => Promise<void>;
}) {
  const isNew = initial == null;
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState("1");
  const [surcharge, setSurcharge] = useState("0");

  useEffect(() => {
    if (!open) return;
    setLabel(initial?.label ?? "");
    setCount(String(initial?.cleaner_count ?? 1));
    setSurcharge(String(initial?.surcharge_zar ?? 0));
  }, [open, initial]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add cleaner tier" : "Edit cleaner tier"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Label
            <input className={cn(inputClassName(), "mt-1")} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Cleaner count
            <input className={cn(inputClassName(), "mt-1")} type="number" min={1} max={10} value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Surcharge (ZAR on top of service base)
            <input className={cn(inputClassName(), "mt-1")} type="number" value={surcharge} onChange={(e) => setSurcharge(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const cleaner_count = Math.max(1, Math.min(10, Math.round(Number(count) || 1)));
              if (!label.trim()) {
                emitAdminToast("Label required.", "error");
                return;
              }
              if (isNew && existingCounts.includes(cleaner_count)) {
                emitAdminToast("A tier with that cleaner count already exists.", "error");
                return;
              }
              const tier: CleanerPricingTier = {
                id: initial?.id ?? newTierId(),
                label: label.trim(),
                cleaner_count,
                surcharge_zar: Math.max(0, Math.round(Number(surcharge) || 0)),
              };
              setBusy(true);
              void onSave(tier).finally(() => setBusy(false));
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamDialog({
  open,
  teamPricing,
  extraCleanerFee,
  hasExtraRow,
  onClose,
  onSave,
}: {
  open: boolean;
  teamPricing: TeamPricingConfig;
  extraCleanerFee: number;
  hasExtraRow: boolean;
  onClose: () => void;
  onSave: (team: TeamPricingConfig, fee: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [count, setCount] = useState("3");
  const [notes, setNotes] = useState("");
  const [fee, setFee] = useState("0");

  useEffect(() => {
    if (!open) return;
    setLabel(teamPricing.label);
    setCount(String(teamPricing.team_member_count));
    setNotes(teamPricing.notes);
    setFee(String(extraCleanerFee));
  }, [open, teamPricing, extraCleanerFee]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit team pricing</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-slate-600">
            Team label
            <input className={cn(inputClassName(), "mt-1")} value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Team member count
            <input className={cn(inputClassName(), "mt-1")} type="number" min={1} max={15} value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Notes
            <textarea className={cn(inputClassName(), "mt-1 min-h-[80px]")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Extra cleaner fee (ZAR){hasExtraRow ? " — updates extra-cleaner row" : ""}
            <input className={cn(inputClassName(), "mt-1")} type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
          </label>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!label.trim()) {
                emitAdminToast("Team label required.", "error");
                return;
              }
              setBusy(true);
              void onSave(
                {
                  label: label.trim(),
                  team_member_count: Math.max(1, Math.min(15, Math.round(Number(count) || 3))),
                  notes: notes.trim(),
                },
                Math.max(0, Math.round(Number(fee) || 0)),
              ).finally(() => setBusy(false));
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
