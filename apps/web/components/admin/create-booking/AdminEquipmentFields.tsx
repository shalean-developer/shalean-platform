"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";

const OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

export type AdminEquipmentAddressParts = {
  address: string;
  suburb: string;
  city?: string;
  postalCode?: string;
};

export type AdminEquipmentFieldsValue = {
  equipmentRequired: "yes" | "no" | "";
  equipmentQuote: EquipmentQuoteResult | null;
  equipmentFeeOverrideZar: string;
  equipmentOverrideReason: string;
};

type Props = {
  visible: boolean;
  addressParts: AdminEquipmentAddressParts | null;
  value: AdminEquipmentFieldsValue;
  onChange: (next: AdminEquipmentFieldsValue) => void;
  onSuggestedFeeChange?: (feeZar: number | null) => void;
};

export function AdminEquipmentFields({
  visible,
  addressParts,
  value,
  onChange,
  onSuggestedFeeChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const canQuote = Boolean(
    addressParts &&
      addressParts.address.trim().length >= 5 &&
      addressParts.suburb.trim().length >= 2,
  );

  useEffect(() => {
    if (!visible) return;

    if (value.equipmentRequired !== "yes") {
      onChange({ ...value, equipmentQuote: null });
      onSuggestedFeeChange?.(null);
      setError(null);
      abortRef.current?.abort();
      return;
    }

    if (!canQuote || !addressParts) {
      onChange({ ...value, equipmentQuote: null });
      onSuggestedFeeChange?.(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/booking-v2/equipment-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address: addressParts.address.trim(),
            suburb: addressParts.suburb.trim(),
            city: addressParts.city?.trim() || "Cape Town",
            postalCode: addressParts.postalCode?.trim() || "",
            equipmentRequired: true,
          }),
          signal: controller.signal,
        });
        const json = (await res.json()) as { quote?: EquipmentQuoteResult | null; error?: string };
        if (!res.ok) {
          setError(json.error ?? "Could not calculate equipment fee.");
          onChange({ ...value, equipmentQuote: null });
          onSuggestedFeeChange?.(null);
          return;
        }
        const quote = json.quote ?? null;
        onChange({ ...value, equipmentQuote: quote });
        onSuggestedFeeChange?.(
          quote && !quote.manual_quote_required ? quote.logistics_fee : null,
        );
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError("Could not calculate equipment fee.");
        onChange({ ...value, equipmentQuote: null });
        onSuggestedFeeChange?.(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 400);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- value/onChange intentionally scoped per fetch cycle
  }, [visible, value.equipmentRequired, addressParts?.address, addressParts?.suburb, addressParts?.city, addressParts?.postalCode, canQuote]);

  if (!visible) return null;

  const overrideNum = Number(value.equipmentFeeOverrideZar);
  const computedFee = value.equipmentQuote?.manual_quote_required
    ? 0
    : value.equipmentQuote?.logistics_fee ?? 0;
  const effectiveFee =
    value.equipmentFeeOverrideZar.trim() !== "" && Number.isFinite(overrideNum)
      ? Math.round(overrideNum)
      : computedFee;
  const overrideDiffers =
    value.equipmentFeeOverrideZar.trim() !== "" &&
    Number.isFinite(overrideNum) &&
    overrideNum !== computedFee;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div>
        <p className="text-sm font-semibold text-slate-800">Equipment delivery</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Charged based on distance from the equipment base. Minimum fee applies.
        </p>
      </div>

      <div className="flex gap-2">
        {OPTIONS.map((opt) => {
          const selected = value.equipmentRequired === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  equipmentRequired: opt.value,
                  equipmentQuote: null,
                  equipmentFeeOverrideZar: "",
                  equipmentOverrideReason: "",
                })
              }
              className={cn(
                "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition",
                selected
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {value.equipmentRequired === "yes" && !canQuote && (
        <p className="text-xs text-amber-700">Select or enter a full address to calculate the fee.</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Calculating…
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {value.equipmentRequired === "yes" && value.equipmentQuote?.manual_quote_required && !loading && (
        <p className="text-sm text-amber-800">{value.equipmentQuote.manual_quote_message}</p>
      )}

      {value.equipmentRequired === "yes" &&
        value.equipmentQuote &&
        !value.equipmentQuote.manual_quote_required &&
        !loading && (
          <p className="text-sm text-slate-700">
            Computed fee: R{effectiveFee.toLocaleString("en-ZA")} ({value.equipmentQuote.distance_km} km)
          </p>
        )}

      {value.equipmentRequired === "yes" && value.equipmentQuote && !value.equipmentQuote.manual_quote_required && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-600">
            Override equipment fee (ZAR, optional)
            <input
              type="number"
              min={0}
              value={value.equipmentFeeOverrideZar}
              onChange={(e) => onChange({ ...value, equipmentFeeOverrideZar: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder={String(computedFee)}
            />
          </label>
          {overrideDiffers && (
            <label className="block text-xs font-medium text-slate-600">
              Override reason (required)
              <input
                type="text"
                value={value.equipmentOverrideReason}
                onChange={(e) => onChange({ ...value, equipmentOverrideReason: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Why is the fee different?"
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

export function resolveAdminEquipmentLogisticsFee(value: AdminEquipmentFieldsValue): number {
  if (value.equipmentRequired !== "yes") return 0;
  const override = Number(value.equipmentFeeOverrideZar);
  if (value.equipmentFeeOverrideZar.trim() !== "" && Number.isFinite(override) && override >= 0) {
    return Math.round(override);
  }
  if (value.equipmentQuote?.manual_quote_required) return 0;
  return value.equipmentQuote?.logistics_fee ?? 0;
}
