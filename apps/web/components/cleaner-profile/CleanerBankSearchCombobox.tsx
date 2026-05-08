"use client";

import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  filterSouthAfricanBanksByQuery,
  sortSouthAfricanBanksForUi,
  type SouthAfricanBankWire,
} from "@/lib/paystack/getSouthAfricanBanks";
import { cn } from "@/lib/utils";

export type CleanerBankSearchComboboxProps = {
  value: string;
  onChange: (bankCode: string) => void;
  disabled?: boolean;
  /** When false, catalogue is not fetched (e.g. dialog closed). */
  active: boolean;
};

/**
 * Paystack-backed ZA bank picker: single `Popover` + `cmdk` `Command` (no hybrid native `<select>` / FloatingUI portal).
 * `portalled={false}` keeps the panel inside the parent `Dialog` DOM to avoid stacking / focus conflicts.
 */
export function CleanerBankSearchCombobox({ value, onChange, disabled = false, active }: CleanerBankSearchComboboxProps) {
  const reactId = useId();
  const triggerId = `${reactId}-trigger`;

  const [open, setOpen] = useState(false);
  const [banks, setBanks] = useState<SouthAfricanBankWire[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!active) {
      setCatalogStatus("idle");
      setBanks([]);
      setLoadError(null);
      setOpen(false);
      setSearchQuery("");
      return;
    }

    let cancelled = false;
    setCatalogStatus("loading");
    setLoadError(null);

    void (async () => {
      try {
        const headers = await getCleanerAuthHeaders();
        if (!headers) {
          if (!cancelled) {
            setLoadError("Not signed in.");
            setCatalogStatus("error");
          }
          return;
        }
        const res = await cleanerAuthenticatedFetch("/api/paystack/banks", { headers });
        const j = (await res.json().catch(() => ({}))) as {
          banks?: SouthAfricanBankWire[];
          error?: string;
        };
        if (!res.ok) {
          if (!cancelled) {
            setLoadError(j.error ?? "Could not load banks.");
            setCatalogStatus("error");
          }
          return;
        }
        const list = Array.isArray(j.banks) ? j.banks : [];
        if (!cancelled) {
          setBanks(sortSouthAfricanBanksForUi(list));
          setCatalogStatus(list.length > 0 ? "ready" : "error");
          if (list.length === 0) setLoadError("No banks returned.");
        }
      } catch {
        if (!cancelled) {
          setLoadError("Network error loading banks.");
          setCatalogStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const filtered = useMemo(() => {
    const hits = filterSouthAfricanBanksByQuery(banks, searchQuery);
    return sortSouthAfricanBanksForUi(hits);
  }, [banks, searchQuery]);

  const selectedLabel = useMemo(() => {
    const hit = banks.find((b) => b.code === value);
    return hit?.name ?? (value ? `Bank (${value})` : "Select bank");
  }, [banks, value]);

  const ready = catalogStatus === "ready" && banks.length > 0;
  const triggerDisabled = disabled || catalogStatus === "loading" || !ready;

  useEffect(() => {
    if (!ready) setOpen(false);
  }, [ready]);

  const pick = useCallback(
    (code: string) => {
      onChange(code);
      setOpen(false);
      setSearchQuery("");
    },
    [onChange],
  );

  return (
    <div className="w-full space-y-1.5">
      <Label htmlFor={triggerId} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Bank
      </Label>

      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!ready) return;
          setOpen(next);
          if (!next) setSearchQuery("");
        }}
        modal={false}
      >
        <div className="relative w-full">
          <PopoverTrigger asChild>
            <button
              type="button"
              id={triggerId}
              disabled={triggerDisabled}
              aria-expanded={open}
              aria-haspopup="dialog"
              className={cn(
                "relative flex h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-base shadow-sm transition-[border-color,box-shadow,background-color]",
                "border-zinc-200 bg-white text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100",
                "focus-visible:border-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-500",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {catalogStatus === "loading" ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                    Loading banks…
                  </span>
                ) : loadError ? (
                  <span className="text-destructive">{loadError}</span>
                ) : (
                  selectedLabel
                )}
              </span>
              {catalogStatus !== "loading" && !loadError ? (
                <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "-rotate-180")} aria-hidden />
              ) : null}
            </button>
          </PopoverTrigger>

          <PopoverContent
            portalled={false}
            align="start"
            side="bottom"
            sideOffset={8}
            collisionPadding={16}
            avoidCollisions
            className="w-full max-w-none border-zinc-200 p-0 shadow-xl dark:border-zinc-700"
            aria-label="South African banks"
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            <Command shouldFilter={false} loop>
              <CommandInput
                ref={searchInputRef}
                placeholder="Search bank name or code…"
                value={searchQuery}
                onValueChange={setSearchQuery}
                aria-label="Filter banks"
              />
              <CommandList>
                <CommandEmpty>No banks match your search.</CommandEmpty>
                {filtered.map((b) => {
                  const selected = b.code === value;
                  return (
                    <CommandItem
                      key={b.code}
                      value={`${b.name} ${b.code}`}
                      keywords={[b.name, b.code]}
                      onSelect={() => pick(b.code)}
                      className="cursor-pointer"
                    >
                      <div className="flex w-full items-start gap-2">
                        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden>
                          {selected ? (
                            <>
                              <Check className="size-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
                              <span className="sr-only">Selected</span>
                            </>
                          ) : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-medium leading-snug">{b.name}</span>
                          <span className="block text-xs tabular-nums text-muted-foreground">{b.code}</span>
                        </div>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </div>
      </Popover>
    </div>
  );
}
