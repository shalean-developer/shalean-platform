"use client";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type SettlementMethod = "cash" | "eft" | "zoho";

type Props = {
  method: SettlementMethod;
  reference: string;
  disabled?: boolean;
  onMethodChange: (next: SettlementMethod) => void;
  onReferenceChange: (next: string) => void;
};

export function AdminPaymentAlreadyReceivedFields({
  method,
  reference,
  disabled = false,
  onMethodChange,
  onReferenceChange,
}: Props) {
  const referenceRequired = method === "eft" || method === "zoho";

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">How was payment received?</Label>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "cash", label: "Cash" },
              { id: "eft", label: "EFT" },
              { id: "zoho", label: "External / Zoho" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                method === opt.id
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200",
                disabled && "cursor-not-allowed opacity-60",
              )}
              onClick={() => onMethodChange(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Reference {referenceRequired ? "(required)" : "(optional)"}
        </span>
        <input
          type="text"
          disabled={disabled}
          value={reference}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder={method === "eft" ? "Bank reference / EFT memo" : method === "zoho" ? "Zoho invoice / external ref" : "Optional note"}
          className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          maxLength={500}
        />
      </label>
    </div>
  );
}
