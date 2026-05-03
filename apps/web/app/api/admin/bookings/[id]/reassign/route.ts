import { POST as assignPost } from "../assign/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ops alias for sending a fresh dispatch offer after churn — same handler as `POST …/offer` / legacy `assign`.
 */
export const POST = assignPost;
