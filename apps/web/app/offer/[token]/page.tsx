import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchDispatchOfferPublicByToken, isValidOfferTokenFormat } from "@/lib/dispatch/offerByToken";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { OfferTokenPageClient } from "./OfferTokenPageClient";

export const metadata: Metadata = {
  title: "Job offer",
  robots: { index: false, follow: false },
};

export default async function OfferByTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token?.trim() || !isValidOfferTokenFormat(token)) notFound();

  const admin = getSupabaseAdmin();
  if (!admin) notFound();

  const initial = await fetchDispatchOfferPublicByToken(admin, token);
  if (!initial) notFound();

  return <OfferTokenPageClient token={token} initial={initial} />;
}
