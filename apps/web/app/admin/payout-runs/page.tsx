import { redirect } from "next/navigation";

export default function AdminPayoutRunsLegacyRedirectPage() {
  redirect("/admin/payouts?tab=disbursements");
}
