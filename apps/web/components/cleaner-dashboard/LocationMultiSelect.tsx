"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type LocationMultiSelectProps = {
  id?: string;
  value: string[];
  onChange: (next: string[]) => void;
  options: readonly string[];
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  helperText?: string;
  className?: string;
};

export function LocationMultiSelect({
  id,
  value,
  onChange,
  options,
  max = 3,
  placeholder = "Search areas…",
  disabled = false,
  helperText,
  className,
}: LocationMultiSelectProps) {
  const autoId = useId();
  const inputId = id ?? `${autoId}-input`;
  const listId = `${autoId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options.filter((loc) => {
      if (!q) return true;
      return loc.toLowerCase().includes(q);
    });
  }, [options, query]);

  const atMax = value.length >= max;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggleArea = useCallback(
    (loc: string) => {
      if (disabled) return;
      if (value.includes(loc)) {
        onChange(value.filter((x) => x !== loc));
        return;
      }
      if (value.length >= max) return;
      const next = [...value, loc];
      onChange(next);
      if (next.length >= max) setOpen(false);
    },
    [disabled, max, onChange, value],
  );

  const removeChip = useCallback(
    (loc: string) => {
      if (disabled) return;
      onChange(value.filter((x) => x !== loc));
    },
    [disabled, onChange, value],
  );

  return (
    <div ref={rootRef} className={cn("w-full space-y-2", className)}>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label="Selected areas">
          {value.map((loc) => (
            <span
              key={loc}
              className="inline-flex max-w-full items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              <span className="truncate">{loc}</span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${loc}`}
                className="shrink-0 rounded-md p-0.5 text-primary/70 transition hover:bg-primary/20 hover:text-primary disabled:pointer-events-none"
                onClick={() => removeChip(loc)}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <input
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!disabled) setOpen(true);
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onClick={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "h-11 w-full rounded-xl border border-input bg-white px-3 text-sm text-foreground shadow-sm outline-none transition-[box-shadow,border-color]",
            "placeholder:text-muted-foreground dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50",
            "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
            disabled && "cursor-not-allowed opacity-60",
          )}
        />

        {open && !disabled ? (
          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            className={cn(
              "absolute left-0 right-0 top-full z-[60] mt-2 max-h-56 min-h-0 overflow-y-auto overscroll-y-contain",
              "rounded-xl border border-zinc-200 bg-white py-0.5 text-foreground shadow-lg ring-1 ring-black/[0.06]",
              "dark:border-zinc-700 dark:bg-zinc-950 dark:ring-white/[0.08]",
              "touch-pan-y",
            )}
          >
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs leading-relaxed text-muted-foreground">No matching areas.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((loc) => {
                  const isSelected = value.includes(loc);
                  const rowDisabled = disabled || (!isSelected && atMax);
                  return (
                    <li key={loc}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={rowDisabled}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors",
                          isSelected
                            ? "bg-primary/10 text-foreground"
                            : "bg-white text-foreground hover:bg-zinc-100 active:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:active:bg-zinc-900",
                          rowDisabled && !isSelected && "cursor-not-allowed opacity-50 hover:bg-transparent",
                        )}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleArea(loc)}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate font-medium">{loc}</span>
                        </span>
                        <span
                          className={cn(
                            "flex size-7 shrink-0 items-center justify-center rounded-md border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                          aria-hidden
                        >
                          {isSelected ? <Check className="size-4" strokeWidth={2.5} /> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {value.length}/{max} selected
        </span>
        {helperText ? <span className="text-right leading-snug">{helperText}</span> : null}
      </div>
    </div>
  );
}
