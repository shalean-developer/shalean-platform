import { redirect } from "next/navigation";
import { copyAllowedBookingParams } from "@/lib/booking/bookingUrl";
import { legacyFlowStepQueryToCheckoutPath } from "@/lib/booking/bookingFlow";

type BookingIndexPageProps = {
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

export default async function BookingIndexPage({ searchParams }: BookingIndexPageProps) {
  const sp = await searchParams;
  const params = collectSearchParams(sp);
  const step = params.get("step");
  const path = legacyFlowStepQueryToCheckoutPath(step);
  params.delete("step");
  const allowed = copyAllowedBookingParams(params);
  const q = allowed.toString();
  redirect(q ? `${path}?${q}` : path);
}
