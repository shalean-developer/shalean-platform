"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { useUser } from "@/hooks/useUser";

export type CustomerInvoiceBookingRow = {
  id: string;
  date: string | null;
  time: string | null;
  service: string | null;
  service_slug: string | null;
  total_paid_zar: number | null;
  status: string | null;
};

const BOOKING_SELECT = "id, date, time, service, service_slug, total_paid_zar, status";

const SELECT = [
  "id",
  "customer_id",
  "month",
  "total_bookings",
  "total_amount_cents",
  "amount_paid_cents",
  "balance_cents",
  "status",
  "due_date",
  "payment_link",
  "paystack_reference",
  "sent_at",
  "finalized_at",
  "is_overdue",
  "is_closed",
  "currency_code",
  "created_at",
  "updated_at",
].join(",");

export function useMonthlyInvoices(): {
  invoices: CustomerMonthlyInvoiceRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [rows, setRows] = useState<CustomerMonthlyInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("monthly_invoices")
      .select(SELECT)
      .eq("customer_id", userId)
      .order("month", { ascending: false })
      .limit(120);
    if (res.error) {
      setError(res.error.message);
      setRows([]);
    } else {
      setRows(((res.data ?? []) as unknown) as CustomerMonthlyInvoiceRow[]);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (userLoading) return;
    void fetchInvoices();
  }, [userLoading, fetchInvoices]);

  const invoices = useMemo(() => rows, [rows]);

  return {
    invoices,
    loading: userLoading || loading,
    error,
    refetch: fetchInvoices,
  };
}

export function useMonthlyInvoiceDetail(invoiceId: string | undefined): {
  invoice: CustomerMonthlyInvoiceRow | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [invoice, setInvoice] = useState<CustomerMonthlyInvoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOne = useCallback(async () => {
    if (!userId || !invoiceId) {
      setInvoice(null);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setInvoice(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("monthly_invoices")
      .select(SELECT)
      .eq("id", invoiceId)
      .eq("customer_id", userId)
      .maybeSingle();
    if (res.error) {
      setError(res.error.message);
      setInvoice(null);
    } else {
      setInvoice((res.data as unknown as CustomerMonthlyInvoiceRow | null) ?? null);
    }
    setLoading(false);
  }, [userId, invoiceId]);

  useEffect(() => {
    if (userLoading) return;
    void fetchOne();
  }, [userLoading, fetchOne]);

  return {
    invoice,
    loading: userLoading || loading,
    error,
    refetch: fetchOne,
  };
}

export function useMonthlyInvoiceBookings(invoiceId: string | undefined): {
  bookings: CustomerInvoiceBookingRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id;
  const [bookings, setBookings] = useState<CustomerInvoiceBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBookings = useCallback(async () => {
    if (!userId || !invoiceId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setBookings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("bookings")
      .select(BOOKING_SELECT)
      .eq("monthly_invoice_id", invoiceId)
      .order("date", { ascending: true })
      .order("time", { ascending: true });
    if (res.error) {
      setError(res.error.message);
      setBookings([]);
    } else {
      setBookings(((res.data ?? []) as unknown) as CustomerInvoiceBookingRow[]);
    }
    setLoading(false);
  }, [userId, invoiceId]);

  useEffect(() => {
    if (userLoading) return;
    void fetchBookings();
  }, [userLoading, fetchBookings]);

  return {
    bookings,
    loading: userLoading || loading,
    error,
    refetch: fetchBookings,
  };
}
