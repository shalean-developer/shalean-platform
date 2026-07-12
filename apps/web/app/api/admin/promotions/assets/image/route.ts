import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { SOCIAL_IMAGE_SPECS, type CampaignAssetType } from "@/lib/promotions/campaignChannels";
import {
  CAMPAIGN_MEDIA_ALLOWED_MIME,
  CAMPAIGN_MEDIA_BUCKET,
  CAMPAIGN_MEDIA_MAX_BYTES,
  buildCampaignMediaPublicUrl,
  campaignMediaExtensionForMime,
  campaignMediaPathFromPublicUrl,
} from "@/lib/promotions/campaignMediaStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AssetRow = {
  id: string;
  promotion_id: string;
  asset_type: string;
  label: string;
  width: number | null;
  height: number | null;
  image_url: string | null;
  template_payload: Record<string, unknown>;
  sort_order: number;
};

async function loadAsset(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  assetId: string,
): Promise<AssetRow | null> {
  const { data, error } = await admin
    .from("campaign_assets")
    .select("id, promotion_id, asset_type, label, width, height, image_url, template_payload, sort_order")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as AssetRow | null) ?? null;
}

async function ensureAsset(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  promotionId: string,
  assetType: string,
): Promise<AssetRow> {
  const existing = await admin
    .from("campaign_assets")
    .select("id, promotion_id, asset_type, label, width, height, image_url, template_payload, sort_order")
    .eq("promotion_id", promotionId)
    .eq("asset_type", assetType)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data as AssetRow;

  const spec = SOCIAL_IMAGE_SPECS.find((s) => s.assetType === assetType);
  const { data, error } = await admin
    .from("campaign_assets")
    .insert({
      promotion_id: promotionId,
      asset_type: assetType,
      label: spec?.label ?? assetType,
      width: spec?.width ?? null,
      height: spec?.height ?? null,
      image_url: null,
      template_payload: { format: assetType },
      sort_order: spec ? SOCIAL_IMAGE_SPECS.indexOf(spec) : 50,
      updated_at: new Date().toISOString(),
    })
    .select("id, promotion_id, asset_type, label, width, height, image_url, template_payload, sort_order")
    .single();
  if (error) throw new Error(error.message);
  return data as AssetRow;
}

async function removeStoredObject(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  imageUrl: string | null | undefined,
) {
  const path = imageUrl ? campaignMediaPathFromPublicUrl(imageUrl) : null;
  if (!path) return;
  await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).remove([path]);
}

/**
 * POST — upload a custom image for a campaign asset (replaces generated preview).
 * multipart: file + assetId  OR  file + promotionId + assetType
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
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
  if (file.size > CAMPAIGN_MEDIA_MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 8 MB)." }, { status: 400 });
  }

  const mime = (file.type || "image/jpeg").split(";")[0]!.trim().toLowerCase();
  const ext = campaignMediaExtensionForMime(mime);
  if (!ext || !CAMPAIGN_MEDIA_ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: "Unsupported image type (use JPEG, PNG, WebP, or GIF)." },
      { status: 400 },
    );
  }

  const assetIdRaw = form.get("assetId");
  const promotionIdRaw = form.get("promotionId");
  const assetTypeRaw = form.get("assetType");
  const assetId = typeof assetIdRaw === "string" ? assetIdRaw.trim() : "";
  const promotionId = typeof promotionIdRaw === "string" ? promotionIdRaw.trim() : "";
  const assetType = typeof assetTypeRaw === "string" ? assetTypeRaw.trim() : "";

  try {
    let asset: AssetRow | null = null;
    if (assetId) {
      asset = await loadAsset(admin, assetId);
      if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    } else if (promotionId && assetType) {
      const allowed = new Set<string>([
        ...SOCIAL_IMAGE_SPECS.map((s) => s.assetType),
        "hero",
        "banner",
        "logo",
        "other",
      ]);
      if (!allowed.has(assetType as CampaignAssetType) && !allowed.has(assetType)) {
        return NextResponse.json({ error: "Invalid assetType." }, { status: 400 });
      }
      asset = await ensureAsset(admin, promotionId, assetType);
    } else {
      return NextResponse.json(
        { error: "Provide assetId, or promotionId + assetType." },
        { status: 400 },
      );
    }

    if (asset.asset_type === "qr_code") {
      return NextResponse.json({ error: "Cannot replace QR assets with uploads." }, { status: 400 });
    }

    const objectPath = `campaigns/${asset.promotion_id}/${asset.asset_type}/${crypto.randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).upload(objectPath, buf, {
      contentType: mime,
      upsert: false,
    });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const publicUrl = buildCampaignMediaPublicUrl(objectPath);
    if (!publicUrl) {
      await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).remove([objectPath]);
      return NextResponse.json({ error: "Could not build public URL." }, { status: 500 });
    }

    const previousUrl = asset.image_url;
    const prevPayload =
      asset.template_payload && typeof asset.template_payload === "object"
        ? asset.template_payload
        : {};

    const { data: updated, error: updErr } = await admin
      .from("campaign_assets")
      .update({
        image_url: publicUrl,
        template_payload: {
          ...prevPayload,
          customUpload: true,
          customUploadedAt: new Date().toISOString(),
          customUploadedBy: auth.email ?? null,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", asset.id)
      .select("id, promotion_id, asset_type, label, width, height, image_url, template_payload, sort_order")
      .single();

    if (updErr) {
      await admin.storage.from(CAMPAIGN_MEDIA_BUCKET).remove([objectPath]);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Best-effort cleanup of previous campaign-media object.
    if (previousUrl && previousUrl !== publicUrl) {
      await removeStoredObject(admin, previousUrl);
    }

    return NextResponse.json({ ok: true, asset: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed." },
      { status: 500 },
    );
  }
}

/**
 * DELETE — clear custom upload and restore generated template preview.
 * Query: ?assetId=
 */
export async function DELETE(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const assetId = new URL(request.url).searchParams.get("assetId")?.trim() ?? "";
  if (!assetId) {
    return NextResponse.json({ error: "assetId is required." }, { status: 400 });
  }

  try {
    const asset = await loadAsset(admin, assetId);
    if (!asset) return NextResponse.json({ error: "Asset not found." }, { status: 404 });
    if (asset.asset_type === "qr_code") {
      return NextResponse.json({ error: "Cannot clear QR assets this way." }, { status: 400 });
    }

    const prevPayload =
      asset.template_payload && typeof asset.template_payload === "object"
        ? { ...asset.template_payload }
        : {};
    delete prevPayload.customUpload;
    delete prevPayload.customUploadedAt;
    delete prevPayload.customUploadedBy;

    const { data: updated, error: updErr } = await admin
      .from("campaign_assets")
      .update({
        image_url: null,
        template_payload: prevPayload,
        updated_at: new Date().toISOString(),
      })
      .eq("id", asset.id)
      .select("id, promotion_id, asset_type, label, width, height, image_url, template_payload, sort_order")
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    await removeStoredObject(admin, asset.image_url);

    return NextResponse.json({ ok: true, asset: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to clear image." },
      { status: 500 },
    );
  }
}
