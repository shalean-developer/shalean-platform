import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { diagnoseFacebookPagePublishConfig } from "@/lib/promotions/facebookPublish";
import {
  disconnectFacebookConnection,
  getFacebookConnectionPublic,
  selectFacebookPage,
} from "@/lib/promotions/facebookConnectedAccount";
import {
  disconnectGoogleBusiness,
  getGoogleBusinessConnectionPublic,
  refreshGoogleBusinessLocations,
  sanitizeSocialAccount,
  selectGoogleBusinessLocation,
} from "@/lib/google-business";
import { isGoogleOAuthConfigured } from "@/lib/oauth/googleBusinessOAuth";
import { isFacebookOAuthConfigured, isFacebookEnvTokenFallbackAllowed } from "@/lib/oauth/metaFacebookOAuth";
import { isXOAuthConfigured } from "@/lib/oauth/xOAuth";
import { disconnectXConnection, getXConnectionPublic } from "@/lib/promotions/xPublish";
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
  pages?: unknown[];
  lastError?: string | null;
  oauthConfigured?: boolean;
  envFallbackAllowed?: boolean;
  tokenSource?: string | null;
  lastVerifiedAt?: string | null;
  featureFlag?: string;
  providerEnabled?: boolean;
  publishEnabled?: boolean;
  version?: string;
  characterLimit?: number | null;
  requiresImage?: boolean;
};

