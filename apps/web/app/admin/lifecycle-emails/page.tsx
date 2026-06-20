import { redirect } from "next/navigation";

/** Canonical lifecycle email UI lives under /office (ui-redesign shell). */
export default function AdminLifecycleEmailsRedirectPage() {
  redirect("/office/lifecycle-emails");
}
