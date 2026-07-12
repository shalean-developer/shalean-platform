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
};

/**
 * GET — Connected Accounts overview for Marketing Hub.
 * Facebook uses env Page tokens; Google Business uses OAuth + social_accounts.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const fbDiag = await diagnoseFacebookPagePublishConfig();
  const fbCfg = getFacebookPagePublishConfig();
  const gbp = await getGoogleBusinessConnectionPublic();

  const admin = getSupabaseAdmin();
  let history: unknown[] = [];
  if (admin) {
    const { data } = await admin
      .from("social_publish_history")
      .select("id, provider, promotion_id, campaign_name, status, response_id, error_message, published_by, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    history = data ?? [];
  }

  const platforms: PlatformCard[] = [
    {
      id: "facebook",
      label: "Facebook",
      available: true,
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
    },
    {
      id: "instagram",
      label: "Instagram",
      available: true,
      connected: false,
      status: "disconnected",
      health: "unknown",
      detail: "Publish via Facebook Page / Meta Business Suite for now.",
      lastSync: null,
      lastPublishAt: null,
    },
    {
      id: "google_business",
      label: "Google Business Profile",
      available: true,
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
    },
    {
      id: "linkedin",
      label: "LinkedIn",
      available: false,
      connected: false,
      status: "coming_soon",
      health: "unknown",
      detail: null,
      lastSync: null,
      lastPublishAt: null,
    },
    {
      id: "pinterest",
      label: "Pinterest",
      available: false,
      connected: false,
      status: "coming_soon",
      health: "unknown",
      detail: null,
      lastSync: null,
      lastPublishAt: null,
    },
    {
      id: "twitter",
      label: "X",
      available: false,
      connected: false,
      status: "coming_soon",
      health: "unknown",
      detail: null,
      lastSync: null,
      lastPublishAt: null,
    },
  ];

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
