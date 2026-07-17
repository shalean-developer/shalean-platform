import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getProviderRegistry } from "@/lib/promotions/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — Registry snapshot for Marketing Hub (no secrets).
 * Used for feature-flag / capability-aware publish UI (MKT-001D).
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const registry = getProviderRegistry();
  const providers = registry.listEntries().map((entry) => {
    const caps = entry.provider.getCapabilities();
    return {
      key: entry.provider.key,
      displayName: entry.provider.displayName,
      version: entry.provider.version,
      enabled: entry.enabled,
      featureFlag: entry.featureFlag,
      capabilities: {
        images: caps.images,
        multipleImages: caps.multipleImages,
        video: caps.video,
        links: caps.links,
        scheduling: caps.scheduling,
        locationPosts: caps.locationPosts,
        characterLimit: caps.characterLimit,
        richFormatting: caps.richFormatting,
        requiresImage: caps.requiresImage,
        publishEnabled: caps.publishEnabled,
      },
      publishable: entry.enabled && caps.publishEnabled,
    };
  });

  return NextResponse.json({ providers });
}
