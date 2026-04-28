"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CustomerMonthlyInvoiceRow } from "@/lib/dashboard/monthlyInvoiceTypes";
import { useUser } from "@/hooks/useUser";

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
