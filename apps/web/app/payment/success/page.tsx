import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canonicalUrl } from "@/lib/site/canonicalUrl";

/** Canonical confirmation UX lives at `/account/success`; this route preserves deep links. */
export const metadata: Metadata = {
  title: "Booking confirmed | Shalean",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  alternates: { canonical: canonicalUrl("/account/success") },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ reference?: string | string[]; trxref?: string | string[] }>;
};

export default async function PaymentSuccessRedirect({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawRef = sp.reference ?? sp.trxref;
  const reference = (Array.isArray(rawRef) ? rawRef[0] : rawRef)?.trim() ?? "";
  if (reference) {
    redirect(`/account/success?reference=${encodeURIComponent(reference)}`);
  }
  redirect("/account/success");
}
