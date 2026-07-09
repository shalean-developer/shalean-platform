"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { adminFetch } from "@/hooks/useAdminData";
import { isExpenseReceiptImage } from "@/lib/admin/expenses/receiptStorage";

type Props = {
  expenseId: string;
  open: boolean;
  onClose: () => void;
};

export function ReceiptPreviewModal({ expenseId, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !expenseId) return;
    setLoading(true);
    setError(null);
    setSignedUrl(null);
    adminFetch<{ signed_url: string | null; mime: string | null }>(
      `/api/admin/expenses/receipt/${expenseId}`,
    )
      .then((res) => {
        if (!res.ok) throw new Error(res.error ?? "Failed to load receipt.");
        setSignedUrl(res.data?.signed_url ?? null);
        setMime(res.data?.mime ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load receipt."))
      .finally(() => setLoading(false));
  }, [open, expenseId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-800">Receipt</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-[300px] items-center justify-center p-6">
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : signedUrl && isExpenseReceiptImage(mime) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedUrl} alt="Receipt" className="max-h-[70vh] max-w-full rounded-lg object-contain" />
          ) : signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-3 text-blue-600 hover:underline"
            >
              <FileText className="h-16 w-16" />
              <span>Open PDF receipt</span>
            </a>
          ) : (
            <p className="text-sm text-slate-500">No receipt attached.</p>
          )}
        </div>
      </div>
    </div>
  );
}
