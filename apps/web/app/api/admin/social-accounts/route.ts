import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { diagnoseFacebookPagePublishConfig, getFacebookPagePublishConfig } from "@/lib/promotions/facebookPublish";
import {
  disconnectGoogleBusiness,
  getGoogleBusinessConnectionPublic,
  refreshGoogleBusinessLocations,
  sanitizeSocialAccount,
  selectGoogleBusinessLocation,
} from "@/lib/google-business";
import { isGoogleOAuthConfigured } from "@/lib/oauth/googleBusinessOAuth";
import { getProviderRegistry } from "@/lib/promotions/providers";
import type { ProviderKey } from "@/lib/promotions/providers/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlatformCard = {
  id: string;
  label: string;
  available: boolean;
  connected: boolean;
  status: string;
  health: string;
  detail: string | null;
  lastSync: string | null;
  lastPublishAt: string | null;
  accountName?: string | null;
  locationName?: string | null;
  locations?: unknown[];
  lastError?: string | null;
  oauthConfigured?: boolean;
  /** MKT-001D — registry metadata */
  featureFlag?: string;
  providerEnabled?: boolean;
  publishEnabled?: boolean;
  version?: string;
  characterLimit?: number | null;
  requiresImage?: boolean;
};

/**
 * GET — Connected Accounts overview for Marketing Hub.
 * Live FB/GBP diagnostics + registry-aligned stubs (MKT-001D).
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const fbDiag = await diagnoseFacebookPagePublishConfig();
  const fbCfg = getFacebookPagePublishConfig();
  const gbp = await getGoogleBusinessConnectionPublic();
  const registry = getProviderRegistry();

  const admin = getSupabaseAdmin();
  let history: unknown[] = [];
  if (admin) {
    const { data } = await admin
      .from("social_publish_history")
      .select("id, provider, promotion_id, campaign_name, status, response_id, error_message, published_by, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    history = data ?? [];
  }

  const failedRecent = (history as Array<{ status: string; created_at: string }>).filter((h) => {
    if (h.status !== "failed") return false;
    const t = Date.parse(h.created_at);
    return !Number.isNaN(t) && Date.now() - t < 24 * 60 * 60 * 1000;
  }).length;

  const platforms: PlatformCard[] = [];

  for (const entry of registry.listEntries()) {
    const key = entry.provider.key as ProviderKey;
    const caps = entry.provider.getCapabilities();
    const baseMeta = {
      featureFlag: entry.featureFlag,
      providerEnabled: entry.enabled,
      publishEnabled: caps.publishEnabled && entry.enabled,
      version: entry.provider.version,
      characterLimit: caps.characterLimit,
      requiresImage: caps.requiresImage,
    };

    if (key === "facebook") {
      platforms.push({
        id: "facebook",
        label: entry.provider.displayName,
        available: entry.enabled,
        connected: fbDiag.configured && fbDiag.okForPublish,
        status: !fbDiag.configured
          ? "disconnected"
          : fbDiag.okForPublish
            ? "connected"
            : "error",
        health: !fbDiag.configured ? "unknown" : fbDiag.okForPublish ? "healthy" : "error",
        detail: fbDiag.hint,
        lastSync: null,
        lastPublishAt: null,
        accountName: fbDiag.tokenSubjectName,
        locationName: fbCfg ? `Page ${fbCfg.pageId.slice(0, 4)}…` : null,
        ...baseMeta,
      });
      continue;
    }

    if (key === "google_business") {
      platforms.push({
        id: "google_business",
        label: entry.provider.displayName,
        available: entry.enabled,
        connected: Boolean(gbp.connected),
        status: (gbp.account?.status as string) ?? (gbp.connected ? "connected" : "disconnected"),
        health: (gbp.account?.health as string) ?? "unknown",
        detail:
          typeof gbp.account?.lastError === "string"
            ? gbp.account.lastError
            : gbp.oauthConfigured
              ? null
              : "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
        lastSync: (gbp.account?.lastSync as string) ?? null,
        lastPublishAt: (gbp.account?.lastPublishAt as string) ?? null,
        accountName: (gbp.account?.accountName as string) ?? null,
        locationName: (gbp.account?.locationName as string) ?? null,
        locations: (gbp.account?.locations as unknown[]) ?? [],
        lastError: (gbp.account?.lastError as string) ?? null,
        oauthConfigured: gbp.oauthConfigured,
        ...baseMeta,
      });
      continue;
    }

    // Stubs / non-live providers — never claim available publish.
    platforms.push({
      id: key,
      label: entry.provider.displayName,
      available: false,
      connected: false,
      status: entry.enabled ? "disabled" : "coming_soon",
      health: "unknown",
      detail: entry.enabled
        ? `${entry.provider.displayName} is flagged on but no live adapter is implemented yet.`
        : `${entry.provider.displayName} publishing is not enabled. Copy / download workflows still work from Social Posts.`,
      lastSync: null,
      lastPublishAt: null,
      ...baseMeta,
      publishEnabled: false,
    });
  }

  return NextResponse.json({
    platforms,
    google: gbp,
    facebook: {
      configured: fbDiag.configured,
      okForPublish: fbDiag.okForPublish,
      hint: fbDiag.hint,
      tokenKind: fbDiag.tokenKind,
    },
    oauth: {
      googleConfigured: isGoogleOAuthConfigured(),
    },
    history,
    ops: {
      failedLast24h: failedRecent,
    },
  });
}

/**
 * POST — Google Business actions: select_location | refresh | disconnect
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    locationId?: string;
    accountId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const action = body.action?.trim();
  if (!action) {
    return NextResponse.json({ error: "action is required." }, { status: 400 });
  }

  if (action === "select_location") {
    if (!body.locationId?.trim()) {
      return NextResponse.json({ error: "locationId is required." }, { status: 400 });
    }
    const result = await selectGoogleBusinessLocation({
      locationId: body.locationId.trim(),
      accountId: body.accountId?.trim() || null,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, account: sanitizeSocialAccount(result.account) });
  }

  if (action === "refresh") {
    const result = await refreshGoogleBusinessLocations();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      account: sanitizeSocialAccount(result.account),
      locations: result.locations,
    });
  }

  if (action === "disconnect") {
    const result = await disconnectGoogleBusiness();
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
