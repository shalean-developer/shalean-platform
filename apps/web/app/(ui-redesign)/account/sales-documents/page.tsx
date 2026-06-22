"use client";

import Link from "next/link";
import { useSalesDocuments } from "@/hooks/useSalesDocuments";
import { formatZarFromCents } from "@/lib/dashboard/formatZar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AccountSalesDocumentsPage() {
  const { documents, loading, error } = useSalesDocuments();

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 rounded-xl bg-muted" />
        <div className="h-40 rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Quotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ad-hoc quotes and invoices sent to you by Shalean.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {documents.length === 0 ? (
        <Card className="rounded-2xl">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No quotes or invoices yet. When we send you a document, it will appear here.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Card className="rounded-2xl border-border shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-semibold capitalize text-foreground">
                      {doc.document_type} · {doc.id.slice(0, 8).toUpperCase()}
                    </p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {doc.status.replace(/_/g, " ")} · {formatZarFromCents(doc.total_cents)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="rounded-xl">
                    <Link href={`/account/sales-documents/${doc.id}`}>View</Link>
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
