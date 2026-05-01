import { redirect } from "next/navigation";

/** Add-ons moved to step 1 (`/booking/details`); keep URL for bookmarks. */
export default function BookingExtrasLegacyRedirect() {
  redirect("/booking/details");
}
