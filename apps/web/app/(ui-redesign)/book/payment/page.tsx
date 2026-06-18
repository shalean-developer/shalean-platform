import { redirect } from "next/navigation";

/** Auth-gated payment entry — middleware sends unauthenticated users to `/login`. */
export default function BookPaymentPage() {
  redirect("/book");
}
