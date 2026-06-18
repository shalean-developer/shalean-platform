import { redirect } from "next/navigation";

/** Legacy route — cleaner home lives at `/jobs`. */
export default function CleanerDashboardRedirectPage() {
  redirect("/jobs");
}
