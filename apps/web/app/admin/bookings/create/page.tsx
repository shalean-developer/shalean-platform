"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { BOOKING_MIN_LEAD_MINUTES, filterBookableTimeSlots, johannesburgTodayYmd } from "@/lib/dashboard/bookingSlotTimes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatInvoiceMonthLabel, previewInvoiceBucketMonth } from "@/lib/monthlyInvoice/previewInvoiceBucketMonth";
import { normalizeTimeHm } from "@/lib/admin/validateAdminBookingSlot";
import { buildAdminBookingLocationString } from "@/lib/admin/buildBookingLocationFromSavedAddress";
import { extractNotesPreviewTags } from "@/lib/admin/adminCreateBookingNotesPreview";
import { AdminPropertySelector } from "@/components/admin/create-booking/AdminPropertySelector";
import { AdminCustomerBillingSwitch } from "@/components/admin/create-booking/AdminCustomerBillingSwitch";
import type { CustomerAddressRow } from "@/lib/dashboard/types";

const LAST_BOOKING_STORAGE = "admin_create_booking_last_v1";
const LAST_SAVED_ADDRESS_KEY = "admin_create_booking_last_saved_address_v1";
const LAST_BILLING_VIEW_KEY = "admin_last_billing_view_v1";
const LAST_BILLING_VIEW_TTL_MS = 24 * 60 * 60 * 1000;

function readStoredBilling(userId: string): { billing_type: string; schedule_type: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LAST_BILLING_VIEW_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as {
      userId?: string;
      billing_type?: string;
      schedule_type?: string;
      ts?: number;
    };
    if (o.userId !== userId) return null;
    if (typeof o.billing_type !== "string" || typeof o.schedule_type !== "string") return null;
    if (typeof o.ts === "number" && Number.isFinite(o.ts) && Date.now() - o.ts > LAST_BILLING_VIEW_TTL_MS) {
      return null;
    }
    return { billing_type: o.billing_type, schedule_type: o.schedule_type };
  } catch {
    return null;
  }
}

