import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ProgrammaticGeneratedPost } from "./generate-programmatic-post";

export type SaveProgrammaticPostResult =
  | { ok: true; id: string; action: "insert" | "update" }
  | { ok: false; reason: "admin_unavailable" | "slug_exists" | "invalid_content" | "insert_failed"; message?: string };

export async function saveProgrammaticPost(post: ProgrammaticGeneratedPost): Promise<SaveProgrammaticPostResult> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, reason: "admin_unavailable", message: "Missing Supabase service role env." };

  const parsed = blogContentJsonSchema.safeParse(post.content_json);
  if (!parsed.success) {
    return { ok: false, reason: "invalid_content", message: parsed.error.message };
  }

  const reading_time_minutes = computeReadingTimeMinutes(parsed.data);

  const { data: existing, error: selErr } = await admin
    .from("blog_posts")
    .select("id,status")
    .eq("slug", post.slug)
    .maybeSingle();
  if (selErr) return { ok: false, reason: "insert_failed", message: selErr.message };

  const row = {
    title: post.title,
    h1: post.title,
    excerpt: post.excerpt,
    meta_title: post.meta_title,
    meta_description: post.meta_description,
    content_json: parsed.data,
    reading_time_minutes,
  };

  if (existing) {
    if (existing.status === "published") {
      return { ok: false, reason: "slug_exists" };
    }

    const { data: updated, error: upErr } = await admin
      .from("blog_posts")
      .update(row)
      .eq("slug", post.slug)
      .select("id")
      .single();

    if (upErr) {
      if (upErr.code === "23505") return { ok: false, reason: "slug_exists" };
      return { ok: false, reason: "insert_failed", message: upErr.message };
    }
    const id = updated?.id;
    if (!id || typeof id !== "string") return { ok: false, reason: "insert_failed", message: "No id after update." };
    return { ok: true, id, action: "update" };
  }

  const { data, error } = await admin
    .from("blog_posts")
    .insert({
      slug: post.slug,
      ...row,
      status: "draft",
      source: "programmatic",
      published_at: null,
      noindex: false,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, reason: "slug_exists" };
    return { ok: false, reason: "insert_failed", message: error.message };
  }
  const id = data?.id;
  if (!id || typeof id !== "string") return { ok: false, reason: "insert_failed", message: "No id returned." };
  return { ok: true, id, action: "insert" };
}
