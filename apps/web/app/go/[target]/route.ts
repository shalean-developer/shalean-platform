import { NextResponse } from "next/server";

import { SHALEAN_SOCIAL_LINKS } from "@/lib/brand/shaleanSocialLinks";
import {
  CUSTOMER_SUPPORT_TELEPHONE_TEL,
  customerSupportWhatsAppHref,
} from "@/lib/site/customerSupport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-domain hop for email CTAs. Resend flags raw `tel:` / `wa.me` / social hosts
 * when they don't match the sending domain (shalean.co.za).
 */
const TARGETS: Record<string, string> = {
  call: CUSTOMER_SUPPORT_TELEPHONE_TEL,
  whatsapp: customerSupportWhatsAppHref(),
  facebook: SHALEAN_SOCIAL_LINKS.find((l) => l.id === "facebook")?.href ?? "https://www.facebook.com/shaleancleaning/",
  instagram:
    SHALEAN_SOCIAL_LINKS.find((l) => l.id === "instagram")?.href ??
    "https://www.instagram.com/shalean_cleaning_services",
};

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ target: string }> },
): Promise<Response> {
  const { target } = await ctx.params;
  const key = String(target ?? "")
    .trim()
    .toLowerCase();
  const dest = TARGETS[key];
  if (!dest) {
    return NextResponse.redirect(new URL("/contact", _request.url), 302);
  }
  return NextResponse.redirect(dest, 302);
}