/**
 * GET — Connected Accounts overview for Marketing Hub.
 * Live FB/GBP/IG diagnostics + registry-aligned stubs (MKT-001D / MKT-001H).
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const fbPublic = await getFacebookConnectionPublic();
  const fbDiag = await diagnoseFacebookPagePublishConfig();
  const gbp = await getGoogleBusinessConnectionPublic();
  const xPublic = await getXConnectionPublic();
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
      const acct = fbPublic.account;
      const status =
        !entry.enabled
          ? "disabled"
          : acct?.status === "pending_location"
            ? "pending_location"
            : acct?.status === "error" || (fbDiag.configured && !fbDiag.okForPublish)
              ? "error"
              : fbDiag.okForPublish
                ? "connected"
                : acct?.status === "disconnected" || !acct
                  ? "disconnected"
                  : acct.status;

      const health =
        status === "connected"
          ? "healthy"
          : status === "pending_location"
            ? "degraded"
            : status === "error"
              ? "error"
              : "unknown";

      platforms.push({
        id: "facebook",
        label: entry.provider.displayName,
        available: entry.enabled,
        connected:
          Boolean(acct && (acct.status === "connected" || acct.status === "pending_location")) ||
          fbDiag.okForPublish,
        status,
        health,
        detail:
          !entry.enabled
            ? "Facebook is disabled by feature flag (MARKETING_PROVIDER_FACEBOOK)."
            : acct?.lastError ||
              fbDiag.hint ||
              (!fbPublic.oauthConfigured
                ? "Set FACEBOOK_APP_ID, FACEBOOK_APP_SECRET, and FACEBOOK_REDIRECT_URI."
                : null),
        lastSync: acct?.lastSync ?? null,
        lastPublishAt: acct?.lastPublishAt ?? null,
        accountName: acct?.accountName ?? fbDiag.tokenSubjectName,
        locationName: acct?.pageIdMasked
          ? `Page ${acct.pageIdMasked}`
          : fbDiag.pageId
            ? `Page ${fbDiag.pageId.slice(0, 4)}…`
            : null,
        pages: acct?.pages ?? [],
        lastError: acct?.lastError ?? null,
        oauthConfigured: fbPublic.oauthConfigured,
        envFallbackAllowed: fbPublic.envFallbackAllowed,
        tokenSource: fbDiag.source,
        lastVerifiedAt: acct?.lastVerifiedAt ?? null,
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

    if (key === "instagram") {
      if (!entry.enabled) {
        platforms.push({
          id: "instagram",
          label: entry.provider.displayName,
          available: false,
          connected: false,
          status: "disabled",
          health: "unknown",
          detail:
            "Instagram is disabled by feature flag (MARKETING_PROVIDER_INSTAGRAM). Enable only after MKT-001G staging verification.",
          lastSync: null,
          lastPublishAt: null,
          ...baseMeta,
          publishEnabled: false,
        });
        continue;
      }

      const status = await entry.provider.validateConnection();
      let lastSync: string | null = null;
      let lastPublishAt: string | null = null;
      if (admin) {
        const { data: igRow } = await admin
          .from("social_accounts")
          .select("last_sync, last_publish_at")
          .eq("provider", "instagram")
          .maybeSingle();
        lastSync = (igRow?.last_sync as string) ?? null;
        lastPublishAt = (igRow?.last_publish_at as string) ?? null;
      }

      platforms.push({
        id: "instagram",
        label: entry.provider.displayName,
        available: entry.enabled,
        connected: status.connected,
        status: status.statusLabel,
        health: status.health,
        detail: status.hint,
        lastSync,
        lastPublishAt,
        accountName: status.displayName,
        locationName: status.targetRef
          ? `IG ${String(status.targetRef).slice(0, 4)}…`
          : null,
        ...baseMeta,
      });
      continue;
    }

    if (key === "x") {
      if (!entry.enabled) {
        platforms.push({
          id: "x",
          label: entry.provider.displayName,
          available: false,
          connected: false,
          status: "disabled",
          health: "unknown",
          detail:
            "X is disabled by feature flag (MARKETING_PROVIDER_X). Enable only after staging OAuth + publish verification.",
          lastSync: null,
          lastPublishAt: null,
          oauthConfigured: isXOAuthConfigured(),
          ...baseMeta,
          publishEnabled: false,
        });
        continue;
      }

      const status = await entry.provider.validateConnection();
      platforms.push({
        id: "x",
        label: entry.provider.displayName,
        available: entry.enabled,
        connected: status.connected && xPublic.connected,
        status: status.statusLabel,
        health: status.health,
        detail: status.hint ?? xPublic.lastError,
        lastSync: xPublic.lastSync,
        lastPublishAt: xPublic.lastPublishAt,
        accountName: status.displayName ?? xPublic.accountName,
        locationName: xPublic.username ? `@${xPublic.username}` : xPublic.userIdMasked,
        lastError: xPublic.lastError,
        oauthConfigured: isXOAuthConfigured(),
        ...baseMeta,
      });
      continue;
    }

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
      source: fbDiag.source,
      oauthConfigured: isFacebookOAuthConfigured(),
      envFallbackAllowed: isFacebookEnvTokenFallbackAllowed(),
      account: fbPublic.account,
    },
    oauth: {
      googleConfigured: isGoogleOAuthConfigured(),
      facebookConfigured: isFacebookOAuthConfigured(),
      xConfigured: isXOAuthConfigured(),
    },
    history,
    ops: {
      failedLast24h: failedRecent,
    },
  });
}

/**
 * POST — Google Business + Facebook Connected Accounts actions
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    locationId?: string;
    accountId?: string;
    pageId?: string;
    confirmReplace?: boolean;
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

  if (action === "select_facebook_page") {
    if (!body.pageId?.trim()) {
      return NextResponse.json({ error: "pageId is required." }, { status: 400 });
    }
    const result = await selectFacebookPage({
      pageId: body.pageId.trim(),
      actor: auth.email,
      confirmReplace: Boolean(body.confirmReplace),
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      account: {
        status: result.account.status,
        accountName: result.account.account_name,
        pageIdMasked: result.account.account_id
          ? `${String(result.account.account_id).slice(0, 4)}…`
          : null,
      },
    });
  }

  if (action === "disconnect_facebook") {
    const result = await disconnectFacebookConnection({ actor: auth.email });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "disconnect_x") {
    const result = await disconnectXConnection({ actor: auth.email });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
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
