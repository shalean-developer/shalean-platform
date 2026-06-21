"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { useUser } from "@/hooks/useUser";
import type { SalesDocumentRow } from "@/lib/salesDocument/types";

const SELECT =
  "id, document_type, status, customer_name, total_cents, balance_cents, due_date, created_at";

export function useSalesDocuments(): {
  documents: SalesDocumentRow[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} {
  const { user, loading: userLoading } = useUser();
  const [rows, setRows] = useState<SalesDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await sb
      .from("sales_documents")
      .select(SELECT)
      .order("created_at", { ascending: false })
      .limit(100);
    if (res.error) {
      setError(res.error.message);
      setRows([]);
    } else {
      setRows((res.data ?? []) as SalesDocumentRow[]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (userLoading) return;
    void fetchDocs();
  }, [userLoading, fetchDocs]);

  return {
    documents: rows,
    loading: userLoading || loading,
    error,
    refetch: fetchDocs,
  };
}
