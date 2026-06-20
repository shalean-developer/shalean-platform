import { redirect } from "next/navigation";

/** Canonical ops health UI lives under the office shell. */
export default function AdminOpsHealthRedirectPage() {
  redirect("/office/ops-health");
}
