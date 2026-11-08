import { handleResendWebhook } from "@/lib/email/resendWebhookHandler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => handleResendWebhook(request);
