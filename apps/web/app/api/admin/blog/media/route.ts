import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/api/admin-auth-request";
import {
  BLOG_MEDIA_ALLOWED_MIME,
  BLOG_MEDIA_BUCKET,
  BLOG_MEDIA_MAX_BYTES,
  blogMediaExtensionForMime,
  buildBlogMediaPublicUrl,
} from "@/lib/blog/blog-media-storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFolder(raw: string | null): string {
  const t = (raw ?? "editorial").trim().toLowerCase();
  if (!t || !/^[a-z0-9][a-z0-9-]{0,48}$/.test(t)) return "editorial";
  return t;
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }
  if (file.size > BLOG_MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 5 MB)." }, { status: 400 });
  }

  const mime = (file.type || "image/jpeg").split(";")[0]!.trim().toLowerCase();
  const ext = blogMediaExtensionForMime(mime);
  if (!ext || !BLOG_MEDIA_ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "Unsupported image type (use JPEG, PNG, WebP, or GIF)." }, { status: 400 });
  }

  const folderRaw = form.get("folder");
  const folder = safeFolder(typeof folderRaw === "string" ? folderRaw : null);
  const objectPath = `${folder}/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from(BLOG_MEDIA_BUCKET).upload(objectPath, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const publicUrl = buildBlogMediaPublicUrl(objectPath);
  if (!publicUrl) {
    await admin.storage.from(BLOG_MEDIA_BUCKET).remove([objectPath]);
    return NextResponse.json({ error: "Could not build public URL." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    path: objectPath,
    url: publicUrl,
  });
}