function writeStoredBilling(userId: string, billing_type: string, schedule_type: string): void {
  try {
    window.sessionStorage.setItem(
      LAST_BILLING_VIEW_KEY,
      JSON.stringify({ userId, billing_type, schedule_type, ts: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

const SERVICE_OPTIONS: { value: BookingServiceId; label: string }[] = [
  { value: "quick", label: "Quick" },
  { value: "standard", label: "Standard" },
  { value: "airbnb", label: "Airbnb" },
  { value: "deep", label: "Deep" },
  { value: "carpet", label: "Carpet" },
  { value: "move", label: "Move-out" },
];

type CustomerHit = {
  id: string;
  email: string | null;
  full_name: string | null;
  billing_type: string;
  schedule_type: string;
};

type FormState = {
  customerQuery: string;
  selectedCustomer: CustomerHit | null;
  date: string;
  time: string;
  service: BookingServiceId;
  /** Saved `customer_saved_addresses.id`, or "" when typing a custom address. */
  savedAddressId: string;
  /** When true, `location` is typed manually; when false, a saved property supplies it. */
  useCustomAddress: boolean;
  location: string;
  notes: string;
  totalPaidZar: string;
};

function emptyForm(): FormState {
  return {
    customerQuery: "",
    selectedCustomer: null,
    date: "",
    time: "",
    service: "standard",
    savedAddressId: "",
    useCustomAddress: false,
    location: "",
    notes: "",
    totalPaidZar: "",
  };
}

function billingLabel(t: string): string {
  const x = t.toLowerCase();
  if (x === "monthly") return "Monthly";
  if (x === "per_booking") return "Per booking";
  return t || "—";
}

function scheduleLabel(t: string): string {
  const x = t.toLowerCase();
  if (x === "fixed_schedule") return "Fixed schedule";
  if (x === "on_demand") return "On-demand";
  return t || "—";
}

/** Rounded countdown for admin copy (Johannesburg absolute time is shown separately). */
function formatApproxCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "Expired";
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 1) return `Expires in ~${h}h ${m}m`;
  return `Expires in ~${m}m`;
}

function locationSnippet(s: string, max = 80): string {
  const t = s.trim();
  if (!t) return "—";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

function formatCreatedAgo(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "Created just now";
  if (mins === 1) return "Created 1 minute ago";
  if (mins < 60) return `Created ${mins} minutes ago`;
  const h = Math.floor(mins / 60);
  if (h === 1) return "Created 1 hour ago";
  return `Created ${h} hours ago`;
}

const RESEND_PRIMARY_STORAGE = "admin_resend_primary_v1";
const RESEND_PRIMARY_TTL_MS = 24 * 60 * 60 * 1000;

function resendPrimaryStorageKey(bookingId: string): string {
  return `${RESEND_PRIMARY_STORAGE}:${bookingId}`;
}

type ResendPrimaryPayload = { channel: "email" | "sms"; ts: number };

function readResendPrimaryPreference(bookingId: string): "email" | "sms" | null {
  try {
    const raw = window.sessionStorage.getItem(resendPrimaryStorageKey(bookingId));
    if (!raw) return null;
    try {
      const o = JSON.parse(raw) as Partial<ResendPrimaryPayload>;
      if (o.channel !== "email" && o.channel !== "sms") return null;
      if (typeof o.ts !== "number" || Date.now() - o.ts > RESEND_PRIMARY_TTL_MS) {
        window.sessionStorage.removeItem(resendPrimaryStorageKey(bookingId));
        return null;
      }
      return o.channel;
    } catch {
      if (raw === "email" || raw === "sms") return raw;
      return null;
    }
  } catch {
    return null;
  }
}

function writeResendPrimaryPreference(bookingId: string, channel: "email" | "sms"): void {
  try {
    const payload: ResendPrimaryPayload = { channel, ts: Date.now() };
    window.sessionStorage.setItem(resendPrimaryStorageKey(bookingId), JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

async function openAdminBookingAndCopyUrl(bookingId: string): Promise<void> {
  const path = `/admin/bookings/${bookingId}`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
  window.open(url, "_blank", "noopener,noreferrer");
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    /* ignore */
  }
}

export default function AdminCreateBookingPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [searchHits, setSearchHits] = useState<CustomerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastBookingId, setLastBookingId] = useState<string | null>(null);
  const [perBookingPay, setPerBookingPay] = useState<{ bookingId: string; url: string } | null>(null);
  const [paymentLinkMeta, setPaymentLinkMeta] = useState<{ ttlHours: number; expiresAt: string | null } | null>(null);
  const [smsTwilioHint, setSmsTwilioHint] = useState<{ preview: string; full: string } | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [duplicateExistingId, setDuplicateExistingId] = useState<string | null>(null);
  const [duplicateRecent, setDuplicateRecent] = useState(false);
  const [duplicateRaceRollback, setDuplicateRaceRollback] = useState(false);
  const [duplicateOverrideAck, setDuplicateOverrideAck] = useState(false);
  const [duplicateCreatedAt, setDuplicateCreatedAt] = useState<string | null>(null);
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState("");
  const [smsResendWarning, setSmsResendWarning] = useState<string | null>(null);
  const [resendPreferEmailOnly, setResendPreferEmailOnly] = useState(false);
  const [slotAdjustHint, setSlotAdjustHint] = useState<string | null>(null);
  const [paymentExpiryTick, setPaymentExpiryTick] = useState(0);
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddressRow[]>([]);
  const [lastVisitPriceZar, setLastVisitPriceZar] = useState<number | null>(null);
  const submitGuard = useRef(false);
  const forceDuplicateNextSubmit = useRef(false);
  /** Soft debounce: rapid resubmits of the same customer slot without force (reduces duplicate 409/log noise). */
  const lastSlotConflictSigRef = useRef<string | null>(null);
  const lastSlotConflictAtRef = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const slotAutoFixTargetRef = useRef<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const hydratedSessionAddressUserRef = useRef<string | null>(null);

  const todayJhb = useMemo(() => johannesburgTodayYmd(), []);
  const slotOptions = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date.trim())) return [];
    return filterBookableTimeSlots(form.date.trim(), { leadMinutes: BOOKING_MIN_LEAD_MINUTES });
  }, [form.date]);

  useEffect(() => {
    if (!form.date || !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return;
    if (!form.time || slotOptions.length === 0) {
      if (!form.time) {
        setSlotAdjustHint(null);
        slotAutoFixTargetRef.current = null;
      }
      return;
    }

    if (slotOptions.includes(form.time)) {
      if (slotAutoFixTargetRef.current && form.time !== slotAutoFixTargetRef.current) {
        setSlotAdjustHint(null);
        slotAutoFixTargetRef.current = null;
      }
      return;
    }

    const prev = form.time;
    const next = slotOptions.find((t) => t > prev) ?? slotOptions[0] ?? "";
    if (!next || next === prev) return;

    slotAutoFixTargetRef.current = next;
    setSlotAdjustHint(`Time adjusted to next available: ${next}`);
    setForm((s) => ({ ...s, time: next }));
  }, [form.date, form.time, slotOptions]);

  useEffect(() => {
    if (!perBookingPay?.bookingId) return;
    const ch = readResendPrimaryPreference(perBookingPay.bookingId);
    if (ch === "email") setResendPreferEmailOnly(true);
    else if (ch === "sms") setResendPreferEmailOnly(false);
  }, [perBookingPay?.bookingId]);

  const searchCustomers = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setSearchHits([]);
      return;
    }
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/bookings/customers?q=${encodeURIComponent(t)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { customers?: CustomerHit[]; error?: string };
      if (!res.ok) {
        setSearchHits([]);
        return;
      }
      setSearchHits(json.customers ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void searchCustomers(form.customerQuery), 300);
    return () => window.clearTimeout(t);
  }, [form.customerQuery, searchCustomers]);

  useEffect(() => {
    const uid = form.selectedCustomer?.id;
    if (!uid || savedAddresses.length === 0) return;
    if (hydratedSessionAddressUserRef.current === uid) return;
    try {
      const raw = window.sessionStorage.getItem(LAST_SAVED_ADDRESS_KEY);
      if (!raw) {
        hydratedSessionAddressUserRef.current = uid;
        return;
      }
      const o = JSON.parse(raw) as { userId?: string; addressId?: string };
      if (o.userId !== uid || typeof o.addressId !== "string") {
        hydratedSessionAddressUserRef.current = uid;
        return;
      }
      const row = savedAddresses.find((a) => a.id === o.addressId);
      if (!row) {
        hydratedSessionAddressUserRef.current = uid;
        return;
      }
      const savedId = row.id;
      setForm((s) => ({
        ...s,
        savedAddressId: savedId,
        location: buildAdminBookingLocationString(row),
        useCustomAddress: false,
      }));
    } catch {
      /* ignore */
    }
    hydratedSessionAddressUserRef.current = uid;
  }, [form.selectedCustomer?.id, savedAddresses]);

  useEffect(() => {
    const uid = form.selectedCustomer?.id;
    if (!uid) {
      setLastVisitPriceZar(null);
      return;
    }
    const hasAddr = Boolean(form.savedAddressId && !form.useCustomAddress);
    const loc = form.location.trim();
    if (!hasAddr && loc.length < 3) {
      setLastVisitPriceZar(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        if (!token || cancelled) return;
        let url = `/api/admin/bookings/last-visit-price?user_id=${encodeURIComponent(uid)}`;
        if (hasAddr) {
          url += `&address_id=${encodeURIComponent(form.savedAddressId)}`;
        } else {
          url += `&location=${encodeURIComponent(loc)}`;
        }
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const json = (await res.json().catch(() => ({}))) as { last_total_paid_zar?: number | null };
        if (cancelled) return;
        const z = json.last_total_paid_zar;
        const ok = typeof z === "number" && Number.isFinite(z) && z > 0;
        setLastVisitPriceZar(ok ? z : null);
        if (ok) {
          setForm((s) => (s.totalPaidZar.trim() === "" ? { ...s, totalPaidZar: String(Math.round(z)) } : s));
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [form.selectedCustomer?.id, form.savedAddressId, form.useCustomAddress, form.location]);

  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => {
      dateInputRef.current?.focus({ preventScroll: true });
    }, 80);
    return () => window.clearTimeout(id);
  }, [success]);

  useEffect(() => {
    if (!paymentLinkMeta?.expiresAt) return;
    const id = window.setInterval(() => setPaymentExpiryTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, [paymentLinkMeta?.expiresAt]);

  useEffect(() => {
    if (!paymentLinkMeta?.expiresAt) return;
    const onVis = () => {
      if (document.visibilityState === "visible") setPaymentExpiryTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [paymentLinkMeta?.expiresAt]);

  const paymentRelativeExpiry = useMemo(
    () => formatApproxCountdown(paymentLinkMeta?.expiresAt ?? null),
    [paymentLinkMeta?.expiresAt, paymentExpiryTick],
  );

  const paystackExpirySastLabel = useMemo(() => {
    if (!paymentLinkMeta?.expiresAt) return null;
    return new Intl.DateTimeFormat("en-ZA", {
      timeZone: "Africa/Johannesburg",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(paymentLinkMeta.expiresAt));
  }, [paymentLinkMeta?.expiresAt, paymentExpiryTick]);

  useEffect(() => {
    if (!duplicateExistingId) setDuplicateOverrideAck(false);
  }, [duplicateExistingId]);

  function validateForm(f: FormState): string | null {
    if (!f.selectedCustomer) return "Select an existing customer.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date.trim())) return "Pick a valid date.";
    if (f.date.trim() < todayJhb) return "Date cannot be in the past (Johannesburg).";
    if (!f.time || !/^\d{2}:\d{2}$/.test(f.time)) return "Pick a valid time.";
    if (!slotOptions.includes(f.time)) {
      return `Time must be at least ${BOOKING_MIN_LEAD_MINUTES / 60} hours from now (Johannesburg) and within business hours.`;
    }
    if (!f.location.trim()) {
      return f.useCustomAddress
        ? "Enter the service location."
        : "Select a saved property or enable “Use custom address”.";
    }
    if (f.notes.trim().length < 3) return "Notes are required (at least 3 characters).";
    const price = Number(f.totalPaidZar);
    if (!Number.isFinite(price) || price < 1 || price > 100_000) {
      return "Visit price (ZAR) must be between 1 and 100000.";
    }
    return null;
  }

  const persistLastBooking = useCallback((f: FormState) => {
    try {
      if (!f.selectedCustomer) return;
      const payload = {
        user_id: f.selectedCustomer.id,
        date: f.date.trim(),
        time: normalizeTimeHm(f.time),
        service: f.service,
        location: f.location.trim(),
        notes: f.notes.trim(),
        totalPaidZar: Number(f.totalPaidZar),
        saved_address_id: f.savedAddressId || null,
      };
      window.sessionStorage.setItem(LAST_BOOKING_STORAGE, JSON.stringify(payload));
      if (f.savedAddressId) {
        try {
          window.sessionStorage.setItem(
            LAST_SAVED_ADDRESS_KEY,
            JSON.stringify({ userId: f.selectedCustomer.id, addressId: f.savedAddressId }),
          );
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleAddressesLoaded = useCallback((rows: CustomerAddressRow[]) => {
    setSavedAddresses(rows);
  }, []);

  const handleUseCustomAddressChange = useCallback((useCustom: boolean) => {
    if (useCustom) {
      try {
        window.sessionStorage.removeItem(LAST_SAVED_ADDRESS_KEY);
      } catch {
        /* ignore */
      }
      setForm((s) => ({ ...s, useCustomAddress: true, savedAddressId: "" }));
    } else {
      setForm((s) => ({ ...s, useCustomAddress: false }));
    }
  }, []);

  const handlePropertySelected = useCallback(
    (row: CustomerAddressRow) => {
      const cust = form.selectedCustomer;
      if (!cust) return;
      const loc = buildAdminBookingLocationString(row);
      setForm((s) => ({
        ...s,
        savedAddressId: row.id,
        location: loc,
        useCustomAddress: false,
      }));
      try {
        window.sessionStorage.setItem(
          LAST_SAVED_ADDRESS_KEY,
          JSON.stringify({ userId: cust.id, addressId: row.id }),
        );
      } catch {
        /* ignore */
      }
    },
    [form.selectedCustomer],
  );

  const handleLocationInputChange = useCallback((v: string) => {
    setForm((s) => ({ ...s, location: v }));
  }, []);

  const loadLastBooking = useCallback(() => {
    try {
      const raw = window.sessionStorage.getItem(LAST_BOOKING_STORAGE);
      if (!raw) return;
      const o = JSON.parse(raw) as Record<string, unknown>;
      const userId = typeof o.user_id === "string" ? o.user_id : "";
      if (!userId) return;
      void (async () => {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        if (!token) return;
        const res = await fetch(`/api/admin/bookings/customers?id=${encodeURIComponent(userId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as { customers?: CustomerHit[] };
        const hit = (json.customers ?? []).find((c) => c.id === userId) ?? (json.customers ?? [])[0];
        if (!hit) return;
        hydratedSessionAddressUserRef.current = null;
        const storedService = (typeof o.service === "string" ? o.service : "standard") as BookingServiceId;
        const svc =
          (hit.schedule_type ?? "").toLowerCase() === "on_demand" && storedService === "standard"
            ? ("airbnb" as BookingServiceId)
            : storedService;
        const sid = typeof o.saved_address_id === "string" ? o.saved_address_id : "";
        const loc = typeof o.location === "string" ? o.location : "";
        setForm({
          customerQuery: hit.email ?? hit.full_name ?? userId,
          selectedCustomer: hit,
          date: typeof o.date === "string" ? o.date : "",
          time: normalizeTimeHm(typeof o.time === "string" ? o.time : ""),
          service: svc,
          savedAddressId: sid,
          useCustomAddress: !sid && loc.trim().length > 0,
          location: loc,
          notes: typeof o.notes === "string" ? o.notes : "",
          totalPaidZar: typeof o.totalPaidZar === "number" ? String(o.totalPaidZar) : "",
        });
      })();
    } catch {
      /* ignore */
    }
  }, []);

  const copyVisitFromLast = useCallback(() => {
    try {
      const raw = window.sessionStorage.getItem(LAST_BOOKING_STORAGE);
      if (!raw) return;
      const o = JSON.parse(raw) as Record<string, unknown>;
      setForm((s) => {
        const oloc = typeof o.location === "string" ? o.location : s.location;
        const savedFromLast = typeof o.saved_address_id === "string" ? o.saved_address_id : s.savedAddressId;
        const useCustom =
          typeof o.saved_address_id === "string" && o.saved_address_id
            ? false
            : typeof o.location === "string" && o.location.trim().length > 0
              ? true
              : s.useCustomAddress;
        return {
          ...s,
          date: typeof o.date === "string" ? o.date : s.date,
          time: normalizeTimeHm(typeof o.time === "string" ? o.time : s.time),
          service: (typeof o.service === "string" ? o.service : s.service) as BookingServiceId,
          savedAddressId: savedFromLast,
          useCustomAddress: useCustom,
          location: oloc,
          notes: typeof o.notes === "string" ? o.notes : s.notes,
          totalPaidZar: typeof o.totalPaidZar === "number" ? String(o.totalPaidZar) : s.totalPaidZar,
        };
      });
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitGuard.current) return;
      submitGuard.current = true;
      const sendForce = forceDuplicateNextSubmit.current;
      forceDuplicateNextSubmit.current = false;
      setDuplicateExistingId(null);
      setDuplicateRecent(false);
      setDuplicateRaceRollback(false);
      setDuplicateCreatedAt(null);
      setFieldError(null);
      setApiError(null);
      setSmsResendWarning(null);
      setSuccess(null);
      setLastBookingId(null);
      setPerBookingPay(null);
      setPaymentLinkMeta(null);
      setSmsTwilioHint(null);

      const v = validateForm(form);
      if (v) {
        setFieldError(v);
        submitGuard.current = false;
        return;
      }
      const cust = form.selectedCustomer!;
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setApiError("You are not signed in. Open admin login and try again.");
        submitGuard.current = false;
        return;
      }

      const timeHm = normalizeTimeHm(form.time);
      const slotConflictSig = `${cust.id}|${form.date.trim()}|${timeHm}|${form.service}`;
      if (
        !sendForce &&
        lastSlotConflictSigRef.current === slotConflictSig &&
        Date.now() - lastSlotConflictAtRef.current < 2800
      ) {
        setApiError("Please wait a few seconds before retrying the same slot, or open the booking from the duplicate banner.");
        submitGuard.current = false;
        return;
      }

      const trimmedOverrideReason = duplicateOverrideReason.trim().slice(0, 500);
      const body = {
        user_id: cust.id,
        date: form.date.trim(),
        time: timeHm,
        service: form.service,
        location: form.location.trim(),
        notes: form.notes.trim(),
        totalPaidZar: Math.round(Number(form.totalPaidZar)),
        ...(sendForce
          ? {
              force: true,
              ...(trimmedOverrideReason.length > 0 ? { override_reason: trimmedOverrideReason } : {}),
            }
          : {}),
      };

      const idempotencyKey = crypto.randomUUID();
      setSubmitting(true);
      try {
        const res = await fetch("/api/admin/bookings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(body),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          errorCode?: string;
          message?: string;
          bookingId?: string;
          authorizationUrl?: string;
          payment_link_ttl_hours?: number;
          payment_link_expires_at?: string;
          existing_booking_id?: string;
          duplicate?: boolean;
          recent_duplicate?: boolean;
          existing_booking_created_at?: string | null;
          race_rolled_back?: boolean;
        };
        if (!res.ok) {
          if (res.status === 409 && json.duplicate) {
            lastSlotConflictSigRef.current = slotConflictSig;
            lastSlotConflictAtRef.current = Date.now();
            if (typeof json.existing_booking_id === "string") {
              setDuplicateExistingId(json.existing_booking_id);
              setDuplicateRaceRollback(Boolean(json.race_rolled_back));
              setDuplicateRecent(Boolean(json.recent_duplicate));
              setDuplicateCreatedAt(
                typeof json.existing_booking_created_at === "string" ? json.existing_booking_created_at : null,
              );
              setApiError(null);
            } else {
              setDuplicateExistingId(null);
              setDuplicateRaceRollback(false);
              setDuplicateRecent(false);
              setDuplicateCreatedAt(null);
              setApiError(typeof json.error === "string" ? json.error : "Duplicate active slot for this customer.");
            }
            return;
          }
          setDuplicateExistingId(null);
          setDuplicateRecent(false);
          setDuplicateRaceRollback(false);
          setDuplicateCreatedAt(null);
          setApiError(typeof json.error === "string" ? json.error : "Request failed.");
          return;
        }
        setDuplicateExistingId(null);
        setDuplicateRecent(false);
        setDuplicateRaceRollback(false);
        setDuplicateCreatedAt(null);
        setDuplicateOverrideReason("");
        lastSlotConflictSigRef.current = null;
        lastSlotConflictAtRef.current = 0;
        setSuccess(json.message ?? (cust.billing_type.toLowerCase() === "monthly" ? "Booking created (billed monthly)" : "Payment link sent"));
        if (typeof json.bookingId === "string") setLastBookingId(json.bookingId);
        if (cust.billing_type.toLowerCase() === "monthly") {
          setPerBookingPay(null);
          setPaymentLinkMeta(null);
        } else if (typeof json.bookingId === "string" && typeof json.authorizationUrl === "string") {
          setPerBookingPay({ bookingId: json.bookingId, url: json.authorizationUrl });
          const ttl = Number(json.payment_link_ttl_hours);
          const exp = typeof json.payment_link_expires_at === "string" ? json.payment_link_expires_at : null;
          if (Number.isFinite(ttl) && ttl > 0) {
            setPaymentLinkMeta({ ttlHours: Math.round(ttl), expiresAt: exp });
          } else if (exp) {
            setPaymentLinkMeta({ ttlHours: 1, expiresAt: exp });
          } else {
            setPaymentLinkMeta(null);
          }
        } else {
          setPerBookingPay(null);
          setPaymentLinkMeta(null);
        }
        persistLastBooking(form);
        setResendPreferEmailOnly(false);
        setForm((s) => ({
          ...emptyForm(),
          customerQuery: s.customerQuery,
          selectedCustomer: s.selectedCustomer,
          totalPaidZar: s.totalPaidZar,
          service: s.service,
          savedAddressId: s.savedAddressId,
          useCustomAddress: s.savedAddressId ? false : s.useCustomAddress,
          location: s.location,
        }));
      } finally {
        submitGuard.current = false;
        setSubmitting(false);
      }
    },
    [duplicateOverrideReason, form, persistLastBooking, slotOptions, todayJhb],
  );

  const resendPaymentLink = useCallback(async () => {
    if (!perBookingPay) return;
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setApiError("You are not signed in.");
      return;
    }
    setResendBusy(true);
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(perBookingPay.bookingId)}/resend-payment-link`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationMode: "chain_plus_email",
          skipSms: resendPreferEmailOnly && Boolean(form.selectedCustomer?.email?.trim()),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
        sms_twilio_ref_preview?: string | null;
        sms_twilio_sid?: string | null;
        primary_channel?: string | null;
        delivery?: {
          byChannel?: { sms?: string; email?: string };
          primaryChannel?: string;
        };
      };
      if (!res.ok) {
        setApiError(typeof j.error === "string" ? j.error : "Resend failed.");
        return;
      }
      setApiError(null);
      const primary =
        typeof j.primary_channel === "string" && j.primary_channel.trim()
          ? j.primary_channel.trim().toLowerCase()
          : typeof j.delivery?.primaryChannel === "string"
            ? j.delivery.primaryChannel.trim().toLowerCase()
            : "";
      if (primary === "email" || primary === "sms") {
        writeResendPrimaryPreference(perBookingPay.bookingId, primary);
        setResendPreferEmailOnly(primary === "email");
      }
      const smsSt = j.delivery?.byChannel?.sms;
      const emailSt = j.delivery?.byChannel?.email;
      if (smsSt === "failed") {
        setResendPreferEmailOnly(true);
        writeResendPrimaryPreference(perBookingPay.bookingId, "email");
        setSmsResendWarning(
          emailSt === "sent"
            ? "SMS failed (Twilio); email was sent. Next resend defaults to email only — toggle below to include SMS again."
            : "SMS failed (Twilio). Try Resend again or rely on email when available.",
        );
      } else {
        setSmsResendWarning(null);
      }
      setSuccess("Payment link notifications resent (email / SMS per your delivery rules).");
      const full = typeof j.sms_twilio_sid === "string" && j.sms_twilio_sid.trim() ? j.sms_twilio_sid.trim() : "";
      const preview =
        typeof j.sms_twilio_ref_preview === "string" && j.sms_twilio_ref_preview.trim()
          ? j.sms_twilio_ref_preview.trim()
          : full
            ? full.length <= 12
              ? full
              : `${full.slice(0, 3)}…${full.slice(-4)}`
            : "";
      if (preview || full) {
        setSmsTwilioHint({ preview: preview || full, full: full || preview });
      }
    } finally {
      setResendBusy(false);
    }
  }, [perBookingPay, resendPreferEmailOnly, form.selectedCustomer?.email]);

  const createAnotherForCustomer = useCallback(() => {
    setSuccess(null);
    setPerBookingPay(null);
    setPaymentLinkMeta(null);
    setSmsTwilioHint(null);
    setSmsResendWarning(null);
    setLastBookingId(null);
    setFieldError(null);
    setApiError(null);
    setDuplicateExistingId(null);
    setDuplicateRecent(false);
    setDuplicateRaceRollback(false);
    setDuplicateCreatedAt(null);
    try {
      const raw = window.sessionStorage.getItem(LAST_BOOKING_STORAGE);
      if (!raw) return;
      const o = JSON.parse(raw) as Record<string, unknown>;
      const uid = typeof o.user_id === "string" ? o.user_id : "";
      const lastDate = typeof o.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.date) ? o.date : "";
      const lastTimeHm = normalizeTimeHm(typeof o.time === "string" ? o.time : "");
      setForm((s) => {
        if (!s.selectedCustomer) return s;
        if (uid && uid !== s.selectedCustomer.id) {
          window.setTimeout(() => void loadLastBooking(), 0);
          return s;
        }
        let nextDate = "";
        let nextTime = "";
        if (lastDate && lastDate >= todayJhb) {
          const slots = filterBookableTimeSlots(lastDate, {
            leadMinutes: BOOKING_MIN_LEAD_MINUTES,
            now: new Date(),
          });
          if (slots.length) {
            nextDate = lastDate;
            if (lastTimeHm && slots.includes(lastTimeHm)) nextTime = lastTimeHm;
            else {
              const after = slots.find((t) => t > lastTimeHm);
              nextTime = (after ?? slots[0]) ?? "";
            }
          }
        }
        const nextSid = typeof o.saved_address_id === "string" ? o.saved_address_id : s.savedAddressId;
        return {
          ...s,
          service: (typeof o.service === "string" ? o.service : s.service) as BookingServiceId,
          savedAddressId: nextSid,
          useCustomAddress: !(typeof o.saved_address_id === "string" && o.saved_address_id),
          location: typeof o.location === "string" ? o.location : s.location,
          totalPaidZar: typeof o.totalPaidZar === "number" ? String(o.totalPaidZar) : s.totalPaidZar,
          date: nextDate,
          time: nextTime,
          notes: "",
        };
      });
    } catch {
      /* ignore */
    }
  }, [loadLastBooking, todayJhb]);

  const monthly = form.selectedCustomer?.billing_type.toLowerCase() === "monthly";

  useEffect(() => {
    if (!success || !form.selectedCustomer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("textarea, input, select, button, a, [contenteditable=true]")) return;
      e.preventDefault();
      createAnotherForCustomer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [success, form.selectedCustomer, createAnotherForCustomer]);

  const monthlyInvoicePreview = useMemo(() => {
    const d = form.date.trim();
    if (!monthly || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const z = Math.round(Number(form.totalPaidZar));
    if (!Number.isFinite(z) || z < 1) return null;
    const ym = previewInvoiceBucketMonth({ serviceDateYmd: d });
    if (!ym) return null;
    return { amountZar: z, monthLabel: formatInvoiceMonthLabel(ym), bucketYm: ym };
  }, [monthly, form.date, form.totalPaidZar]);

  const crossMonthBillingHint = useMemo(() => {
    const d = form.date.trim();
    if (!monthly || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const naiveYm = d.slice(0, 7);
    const bucketYm = previewInvoiceBucketMonth({ serviceDateYmd: d });
    return Boolean(bucketYm && bucketYm !== naiveYm);
  }, [monthly, form.date]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Create booking</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Select an existing customer. Monthly accounts skip Paystack; per-booking sends a payment link.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => loadLastBooking()}>
            Use last booking
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => copyVisitFromLast()}>
            Copy visit from last
          </Button>
          <Link
            href="/admin/bookings"
            className="inline-flex h-9 items-center text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            ← Back to bookings
          </Link>
        </div>
      </div>

      <Card className="border-zinc-200 shadow-sm dark:border-zinc-800">
        <CardHeader>
          <CardTitle>Customer & visit</CardTitle>
          <CardDescription>Search by name or email (Johannesburg date/time rules).</CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="custSearch">Customer</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
                <Input
                  id="custSearch"
                  className="pl-9"
                  placeholder="Name or email…"
                  value={form.customerQuery}
                  onChange={(e) => {
                    setSlotAdjustHint(null);
                    slotAutoFixTargetRef.current = null;
                    setForm((s) => ({
                      ...s,
                      customerQuery: e.target.value,
                      selectedCustomer: null,
                      savedAddressId: "",
                      useCustomAddress: false,
                      location: "",
                      date: "",
                      time: "",
                      notes: "",
                      totalPaidZar: "",
                      service: "standard",
                    }));
                  }}
                  disabled={submitting}
                  autoComplete="off"
                />
              </div>
              {searching ? (
                <p className="text-xs text-zinc-500">Searching…</p>
              ) : searchHits.length > 0 && !form.selectedCustomer ? (
                <ul className="max-h-48 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                  {searchHits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-0.5 border-b border-zinc-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/80"
                        onClick={() => {
                          const stored = readStoredBilling(h.id);
                          const hit = stored ? { ...h, ...stored } : h;
                          setForm((s) => ({
                            ...s,
                            selectedCustomer: hit,
                            customerQuery: hit.email ?? hit.full_name ?? hit.id,
                            savedAddressId: "",
                            useCustomAddress: false,
                            location: "",
                            service:
                              (hit.schedule_type ?? "").toLowerCase() === "on_demand"
                                ? ("airbnb" as BookingServiceId)
                                : s.service,
                          }));
                        }}
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">{h.full_name ?? "—"}</span>
                        <span className="text-xs text-zinc-500">{h.email ?? h.id}</span>
                        <span className="text-[11px] text-zinc-400">
                          Billing: {billingLabel(h.billing_type)} · Schedule: {scheduleLabel(h.schedule_type)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : form.customerQuery.trim().length >= 2 && !form.selectedCustomer ? (
                <p className="text-xs text-zinc-500">No matches.</p>
              ) : null}
              {form.selectedCustomer ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/60">
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    {form.selectedCustomer.full_name ?? "—"}{" "}
                    <span className="font-normal text-zinc-500">({form.selectedCustomer.email ?? form.selectedCustomer.id})</span>
                  </p>
                  <AdminCustomerBillingSwitch
                    customer={form.selectedCustomer}
                    service={form.service}
                    disabled={submitting}
                    onBillingUpdated={(next) =>
                      setForm((s) => {
                        if (!s.selectedCustomer) return s;
                        writeStoredBilling(s.selectedCustomer.id, next.billing_type, next.schedule_type);
                        return { ...s, selectedCustomer: { ...s.selectedCustomer, ...next } };
                      })
                    }
                  />
                  <button
                    type="button"
                    className="mt-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                    onClick={() => {
                      hydratedSessionAddressUserRef.current = null;
                      setForm((s) => ({
                        ...s,
                        selectedCustomer: null,
                        savedAddressId: "",
                        useCustomAddress: false,
                        location: "",
                      }));
                    }}
                  >
                    Change customer
                  </button>
                </div>
              ) : null}
            </div>

            {form.selectedCustomer ? (
              monthly ? (
                <div
                  className={cn(
                    "space-y-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-3 text-sm text-sky-950",
                    "dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100",
                  )}
                  role="status"
                >
                  <p className="font-medium">
                    This booking will be billed on the customer&apos;s monthly invoice. No payment required.
                  </p>
                  {monthlyInvoicePreview ? (
                    <p className="text-sm">
                      R {monthlyInvoicePreview.amountZar.toLocaleString("en-ZA")} will be added to the{" "}
                      {monthlyInvoicePreview.monthLabel} invoice (draft until billing runs).
                    </p>
                  ) : null}
                  {crossMonthBillingHint ? (
                    <p className="text-xs text-sky-900/85 dark:text-sky-200/90">
                      This visit will be billed in next month&apos;s invoice (last-day cutoff in Johannesburg).
                    </p>
                  ) : null}
                </div>
              ) : (
                <div
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-100"
                  role="status"
                >
                  <p className="font-medium">A payment link will be generated and sent to the customer.</p>
                </div>
              )
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
                <Label htmlFor="date">
                  Date <span className="text-red-600 dark:text-red-400">*</span>
                </Label>
                <Input
                  ref={dateInputRef}
                  id="date"
                  type="date"
                  min={todayJhb}
                  value={form.date}
                  onChange={(e) => {
                    setSlotAdjustHint(null);
                    slotAutoFixTargetRef.current = null;
                    setForm((s) => ({ ...s, date: e.target.value, time: "" }));
                  }}
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
                <Label htmlFor="time">
                  Time <span className="text-red-600 dark:text-red-400">*</span>
                </Label>
                <Select
                  id="time"
                  label=""
                  value={form.time}
                  onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))}
                  disabled={submitting || !form.date}
                >
                  <option value="">{form.date ? "Select time" : "Pick a date first"}</option>
                  {slotOptions.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {slotAdjustHint ? (
              <p className="text-xs text-sky-800 dark:text-sky-200/90" role="status">
                {slotAdjustHint}
              </p>
            ) : null}
            {form.date.trim() === todayJhb && /^\d{4}-\d{2}-\d{2}$/.test(form.date.trim()) ? (
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200/90" role="status">
                ⚡ Limited slots available today
              </p>
            ) : null}

            <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
              <Select
                id="service"
                label="Service *"
                value={form.service}
                onChange={(e) => setForm((s) => ({ ...s, service: e.target.value as BookingServiceId }))}
                disabled={submitting}
              >
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            {form.selectedCustomer ? (
              <div className="border-l-4 border-amber-400/80 pl-3">
                <AdminPropertySelector
                  userId={form.selectedCustomer.id}
                  value={form.savedAddressId}
                  useCustomAddress={form.useCustomAddress}
                  location={form.location}
                  disabled={submitting}
                  onUseCustomAddressChange={handleUseCustomAddressChange}
                  onChange={handlePropertySelected}
                  onLocationChange={handleLocationInputChange}
                  onAddressesLoaded={handleAddressesLoaded}
                />
              </div>
            ) : null}

            <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
              <Label htmlFor="notes">
                Notes <span className="text-red-600 dark:text-red-400">*</span>
              </Label>
              <textarea
                id="notes"
                rows={3}
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline focus-visible:ring-2 focus-visible:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-950"
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
                disabled={submitting}
                placeholder="Guest checkout time, key access, gate code, pets, special instructions..."
              />
              {form.notes.trim().length >= 3 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Cleaner will see:
                  </span>
                  {extractNotesPreviewTags(form.notes).map((t, i) => (
                    <span
                      key={`${t.label}-${i}`}
                      className="inline-flex items-center gap-0.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      <span aria-hidden>{t.emoji}</span>
                      {t.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-2 border-l-4 border-amber-400/80 pl-3">
              <Label htmlFor="price">
                Visit price (ZAR) <span className="text-red-600 dark:text-red-400">*</span>
              </Label>
              <Input
                id="price"
                type="number"
                inputMode="decimal"
                min={1}
                step={1}
                placeholder="e.g. 850"
                value={form.totalPaidZar}
                onChange={(e) => setForm((s) => ({ ...s, totalPaidZar: e.target.value }))}
                disabled={submitting}
              />
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                This is the amount that will appear on the monthly invoice / payment link (stored in cents:{" "}
                {Number.isFinite(Number(form.totalPaidZar))
                  ? Math.round(Number(form.totalPaidZar) * 100).toLocaleString("en-ZA")
                  : "—"}{" "}
                cents).
              </p>
              {lastVisitPriceZar != null && (form.savedAddressId || form.location.trim().length >= 3) ? (
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200/90">
                  Last booking: R {Math.round(lastVisitPriceZar).toLocaleString("en-ZA")}
                </p>
              ) : null}
            </div>

            {fieldError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {fieldError}
              </p>
            ) : null}
            {apiError ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {apiError}
              </p>
            ) : null}
            {duplicateExistingId ? (
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                role="status"
              >
                <p className="font-medium">
                  {duplicateRaceRollback
                    ? "This slot was claimed in a near-simultaneous save — the first booking was kept."
                    : duplicateRecent
                      ? "Looks like you just created this — open it to confirm?"
                      : "Booking already exists for this slot and service."}
                </p>
                {duplicateRaceRollback ? (
                  <>
                    <p className="mt-1 text-xs leading-snug text-amber-900/90 dark:text-amber-100/85">
                      Another admin created this booking at the same time.
                    </p>
                    <p className="mt-1 text-[11px] font-medium leading-snug text-amber-900/95 dark:text-amber-100/90">
                      {form.date} · {form.time} · {getServiceLabel(form.service)} · {locationSnippet(form.location)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Button asChild size="sm" className="h-8">
                        <Link
                          href={`/admin/bookings/${duplicateExistingId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View winner
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 border-amber-800/30 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
                        onClick={() => void openAdminBookingAndCopyUrl(duplicateExistingId)}
                      >
                        Open & copy link
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Link
                      href={`/admin/bookings/${duplicateExistingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono underline decoration-amber-800/40 hover:decoration-amber-800"
                    >
                      View existing booking (new tab)
                    </Link>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 border-amber-800/30 bg-white px-2 py-0 text-[11px] text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
                      onClick={() => void openAdminBookingAndCopyUrl(duplicateExistingId)}
                    >
                      Open & copy link
                    </Button>
                  </div>
                )}
                {formatCreatedAgo(duplicateCreatedAt) ? (
                  <p className="mt-1 text-[11px] font-medium text-amber-900/90 dark:text-amber-100/90">
                    {formatCreatedAgo(duplicateCreatedAt)}
                  </p>
                ) : null}
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="dup-override-reason" className="text-xs font-normal text-amber-950/90 dark:text-amber-50/90">
                    Override note (optional, audit log)
                  </Label>
                  <Input
                    id="dup-override-reason"
                    value={duplicateOverrideReason}
                    onChange={(e) => setDuplicateOverrideReason(e.target.value.slice(0, 500))}
                    disabled={submitting}
                    placeholder="e.g. second unit same day, customer confirmed in writing…"
                    className="h-8 text-xs"
                  />
                </div>
                <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-snug">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-amber-800/40"
                    checked={duplicateOverrideAck}
                    onChange={(e) => setDuplicateOverrideAck(e.target.checked)}
                  />
                  <span>I understand this will create a duplicate booking.</span>
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-amber-800/30 bg-white text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50"
                    disabled={submitting || !duplicateOverrideAck}
                    onClick={() => {
                      forceDuplicateNextSubmit.current = true;
                      formRef.current?.requestSubmit();
                    }}
                  >
                    Create anyway
                  </Button>
                </div>
              </div>
            ) : null}
            {success ? (
              <div
                className={cn(
                  "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900",
                  "dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
                )}
                role="status"
              >
                <p className="font-medium">✔ Booking created</p>
                <p className="mt-0.5 text-xs opacity-90">{success}</p>
                {lastBookingId ? (
                  <p className="mt-1 text-xs opacity-90">
                    Booking ID:{" "}
                    <Link
                      href={`/admin/bookings/${lastBookingId}`}
                      className="font-mono underline decoration-emerald-700/50 hover:decoration-emerald-700"
                    >
                      {lastBookingId}
                    </Link>
                  </p>
                ) : null}
                {perBookingPay ? (
                  <div className="mt-3 space-y-2 border-t border-emerald-300/60 pt-3 dark:border-emerald-800/60">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-950/80 dark:text-emerald-100/90">
                      Payment link created
                    </p>
                    <p className="break-all font-mono text-[11px] leading-snug text-emerald-950/90 dark:text-emerald-50/90">
                      {perBookingPay.url}
                    </p>
                    {paymentLinkMeta ? (
                      <div className="space-y-1 text-[11px] leading-relaxed text-emerald-900/90 dark:text-emerald-100/90">
                        <p>
                          Link valid for about {paymentLinkMeta.ttlHours} hour{paymentLinkMeta.ttlHours === 1 ? "" : "s"}
                          {paymentLinkMeta.expiresAt ? (
                            <>
                              {" "}
                              (until{" "}
                              {new Date(paymentLinkMeta.expiresAt).toLocaleString("en-ZA", {
                                timeZone: "Africa/Johannesburg",
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                              )
                            </>
                          ) : null}
                          {paymentRelativeExpiry ? (
                            <>
                              {" "}
                              · {paymentRelativeExpiry}
                            </>
                          ) : null}
                          . You can resend from this screen anytime (cooldowns may apply).
                        </p>
                        {paystackExpirySastLabel ? (
                          <p className="text-[10px] text-emerald-900/75 dark:text-emerald-100/75">
                            Expires (Paystack): {paystackExpirySastLabel} SAST
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {smsResendWarning ? (
                      <p className="text-[11px] text-amber-900 dark:text-amber-200/90" role="status">
                        {smsResendWarning}
                      </p>
                    ) : null}
                    {smsResendWarning && form.selectedCustomer?.email && perBookingPay ? (
                      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-emerald-950/90 dark:text-emerald-50/90">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 shrink-0 rounded border-emerald-800/40"
                          checked={!resendPreferEmailOnly}
                          onChange={(e) => {
                            const includeSms = e.target.checked;
                            setResendPreferEmailOnly(!includeSms);
                            writeResendPrimaryPreference(perBookingPay.bookingId, includeSms ? "sms" : "email");
                          }}
                        />
                        <span>Include SMS on next resend (Twilio)</span>
                      </label>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-emerald-800/30 bg-white text-emerald-950 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50"
                        onClick={() => void navigator.clipboard.writeText(perBookingPay.url)}
                      >
                        Copy link
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendBusy}
                        className="border-emerald-800/30 bg-white text-emerald-950 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-50"
                        onClick={() => void resendPaymentLink()}
                      >
                        {resendBusy ? "Resending…" : "Resend (email / SMS)"}
                      </Button>
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(`Your payment link: ${perBookingPay.url}`)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="border-emerald-800/30"
                        >
                          Open WhatsApp
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : null}
                {smsTwilioHint ? (
                  <p
                    className="mt-2 text-[11px] text-emerald-900/85 dark:text-emerald-100/85"
                    title={smsTwilioHint.full ? `Full Twilio sid: ${smsTwilioHint.full}` : undefined}
                  >
                    Sent via SMS (Twilio) · ref: {smsTwilioHint.preview}
                  </p>
                ) : null}
              </div>
            ) : null}

            {success && form.selectedCustomer ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                <Button type="button" variant="default" size="sm" onClick={() => createAnotherForCustomer()}>
                  Create another for this customer
                </Button>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  Keeps this customer, last service, location, and price — add a new date, time, and notes. Press Enter
                  (when not typing in a field) for the same shortcut.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={submitting || !form.selectedCustomer}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : !form.selectedCustomer ? (
                  "Select a customer"
                ) : form.selectedCustomer.billing_type.toLowerCase() === "monthly" ? (
                  "Create booking (billed monthly)"
                ) : (
                  "Create & send payment link"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
