import { getMarketingRehearsal, postMarketingRehearsal } from "@/lib/email/marketingRehearsalRoute";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => getMarketingRehearsal(request, "office");
export const POST = (request: Request) => postMarketingRehearsal(request, "office");
