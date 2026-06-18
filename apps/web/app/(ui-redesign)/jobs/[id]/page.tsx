import { redirect } from "next/navigation";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Legacy/mistyped URLs like `/jobs/{bookingId}` → canonical `/jobs/job/{bookingId}`. */
export default async function JobsBookingIdRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bid = String(id ?? "").trim();
  if (!UUID_RE.test(bid)) {
    redirect("/jobs/list");
  }
  redirect(`/jobs/job/${encodeURIComponent(bid)}`);
}
