"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useFormContext, Controller } from "react-hook-form";
import { Home, MapPin, Phone, UserRound, ChevronDown, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getUser } from "@/lib/auth/authClient";
import { useUser } from "@/hooks/useUser";
import { useAddresses } from "@/hooks/useAddresses";
import type { CustomerAddressRow } from "@/lib/dashboard/types";
import type { BookingV2FormData } from "@/src/features/booking-v2/types";
import {
  CONTACT_PHONE_VALIDATION_MESSAGE,
  isValidContactPhone,
} from "@/lib/booking/contactPhoneValidation";
import { getBookingLocationOptions } from "@/lib/locations/bookingLocations";
import { useBookingV2LocationResolve } from "@/lib/booking-v2/useBookingV2LocationResolve";

const contactPhoneRules = {
  required: "Enter a contact phone number",
  validate: (value: string) => isValidContactPhone(value) || CONTACT_PHONE_VALIDATION_MESSAGE,
} as const;

type AddressMode = "saved" | "custom";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-500">{message}</p>;
}

function FieldLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
      {required ? <span className="ml-1 text-red-500">*</span> : null}
    </label>
  );
}

function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = "Select…",
  error,
}: {
  id: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const filtered = useMemo(
    () =>
      query.trim() === ""
        ? options
        : options.filter((o) => o.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between rounded-xl border bg-white px-4 py-2.5 text-sm shadow-sm transition",
          open ? "border-blue-500 ring-2 ring-blue-500/20" : "border-slate-200 hover:border-slate-300",
          error && "border-red-400",
        )}
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>{value || placeholder}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search suburb…"
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
            />
            {query ? (
              <button type="button" onClick={() => setQuery("")}>
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
              </button>
            ) : null}
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No suburbs found</p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition",
                      isSelected
                        ? "bg-blue-50 font-medium text-blue-700"
                        : "text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {opt}
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-blue-600" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatSavedAddressLine(addr: CustomerAddressRow): string {
  const parts = [addr.suburb, addr.city, addr.postal_code].map((p) => (p ?? "").trim()).filter(Boolean);
  return parts.join(", ");
}

