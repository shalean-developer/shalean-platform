import { NextResponse } from "next/server";
import { handleResendWebhook } from "@/lib/email/resendWebhookHandler";
import { marketingAcceptanceHost, marketingAcceptanceRecipients } from "@/lib/email/marketingAcceptanceConfig";
import { readBoundedRequest } from "@/lib/email/readBoundedRequest";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (body: object, status = 200) => NextResponse.json(body, {status,headers:{"Cache-Control":"no-store"}});
/** Dedicated signing key; shared-provider traffic cannot create staging customer/event records. */
export async function POST(request: Request) {
  const emails = marketingAcceptanceRecipients();
  if (!marketingAcceptanceHost(request) || emails.length !== 2) return json({error:"Not found"},404);
  const secret = process.env.RESEND_STAGING_WEBHOOK_SECRET;
  if (!secret) return json({error:"Staging webhook not configured"},503);
  const payload = await readBoundedRequest(request, 32768);
  if (payload === null) return json({error:"Request too large"},413);
  return handleResendWebhook(new Request(request.url,{method:"POST",headers:request.headers,body:payload}),{
    secret,
    accept: async (admin,event) => {
      const tags = event.data?.tags;
      const marked = Array.isArray(tags) ? tags.some(tag => tag.name === "shalean_environment" && tag.value === "staging") : tags?.shalean_environment === "staging";
      if (!marked) return json({ok:true,ignored:true});
      const recipients = event.data?.to;
      const email = recipients?.length === 1 ? recipients[0]?.toLowerCase().trim() : null;
      if (!event.type.startsWith("email.") || !email || !emails.includes(email) || !event.data?.email_id)
        return json({ok:true,ignored:true});
      // Exact local provider ID AND recipient must be recorded before any event is persisted.
      const {data: message,error} = await admin.from("email_outbound_messages").select("id")
        .eq("resend_email_id",event.data.email_id).eq("recipient_email",email).maybeSingle();
      if (error) return json({error:"Delivery correlation unavailable"},503);
      return message ? null : json({error:"Staging delivery record not yet available"},503);
    },
  });
}
