import { AdminInvoiceDetailsView } from "@/components/admin/invoices/AdminInvoiceDetailsView";

export default async function OfficeInvoiceDetailsPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;

  return (
    <AdminInvoiceDetailsView
      invoiceId={invoiceId}
      listHref="/office/invoices"
      customersHref="/office/customers"
    />
  );
}
