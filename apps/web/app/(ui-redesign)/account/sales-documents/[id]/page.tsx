"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { trustSalesDocPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import type { SalesDocumentLineItem, SalesDocumentRow } from "@/lib/salesDocument/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AccountSalesDocumentDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const [doc, setDoc] = useState<SalesDocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const sb = getSupabaseClient();
    if (!sb) {
      setError("Not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await sb
      .from("sales_documents")
      .select(
        "id, document_type, status, customer_name, line_items, total_cents, balance_cents, due_date, paystack_reference, payment_link",
      )
      .eq("id", id)
      .maybeSingle();
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Not found.");
      setDoc(null);
    } else {
      setDoc(res.data as SalesDocumentRow);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <div className="animate-pulse h-40 rounded-2xl bg-muted" />;
  if (!doc) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error ?? "Not found."}</p>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/account/sales-documents">Back</Link>
        </Button>
      </div>
    );
  }

  const lines = Array.isArray(doc.line_items) ? (doc.line_items as SalesDocumentLineItem[]) : [];
  const paymentLink = typeof doc.payment_link === "string" ? doc.payment_link.trim() : "";
  const paystackRef = typeof doc.paystack_reference === "string" ? doc.paystack_reference.trim() : "";
  const payHref =
    doc.document_type === "invoice" &&
    paymentLink &&
    paystackRef &&
    doc.balance_cents > 0 &&
    doc.status !== "paid"
      ? trustSalesDocPayPageUrl(doc.id, paystackRef, paymentLink)
      : null;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-lg text-blue-600">
        <Link href="/account/sales-documents">← All documents</Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold capitalize">{doc.document_type}</h1>
        <p className="text-sm text-muted-foreground capitalize">{doc.status.replace(/_/g, " ")}</p>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-6 space-y-3 text-sm">
          {lines.map((li, i) => (
            <div key={i} className="flex justify-between gap-4">
              <span>{li.description}</span>
              <span className="tabular-nums">{formatZarFromCents(li.quantity * li.unit_price_cents)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span>{formatZarFromCents(doc.total_cents)}</span>
          </div>
        </CardContent>
      </Card>

      {payHref ? (
        <Button asChild size="lg" className="w-full rounded-xl">
          <a href={payHref}>Pay now</a>
        </Button>
      ) : null}

      <Button asChild variant="outline" className="rounded-xl">
        <a href={`/api/account/sales-documents/${doc.id}/pdf`} target="_blank" rel="noopener noreferrer">
          Download PDF
        </a>
      </Button>
    </div>
  );
}
