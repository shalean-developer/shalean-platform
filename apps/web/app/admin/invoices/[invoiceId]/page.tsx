import { AdminInvoiceDetailsView } from "@/components/admin/invoices/AdminInvoiceDetailsView";

export default async function AdminInvoiceDetailsPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <AdminInvoiceDetailsView invoiceId={invoiceId} />;
}