export function PropertyAddressSection() {
  const { user, loading: userLoading } = useUser();
  const { addresses, loading: addressesLoading } = useAddresses();
  const {
    register,
    control,
    formState: { errors },
    setValue,
    getValues,
    watch,
  } = useFormContext<BookingV2FormData>();

  const [addressMode, setAddressMode] = useState<AddressMode>("custom");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const savedAddresses = addresses;
  const hasSavedAddresses = savedAddresses.length > 0;
  const selectedAddress = useMemo(
    () => savedAddresses.find((a) => a.id === selectedAddressId) ?? null,
    [savedAddresses, selectedAddressId],
  );

  const applySavedAddress = useCallback(
    (addr: CustomerAddressRow) => {
      setValue("address", addr.line1.trim(), { shouldDirty: false, shouldValidate: true });
      setValue("suburb", addr.suburb.trim(), { shouldDirty: false, shouldValidate: true });
      setValue("city", addr.city?.trim() || "Cape Town", { shouldDirty: false });
      setValue("postalCode", addr.postal_code?.trim() || "", { shouldDirty: false });
      if (addr.notes?.trim() && !getValues("accessInstructions")?.trim()) {
        setValue("accessInstructions", addr.notes.trim(), { shouldDirty: false });
      }
      setSelectedAddressId(addr.id);
    },
    [getValues, setValue],
  );

  const switchToCustom = useCallback(() => {
    setAddressMode("custom");
    setSelectedAddressId(null);
  }, []);

  const switchToSaved = useCallback(
    (addr?: CustomerAddressRow) => {
      const pick = addr ?? savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
      if (!pick) return;
      setAddressMode("saved");
      applySavedAddress(pick);
    },
    [applySavedAddress, savedAddresses],
  );

  const startBookForSomeoneElse = useCallback(() => {
    setAddressMode("custom");
    setSelectedAddressId(null);
    setValue("address", "", { shouldDirty: true, shouldValidate: true });
    setValue("suburb", "", { shouldDirty: true, shouldValidate: true });
    setValue("serviceAreaLocationId", "", { shouldDirty: true });
    setValue("serviceAreaCityId", "", { shouldDirty: true });
    setValue("city", "Cape Town", { shouldDirty: true });
    setValue("postalCode", "", { shouldDirty: true });
  }, [setValue]);

  useEffect(() => {
    let cancelled = false;
    void getUser().then((authUser) => {
      if (cancelled || !authUser) return;
      if (getValues("contactPhone")?.trim()) return;
      const meta = authUser.user_metadata as { phone?: string; whatsapp?: string } | undefined;
      const fromMeta = meta?.phone?.trim() || meta?.whatsapp?.trim() || "";
      if (isValidContactPhone(fromMeta)) setValue("contactPhone", fromMeta, { shouldDirty: false });
    });
    return () => {
      cancelled = true;
    };
  }, [getValues, setValue]);

  useEffect(() => {
    if (userLoading || addressesLoading || prefilled) return;
    if (!user || !hasSavedAddresses) {
      setPrefilled(true);
      return;
    }

    const existingAddress = getValues("address")?.trim();
    const existingSuburb = getValues("suburb")?.trim();
    if (existingAddress && existingSuburb) {
      const match = savedAddresses.find(
        (a) =>
          a.line1.trim().toLowerCase() === existingAddress.toLowerCase() &&
          a.suburb.trim().toLowerCase() === existingSuburb.toLowerCase(),
      );
      if (match) {
        setAddressMode("saved");
        setSelectedAddressId(match.id);
      }
      setPrefilled(true);
      return;
    }

    const defaultAddr = savedAddresses.find((a) => a.is_default) ?? savedAddresses[0];
    if (defaultAddr) {
      setAddressMode("saved");
      applySavedAddress(defaultAddr);
    }
    setPrefilled(true);
  }, [
    userLoading,
    addressesLoading,
    prefilled,
    user,
    hasSavedAddresses,
    savedAddresses,
    getValues,
    applySavedAddress,
  ]);

  const showSavedMode = Boolean(user && hasSavedAddresses && addressMode === "saved" && selectedAddress);
  const addressValue = watch("address");
  const suburbValue = watch("suburb");
  const showBookForSomeoneHint = addressMode === "custom" && !addressValue?.trim();

  const { location: resolvedLocation, loading: locationLoading, error: locationError } =
    useBookingV2LocationResolve(suburbValue ?? "");

  useEffect(() => {
    if (!suburbValue?.trim()) {
      setValue("serviceAreaLocationId", "", { shouldDirty: true });
      setValue("serviceAreaCityId", "", { shouldDirty: true });
      return;
    }
    if (resolvedLocation) {
      setValue("serviceAreaLocationId", resolvedLocation.locationId, { shouldDirty: true });
      setValue("serviceAreaCityId", resolvedLocation.cityId ?? "", { shouldDirty: true });
    } else if (!locationLoading) {
      setValue("serviceAreaLocationId", "", { shouldDirty: true });
      setValue("serviceAreaCityId", "", { shouldDirty: true });
    }
  }, [suburbValue, resolvedLocation, locationLoading, setValue]);

  return (
    <section className="space-y-4">
      <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
        Property address
      </h3>

      {userLoading || addressesLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : showSavedMode && selectedAddress ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-blue-100 bg-blue-50/80 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <Home className="h-5 w-5 text-blue-600" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  {selectedAddress.label || "Saved property"}
                  {selectedAddress.is_default ? (
                    <span className="ml-2 text-xs font-medium text-blue-700">· Primary</span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-slate-800">{selectedAddress.line1}</p>
                <p className="text-sm text-slate-600">{formatSavedAddressLine(selectedAddress)}</p>
              </div>
            </div>
          </div>

          {savedAddresses.length > 1 ? (
            <div>
              <FieldLabel htmlFor="saved-property">Saved property</FieldLabel>
              <select
                id="saved-property"
                value={selectedAddress.id}
                onChange={(e) => {
                  const next = savedAddresses.find((a) => a.id === e.target.value);
                  if (next) applySavedAddress(next);
                }}
                className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {savedAddresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {(addr.label || "Property") + " — " + addr.line1 + ", " + addr.suburb}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <FieldLabel htmlFor="contactPhone" required>
              Contact phone
            </FieldLabel>
            <div className="relative">
              <Phone
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <input
                id="contactPhone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+27 82 123 4567 or 0821234567"
                {...register("contactPhone", contactPhoneRules)}
                className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <FieldError message={errors.contactPhone?.message} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={switchToCustom}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <MapPin className="h-3.5 w-3.5 text-blue-500" />
              Use a different address
            </button>
            <button
              type="button"
              onClick={startBookForSomeoneElse}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              <UserRound className="h-3.5 w-3.5 text-violet-500" />
              Book for someone else
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {user && hasSavedAddresses ? (
            <button
              type="button"
              onClick={() => switchToSaved()}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Use a saved address from my account
            </button>
          ) : null}

          {showBookForSomeoneHint ? (
            <p className="rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-xs text-violet-900">
              Enter the visit address and contact phone for this booking.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="address" required>
                Street address
              </FieldLabel>
              <input
                id="address"
                type="text"
                placeholder="e.g. 12 Ocean View Drive"
                {...register("address", {
                  required: "Street address is required",
                  minLength: { value: 5, message: "Enter a full street address" },
                })}
                className="block w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <FieldError message={errors.address?.message} />
            </div>
            <div>
              <FieldLabel htmlFor="suburb" required>
                Suburb
              </FieldLabel>
              <Controller
                name="suburb"
                control={control}
                rules={{ required: "Suburb is required" }}
                render={({ field }) => (
                  <SearchableSelect
                    id="suburb"
                    options={getBookingLocationOptions()}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    placeholder="Select suburb…"
                    error={errors.suburb?.message}
                  />
                )}
              />
              <FieldError message={errors.suburb?.message} />
              {locationLoading && suburbValue?.trim() ? (
                <p className="mt-1 text-xs text-slate-500">Checking service area…</p>
              ) : null}
              {!locationLoading && locationError && suburbValue?.trim() ? (
                <p className="mt-1 text-xs text-red-500">{locationError}</p>
              ) : null}
            </div>
            <div>
              <FieldLabel htmlFor="contactPhone" required>
                Contact phone
              </FieldLabel>
              <div className="relative">
                <Phone
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="contactPhone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+27 82 123 4567 or 0821234567"
                  {...register("contactPhone", contactPhoneRules)}
                  className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <FieldError message={errors.contactPhone?.message} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
