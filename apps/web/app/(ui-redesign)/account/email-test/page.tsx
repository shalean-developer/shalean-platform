import { notFound, redirect } from "next/navigation";
import { marketingStagingEnabled } from "@/lib/email/marketingStagingFixture";

export const dynamic = "force-dynamic";
export default function EmailTestPage() {
  if (!marketingStagingEnabled()) notFound();
  redirect("/office/marketing/email/test");
}
