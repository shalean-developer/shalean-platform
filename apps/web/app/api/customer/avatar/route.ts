import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { requireCustomerSession } from "@/lib/auth/customerBearer";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { CUSTOMER_AVATAR_BUCKET, CUSTOMER_AVATAR_MAX_BYTES, ownedCustomerAvatarPath } from "@/lib/customer/customerAvatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const failure = (message: string, status: number) => NextResponse.json({ error: message }, { status });

async function context(request: Request) {
  const auth = await requireCustomerSession(request);
  if (!auth.ok) return { response: auth.response };
  const admin = getSupabaseAdmin();
  if (!admin) return { response: failure("Photo storage is temporarily unavailable.", 503) };
  const { data, error } = await admin.auth.admin.getUserById(auth.session.userId);
  if (error || !data.user) return { response: failure("Please sign in again.", 401) };
  return { admin, user: data.user };
}

export async function GET(request: Request) {
  const ctx = await context(request);
  if (ctx.response) return ctx.response;
  const path = ownedCustomerAvatarPath(ctx.user.id, ctx.user.user_metadata.customer_avatar_path);
  if (!path) return failure("No profile photo.", 404);
  const { data, error } = await ctx.admin.storage.from(CUSTOMER_AVATAR_BUCKET).download(path);
  if (error || !data) return failure("Photo unavailable.", 404);
  return new NextResponse(await data.arrayBuffer(), { headers: {
    "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export async function POST(request: Request) {
  const ctx = await context(request);
  if (ctx.response) return ctx.response;
  if (Number(request.headers.get("content-length")) > CUSTOMER_AVATAR_MAX_BYTES + 65536) return failure("Use a photo smaller than 2 MB.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return failure("Choose a photo to upload.", 400); }
  const file = form.get("file");
  if (!(file instanceof Blob) || !file.size) return failure("Choose a photo to upload.", 400);
  if (file.size > CUSTOMER_AVATAR_MAX_BYTES) return failure("Use a photo smaller than 2 MB.", 413);
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return failure("Use a JPG, PNG or WebP photo.", 400);
  let image: Buffer;
  try {
    image = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 24000000 })
      .rotate().resize(256, 256, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
  } catch { return failure("This image could not be read. Try another JPG, PNG or WebP photo.", 400); }

  // Private bucket; clients never receive direct storage read/write permissions.
  let bucket = await ctx.admin.storage.getBucket(CUSTOMER_AVATAR_BUCKET);
  if (bucket.error) {
    await ctx.admin.storage.createBucket(CUSTOMER_AVATAR_BUCKET, {
      public: false, allowedMimeTypes: ["image/webp"], fileSizeLimit: CUSTOMER_AVATAR_MAX_BYTES,
    });
    bucket = await ctx.admin.storage.getBucket(CUSTOMER_AVATAR_BUCKET);
  }
  if (bucket.error || !bucket.data || bucket.data.public) return failure("Photo storage is temporarily unavailable.", 503);
  const path = `${ctx.user.id}/${randomUUID()}.webp`;
  const storage = ctx.admin.storage.from(CUSTOMER_AVATAR_BUCKET);
  const uploaded = await storage.upload(path, image, { contentType: "image/webp", upsert: false });
  if (uploaded.error) return failure("Your photo could not be uploaded. Please try again.", 500);
  const saved = await ctx.admin.auth.admin.updateUserById(ctx.user.id, {
    user_metadata: { customer_avatar_path: path, customer_avatar_removed: false },
  });
  if (saved.error) {
    await storage.remove([path]);
    return failure("Your photo could not be saved. Your previous photo is unchanged.", 500);
  }
  const oldPath = ownedCustomerAvatarPath(ctx.user.id, ctx.user.user_metadata.customer_avatar_path);
  if (oldPath) await storage.remove([oldPath]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const ctx = await context(request);
  if (ctx.response) return ctx.response;
  const saved = await ctx.admin.auth.admin.updateUserById(ctx.user.id, {
    user_metadata: { customer_avatar_path: null, customer_avatar_removed: true },
  });
  if (saved.error) return failure("Your photo could not be removed. Please try again.", 500);
  const path = ownedCustomerAvatarPath(ctx.user.id, ctx.user.user_metadata.customer_avatar_path);
  if (path) await ctx.admin.storage.from(CUSTOMER_AVATAR_BUCKET).remove([path]);
  return NextResponse.json({ ok: true });
}
