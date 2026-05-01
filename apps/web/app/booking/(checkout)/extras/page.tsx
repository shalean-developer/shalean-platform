import { redirect } from "next/navigation";
import { copyAllowedBookingParams } from "@/lib/booking/bookingUrl";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function collectSearchParams(sp: Record<string, string | string[] | undefined>): URLSearchParams {
  const qs = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (raw === undefined) continue;
    if (Array.isArray(raw)) {
      for (const v of raw) {
        if (v !== undefined && v !== "") qs.append(key, v);
      }
    } else if (raw !== "") {
      qs.append(key, raw);
    }
  }
  return qs;
}

/** Add-ons live on `/booking/details`; keep `/booking/extras` for bookmarks. */
export default async function BookingExtrasLegacyRedirect({ searchParams }: Props) {
  const params = collectSearchParams(await searchParams);
  const allowed = copyAllowedBookingParams(params);
  const q = allowed.toString();
  redirect(q ? `/booking/details?${q}` : "/booking/details");
}
