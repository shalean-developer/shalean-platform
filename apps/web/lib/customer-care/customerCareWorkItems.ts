import type { OfficeWorkItem, OfficeWorkItemPriority } from "@/lib/admin/officeWorkItems";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type CaseRow = {
  id: string;
  case_number: string;
  category: string;
  priority: OfficeWorkItemPriority;
  status: string;
  customer_email: string | null;
  customer_phone: string | null;
  booking_id: string | null;
  created_at: string;
  first_response_due_at: string | null;
  resolution_due_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
};

function label(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function customerCareCaseWorkItems(): Promise<OfficeWorkItem[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from("customer_care_cases")
    .select("id,case_number,category,priority,status,customer_email,customer_phone,booking_id,created_at,first_response_due_at,resolution_due_at,resolved_at,closed_at")
    .is("closed_at", null)
    .order("resolution_due_at", { ascending: true, nullsFirst: false })
    .limit(1000);

  if (error) throw error;
  const now = Date.now();

  return ((data ?? []) as CaseRow[]).flatMap((row) => {
    if (row.resolved_at || row.status === "resolved" || row.status === "closed") return [];
    const responseDue = row.first_response_due_at ? Date.parse(row.first_response_due_at) : Number.NaN;
    const resolutionDue = row.resolution_due_at ? Date.parse(row.resolution_due_at) : Number.NaN;
    const overdue = (Number.isFinite(responseDue) && responseDue < now) || (Number.isFinite(resolutionDue) && resolutionDue < now);
    const priority: OfficeWorkItemPriority = overdue && row.priority !== "critical" ? "high" : row.priority;
    const customer = row.customer_email?.trim() || row.customer_phone?.trim() || "Customer";
    const dueAt = row.resolution_due_at ?? row.first_response_due_at;

    return [{
      id: `customer_care.case:${row.id}`,
      type: "customer_care.case",
      title: overdue ? `Case #${row.case_number} is overdue` : `Case #${row.case_number} needs Customer Care action`,
      summary: `${label(row.category)} • ${customer}${row.booking_id ? ` • Booking ${row.booking_id.slice(0, 8).toUpperCase()}` : ""}`,
      priority,
      status: overdue ? "overdue" : "open",
      href: `/office/customer-care?case=${encodeURIComponent(row.id)}`,
      actionLabel: "Open case",
      requiredPermission: "customer.contact",
      occurredAt: row.created_at,
      dueAt,
      branchId: null,
      teamId: null,
    } satisfies OfficeWorkItem];
  });
}
