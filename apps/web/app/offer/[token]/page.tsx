import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchDispatchOfferPublicByToken } from "@/lib/dispatch/offerByToken";
import { isValidOfferTokenFormat } from "@/lib/dispatch/offerTokenFormat";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { OfferTokenPageClient } from "./OfferTokenPageClient";

export const metadata: Metadata = {
  title: "Job offer",
  robots: { index: false, follow: false },
};

export default async function OfferByTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{ stale?: string }>;
}) {
  const { token } = await params;
  if (!token?.trim() || !isValidOfferTokenFormat(token)) notFound();

  const admin = getSupabaseAdmin();
  if (!admin) notFound();

  const initial = await fetchDispatchOfferPublicByToken(admin, token);
  if (!initial) notFound();

  const sp = searchParams ? await searchParams : {};
  const linkStaleHint = sp.stale === "1";

  return <OfferTokenPageClient token={token} initial={initial} linkStaleHint={linkStaleHint} />;
}
