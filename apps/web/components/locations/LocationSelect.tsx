"use client";

import { useRouter } from "next/navigation";
import { Check, Loader2, MapPin, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  BOOKING_LOCATION_CATALOG,
  type BookingLocationRecord,
  locationCleaningServicesHref,
} from "@/lib/locations/seoBookingLocations";
import { findNearestBookingLocation } from "@/lib/locations/seoLocationGeo";
import { readRecentSeoLocation, writeRecentSeoLocation } from "@/lib/locations/seoLocationRecent";
import {
  filterBookingLocations,
  flattenGrouped,
  fuzzyBookingLocationSuggestions,
  groupBookingLocations,
} from "@/lib/locations/seoLocationSearch";

const SEARCH_DEBOUNCE_MS = 180;

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

function useIsMobile(breakpointPx = 768): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx - 1}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpointPx]);
  return mobile;
}

export type LocationSelectProps = {
  className?: string;
  /** Navigate to `/locations/{slug}-cleaning-services` after pick. Default true. */
  navigateOnSelect?: boolean;
  onLocationPick?: (loc: BookingLocationRecord) => void;
  inputId?: string;
  /** Optional label above field */
  label?: string;
};

export function LocationSelect({
  className,
  navigateOnSelect = true,
  onLocationPick,
  inputId: inputIdProp,
  label = "Find your area",
}: LocationSelectProps) {
  const router = useRouter();
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const inputId = inputIdProp ?? `${reactId}-input`;

  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [committed, setCommitted] = useState<BookingLocationRecord | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMessage, setGeoMessage] = useState<string | null>(null);

  const debouncedDraft = useDebouncedValue(draft, SEARCH_DEBOUNCE_MS);

  const filtered = useMemo(
    () => filterBookingLocations(debouncedDraft, BOOKING_LOCATION_CATALOG),
    [debouncedDraft],
  );

  const showFuzzy = debouncedDraft.trim().length > 0 && filtered.length === 0;
  const fuzzyRows = useMemo(
    () => (showFuzzy ? fuzzyBookingLocationSuggestions(debouncedDraft, 5) : []),
    [showFuzzy, debouncedDraft],
  );

  const grouped = useMemo(() => {
    if (showFuzzy) {
      return [{ regionDisplay: "Close matches", items: fuzzyRows }];
    }
    return groupBookingLocations(filtered);
  }, [filtered, fuzzyRows, showFuzzy]);

  const flatList = useMemo(() => flattenGrouped(grouped), [grouped]);

  useLayoutEffect(() => {
    if (highlightedIndex >= flatList.length) {
      setHighlightedIndex(Math.max(0, flatList.length - 1));
    }
  }, [flatList.length, highlightedIndex]);

  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useLayoutEffect(() => {
    itemRefs.current.length = flatList.length;
  }, [flatList.length]);
  useLayoutEffect(() => {
    const el = itemRefs.current[highlightedIndex];
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlightedIndex, open, flatList.length]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [debouncedDraft]);

  const [recentSuggest, setRecentSuggest] = useState<BookingLocationRecord | null>(null);

  useEffect(() => {
    const r = readRecentSeoLocation();
    if (!r) return;
    const hit =
      BOOKING_LOCATION_CATALOG.find((l) => l.slug === r.slug || l.seoSlug === r.seoSlug) ?? null;
    if (!hit) return;
    setRecentSuggest(hit);
    setCommitted(hit);
    setDraft(hit.label);
  }, []);

  const indexBySlug = useMemo(() => {
    const m = new Map<string, number>();
    flatList.forEach((loc, i) => m.set(loc.slug, i));
    return m;
  }, [flatList]);

  useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isMobile]);

  const pick = useCallback(
    (loc: BookingLocationRecord) => {
      setCommitted(loc);
      setDraft(loc.label);
      setOpen(false);
      setGeoMessage(null);
      writeRecentSeoLocation(loc);
      onLocationPick?.(loc);
      if (navigateOnSelect) {
        router.push(locationCleaningServicesHref(loc));
      }
    },
    [navigateOnSelect, onLocationPick, router],
  );

  const clear = useCallback(() => {
    setCommitted(null);
    setDraft("");
    setHighlightedIndex(0);
    setOpen(false);
  }, []);

  const onUseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoMessage("Location is not supported in this browser.");
      return;
    }
    setGeoBusy(true);
    setGeoMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        const nearest = findNearestBookingLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        if (!nearest) {
          setGeoMessage("Could not match your position to a service area.");
          return;
        }
        pick(nearest);
      },
      () => {
        setGeoBusy(false);
        setGeoMessage("We could not read your location. Check permissions and try again.");
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 12_000 },
    );
  }, [pick]);

  const close = useCallback(() => {
    setOpen(false);
    if (committed) setDraft(committed.label);
  }, [committed]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
        setOpen(true);
        setHighlightedIndex(0);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(flatList.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" && flatList[highlightedIndex]) {
        e.preventDefault();
        pick(flatList[highlightedIndex]!);
      }
    },
    [close, flatList, highlightedIndex, open, pick],
  );

  useEffect(() => {
    if (!open || isMobile) return;
    const onDoc = (ev: MouseEvent) => {
      const t = ev.target as Node;
      const root = document.getElementById(`${reactId}-root`);
      if (root && !root.contains(t)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [close, isMobile, open, reactId]);

  const listContent = (
    <div
      id={listboxId}
      role="listbox"
      className={cn(
        "overflow-y-auto overscroll-contain scroll-smooth bg-white dark:bg-zinc-900",
        isMobile
          ? "max-h-[min(58vh,420px)] flex-1 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          : "max-h-80 rounded-xl border border-zinc-200 py-1 shadow-lg dark:border-zinc-700",
      )}
    >
      {grouped.map((group) => (
        <div key={group.regionDisplay} className="mb-1">
          <div
            className="sticky top-0 z-10 bg-white/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 backdrop-blur-sm dark:bg-zinc-900/95 dark:text-zinc-400"
            role="presentation"
          >
            {group.regionDisplay}
          </div>
          <div className="space-y-0.5">
            {group.items.map((loc) => {
              const idx = indexBySlug.get(loc.slug) ?? 0;
              const active = idx === highlightedIndex;
              const isSel = committed?.slug === loc.slug;
              return (
                <button
                  key={loc.slug}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  id={`${reactId}-opt-${idx}`}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  onClick={() => pick(loc)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-3.5 text-left text-base transition-colors md:py-2.5 md:text-sm",
                    "min-h-[48px] md:min-h-0",
                    active ? "bg-zinc-100 dark:bg-zinc-800" : "hover:bg-gray-50 dark:hover:bg-zinc-800/80",
                    isSel && "font-medium text-zinc-900 dark:text-zinc-50",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-zinc-900 dark:text-zinc-50">{loc.label}</span>
                    <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {loc.city} · {loc.region}
                    </span>
                  </span>
                  {isSel ? (
                    <Check className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <span className="h-5 w-5 shrink-0" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {showFuzzy && fuzzyRows.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">No results found.</p>
      ) : null}
    </div>
  );

  const sheet = open && isMobile && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[100] flex flex-col justify-end md:hidden" role="presentation">
          <button
            type="button"
            aria-label="Close area picker"
            className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]"
            onClick={close}
          />
          <div className="relative z-10 flex max-h-[min(88vh,640px)] flex-col rounded-t-2xl border border-b-0 border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" aria-hidden />
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <span className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Choose area</span>
              <button
                type="button"
                onClick={close}
                className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-zinc-100 px-3 pb-2 pt-1 dark:border-zinc-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                <input
                  id={`${inputId}-sheet`}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  onKeyDown={onKeyDown}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-autocomplete="list"
                  aria-controls={listboxId}
                  aria-activedescendant={flatList[highlightedIndex] ? `${reactId}-opt-${highlightedIndex}` : undefined}
                  aria-expanded={open}
                  role="combobox"
                  placeholder="Search suburbs…"
                  className="h-12 w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 pl-10 pr-10 text-base text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
                />
                {(committed || draft) ? (
                  <button
                    type="button"
                    aria-label="Clear selection"
                    onClick={clear}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/80 dark:hover:bg-zinc-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
            {listContent}
            <div className="shrink-0 border-t border-zinc-100 p-3 dark:border-zinc-800">
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-xl text-base"
                onClick={onUseLocation}
                disabled={geoBusy}
              >
                {geoBusy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="mr-2 h-4 w-4" />
                )}
                Use my current location
              </Button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div id={`${reactId}-root`} className={cn("w-full", className)}>
      {label ? (
        <label htmlFor={inputId} className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {label}
        </label>
      ) : null}

      {recentSuggest ? (
        <button
          type="button"
          onClick={() => pick(recentSuggest)}
          className="mb-2 flex w-full items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-left text-sm font-medium text-emerald-900 transition hover:border-emerald-200 hover:bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-950/50"
        >
          <span>
            Recent: <span className="font-semibold">{recentSuggest.label}</span>
          </span>
          <span className="text-xs text-emerald-700/80 dark:text-emerald-300/80">Tap to go</span>
        </button>
      ) : null}

      <div className="relative hidden md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          id={inputId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setHighlightedIndex(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open && flatList[highlightedIndex] ? `${reactId}-opt-${highlightedIndex}` : undefined}
          aria-expanded={open}
          role="combobox"
          placeholder="Search by suburb…"
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white py-2 pl-10 pr-10 text-base text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
        />
        {(committed || draft) ? (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        {open ? (
          <div className="absolute left-0 right-0 z-50 mt-1">{listContent}</div>
        ) : null}
      </div>

      <div className="flex h-12 w-full items-stretch gap-0.5 md:hidden">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            if (committed) setDraft(committed.label);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-left text-base text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <span className={cn("min-w-0 flex-1 truncate", !draft && !committed && "text-zinc-400")}>
            {committed?.label || draft || "Search by suburb…"}
          </span>
        </button>
        {(committed || draft) ? (
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clear}
            className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-2 hidden md:block">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 w-full rounded-xl sm:w-auto"
          onClick={onUseLocation}
          disabled={geoBusy}
        >
          {geoBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
          Use my current location
        </Button>
      </div>

      {geoMessage ? <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">{geoMessage}</p> : null}

      {sheet}
    </div>
  );
}
