"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export type VoucherInputProps = {
  onApply?: (code: string) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
};

export function VoucherInput({ onApply, disabled, className }: VoucherInputProps) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const apply = useCallback(async () => {
    const t = code.trim();
    if (!t) return;
    setBusy(true);
    setMsg(null);
    try {
      if (onApply) await onApply(t);
      else setMsg("Promo codes are validated at payment.");
    } catch {
      setMsg("Could not apply code.");
    } finally {
      setBusy(false);
    }
  }, [code, onApply]);

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor="checkout-voucher" className="text-sm font-medium text-gray-900 dark:text-zinc-200">
        Apply a voucher
      </label>
      <div className="flex gap-2">
        <input
          id="checkout-voucher"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Code"
          className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-blue-500"
          disabled={disabled || busy}
          suppressHydrationWarning
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={disabled || busy || !code.trim()}
          className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50"
          suppressHydrationWarning
        >
          {busy ? "…" : "Apply"}
        </button>
      </div>
      {msg ? <p className="text-xs text-gray-500 dark:text-zinc-400">{msg}</p> : null}
    </div>
  );
}
