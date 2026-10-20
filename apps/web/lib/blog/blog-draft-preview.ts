import { createHmac, timingSafeEqual } from "node:crypto";
import { adminUserHasPermission } from "@/lib/admin/requirePermission";

function secret() {
  return process.env.BLOG_DRAFT_PREVIEW_TOKEN?.trim() || process.env.OFFICE_VERIFICATION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
}

/** Minted only after live RBAC + Office verification. Never send the signing secret. */
export function createBlogPreviewQuery(slug: string, actorId: string, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ slug, actorId, expires: now + 10 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(`blog-preview-v1:${payload}`).digest("base64url");
  return `?preview=${payload}.${signature}`;
}

export function verifyBlogPreviewToken(token: string | null | undefined, slug: string, now = Date.now()): string | null {
  const key = secret();
  if (!key || !token || token.length > 2048) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", key).update(`blog-preview-v1:${payload}`).digest();
    const provided = Buffer.from(signature, "base64url");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.slug === slug && typeof data.actorId === "string" && data.expires > now && data.expires <= now + 10 * 60_000 ? data.actorId : null;
  } catch { return null; }
}

export async function isBlogDraftPreviewAllowed(token: string | null | undefined, slug: string): Promise<boolean> {
  const actorId = verifyBlogPreviewToken(token, slug);
  return !!actorId && (await adminUserHasPermission(actorId, "content.draft") || await adminUserHasPermission(actorId, "content.publish"));
}
