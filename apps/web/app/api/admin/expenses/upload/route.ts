import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireFinanceApi } from "@/lib/auth/requireFinanceApi";
import {
  EXPENSE_RECEIPT_ALLOWED_MIME,
  EXPENSE_RECEIPT_BUCKET,
  EXPENSE_RECEIPT_MAX_BYTES,
  expenseReceiptExtensionForMime,
} from "@/lib/admin/expenses/receiptStorage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireFinanceApi(request);
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
  if (file.size > EXPENSE_RECEIPT_MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)." }, { status: 400 });
  }

  const mime = (file.type || "image/jpeg").split(";")[0]!.trim().toLowerCase();
  const ext = expenseReceiptExtensionForMime(mime);
  if (!ext || !EXPENSE_RECEIPT_ALLOWED_MIME.has(mime)) {
    return NextResponse.json({ error: "Unsupported file type (use JPEG, PNG, WebP, GIF, or PDF)." }, { status: 400 });
  }

  const objectPath = `${auth.userId}/${crypto.randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage.from(EXPENSE_RECEIPT_BUCKET).upload(objectPath, buf, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: signed } = await admin.storage
    .from(EXPENSE_RECEIPT_BUCKET)
    .createSignedUrl(objectPath, 3600);

  return NextResponse.json({
    ok: true,
    path: objectPath,
    mime,
    signed_url: signed?.signedUrl ?? null,
  });
}
