"use client";

import Link from "next/link";
import {
  salesDocumentIsDeletable,
  salesDocumentIsEditableWithoutPayment,
} from "@/lib/salesDocument/types";

export type SalesDocumentActionRow = {
  id: string;
  document_type: string;
  status: string;
  amount_paid_cents?: number;
  customer_name: string;
};

function docKind(documentType: string): "quote" | "invoice" {
  return documentType === "invoice" ? "invoice" : "quote";
}

export function isSalesDocumentEditable(doc: SalesDocumentActionRow): boolean {
  return salesDocumentIsEditableWithoutPayment({
    document_type: docKind(doc.document_type),
    status: doc.status,
    amount_paid_cents: doc.amount_paid_cents ?? 0,
  });
}

export function isSalesDocumentDeletable(doc: SalesDocumentActionRow): boolean {
  return salesDocumentIsDeletable({
    document_type: docKind(doc.document_type),
    status: doc.status,
    amount_paid_cents: doc.amount_paid_cents ?? 0,
  });
}

export function SalesDocumentRowActions({
  doc,
  onDelete,
  layout = "row",
}: {
  doc: SalesDocumentActionRow;
  onDelete?: (doc: SalesDocumentActionRow) => void;
  layout?: "row" | "stack";
}) {
  const editable = isSalesDocumentEditable(doc);
  const deletable = isSalesDocumentDeletable(doc);
  const href = `/office/sales-documents/${doc.id}`;

  const className =
    layout === "stack"
      ? "flex flex-col items-end gap-2"
      : "flex flex-wrap items-center justify-end gap-x-3 gap-y-1";

  return (
    <div className={className}>
      {editable ? (
        <Link href={href} className="text-sm font-semibold text-violet-700 hover:underline">
          Edit
        </Link>
      ) : (
        <Link href={href} className="text-sm font-medium text-blue-600 hover:underline">
          View
        </Link>
      )}
      {deletable && onDelete ? (
        <button
          type="button"
          onClick={() => onDelete(doc)}
          className="text-sm font-semibold text-red-600 hover:underline"
        >
          Delete
        </button>
      ) : null}
    </div>
  );
}
