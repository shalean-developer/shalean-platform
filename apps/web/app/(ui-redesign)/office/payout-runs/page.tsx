import { redirect } from "next/navigation";

export default function OfficePayoutRunsLegacyRedirectPage() {
  redirect("/office/payouts?tab=disbursements");
}
