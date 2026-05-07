import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  bookingStatusAllowsServiceQaMutation,
  PHOTO_BUCKET,
  resolveCleanerBookingForQa,
} from "@/lib/booking/bookingServiceQaServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const resolved = await resolveCleanerBookingForQa(admin, request, bookingId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  if (!bookingStatusAllowsServiceQaMutation(resolved.booking.status)) {
    return NextResponse.json({ error: "Cannot upload photos for this booking status." }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const section_key_raw = form.get("section_key");
  const photo_type_raw = form.get("photo_type");
  const file = form.get("file");

  const sectionKey =
    typeof section_key_raw === "string" ? section_key_raw.trim().toLowerCase() : "";
  const photoType =
    typeof photo_type_raw === "string" ? photo_type_raw.trim().toLowerCase() : "";

  if (!sectionKey || !resolved.profile.sections.includes(sectionKey)) {
    return NextResponse.json({ error: "Invalid section_key." }, { status: 400 });
  }
  if (photoType !== "before" && photoType !== "after") {
    return NextResponse.json({ error: "photo_type must be before or after." }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file required." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 5 MB)." }, { status: 400 });
  }

  const mime = (file.type || "image/jpeg").split(";")[0]!.trim().toLowerCase();
  const ext = ALLOWED.get(mime);
  if (!ext) {
    return NextResponse.json({ error: "Unsupported image type (use JPEG, PNG, or WebP)." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const objectPath = `${bookingId}/${resolved.cleanerId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await admin.storage.from(PHOTO_BUCKET).upload(objectPath, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data: inserted, error: insErr } = await admin
    .from("booking_service_photos")
    .insert({
      booking_id: bookingId,
      cleaner_id: resolved.cleanerId,
      section_key: sectionKey,
      photo_type: photoType,
      storage_path: objectPath,
    })
    .select("id, created_at")
    .maybeSingle();

  if (insErr || !inserted) {
    await admin.storage.from(PHOTO_BUCKET).remove([objectPath]);
    return NextResponse.json({ error: insErr?.message ?? "Insert failed." }, { status: 500 });
  }

  const { data: signed } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(objectPath, 3600);

  return NextResponse.json({
    ok: true,
    id: (inserted as { id: string }).id,
    created_at: (inserted as { created_at: string }).created_at,
    signed_url: signed?.signedUrl ?? null,
  });
}
