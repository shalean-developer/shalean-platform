"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Copy,
  Download,
  ExternalLink,
  Gift,
  ImagePlus,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Share2,
  Sparkles,
  Square,
  Eye,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, getAdminToken, useAdminData } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { emitAdminToast } from "@/lib/admin/toastBus";
import { CHANNEL_LABELS, type CampaignContentChannel } from "@/lib/promotions/campaignChannels";
import {
  captureNodeAsPngDataUrl,
  copyTextToClipboard,
  downloadDataUrl,
  downloadImageUrl,
  isCustomCampaignAssetImage,
} from "@/lib/promotions/socialExport";
import { SocialImageCard } from "@/components/admin/promotions/SocialImageCard";
import type { SocialTrustItem } from "@/components/admin/promotions/social-design";
import { canonicalizePublicSiteUrl } from "@/lib/promotions/offerCopy";
import { validatePublishPayloadClient } from "@/lib/promotions/providerLimits";
import {
  formatPublishFailureToast,
  type PublishFailureFields,
} from "@/lib/promotions/publishFailureUi";
import type { PromotionRow, PromotionStatus, PromotionType } from "@/lib/promotions/types";
import {
  canInvokePublish,
  formatSafeRoi,
  isCampaignFormDirty,
  registryAllowsPublish,
  type RegistryProviderSnapshot,
} from "@/lib/promotions/marketingUx";
import {
  MarketingEmptyState,
  MarketingSectionSkeleton,
} from "@/components/admin/promotions/MarketingEmptyState";
import { MarketingSubNav } from "@/components/admin/promotions/MarketingSubNav";

function socialCardPropsFromPayload(
  payload: Record<string, unknown>,
  fallbacks: {
    offer?: string;
    headline?: string;
    subheadline?: string | null;
    cta?: string | null;
    format?: string | null;
  } = {},
) {
  const trustRaw = payload.trustItems;
  const trustItems = Array.isArray(trustRaw)
    ? (trustRaw as SocialTrustItem[]).filter(
        (t) => t && typeof t === "object" && typeof t.label === "string",
      )
    : undefined;
  const benefitsRaw = payload.benefits;
  const benefits = Array.isArray(benefitsRaw)
    ? benefitsRaw.filter((b): b is string => typeof b === "string")
    : undefined;

  return {
    brand: payload.brand != null ? String(payload.brand) : "Shalean",
    offer: String(payload.offer ?? fallbacks.offer ?? "Special offer"),
    headline: String(payload.headline ?? fallbacks.headline ?? "Shalean"),
    subheadline:
      payload.subheadline != null
        ? String(payload.subheadline)
        : (fallbacks.subheadline ?? null),
    promoCode: payload.promoCode != null ? String(payload.promoCode) : null,
    cta: fallbacks.cta ?? (payload.cta != null ? String(payload.cta) : "Book Now"),
    primary: payload.primary != null ? String(payload.primary) : "#0B1F4A",
    accent: payload.accent != null ? String(payload.accent) : "#2563EB",
    landing: payload.landing != null ? String(payload.landing) : null,
    format:
      payload.format != null
        ? String(payload.format)
        : (fallbacks.format ?? null),
    heroImageUrl: payload.heroImageUrl != null ? String(payload.heroImageUrl) : null,
    logoUrl: payload.logoUrl != null ? String(payload.logoUrl) : null,
    endsAt: payload.endsAt != null ? String(payload.endsAt) : null,
    campaignName: payload.campaignName != null ? String(payload.campaignName) : null,
    badgeLabel: payload.badgeLabel != null ? String(payload.badgeLabel) : null,
    ratingLabel: payload.ratingLabel != null ? String(payload.ratingLabel) : null,
    benefits,
    trustItems,
  };
}

type AnalyticsPayload = {
  summaries: {
    promotionId: string;
    name: string;
    type: string;
    status: string;
    views: number;
    clicks: number;
    redemptions: number;
    revenueGeneratedZar: number;
    budgetSpentZar: number;
    conversionRate: number;
    roi: number | null;
  }[];
  totals: {
    views: number;
    clicks: number;
    redemptions: number;
    revenueZar: number;
    discountCostZar: number;
  };
};

type ContentRow = {
  id: string;
  promotion_id?: string;
  channel: CampaignContentChannel;
  title: string | null;
  body: string;
  hashtags: string[];
  cta: string | null;
  html_body: string | null;
  status: string;
  generated_by: string;
  promotion?: { name: string; slug: string; status: string };
};

type AssetRow = {
  id: string;
  promotion_id?: string;
  asset_type: string;
  label: string;
  width: number | null;
  height: number | null;
  image_url: string | null;
  template_payload: Record<string, unknown>;
  promotion?: { name: string; slug: string; status: string };
};

async function uploadCampaignAssetImage(args: {
  file: File;
  assetId?: string | null;
  promotionId?: string | null;
  assetType?: string | null;
}): Promise<{ ok: true; asset: AssetRow } | { ok: false; error: string }> {
  const token = await getAdminToken();
  if (!token) return { ok: false, error: "Not authenticated" };

  const form = new FormData();
  form.set("file", args.file);
  if (args.assetId) form.set("assetId", args.assetId);
  if (args.promotionId) form.set("promotionId", args.promotionId);
  if (args.assetType) form.set("assetType", args.assetType);

  try {
    const res = await fetch("/api/admin/promotions/assets/image", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      asset?: AssetRow;
    };
    if (!res.ok || !json.asset) {
      return { ok: false, error: json.error ?? `Upload failed (${res.status})` };
    }
    return { ok: true, asset: json.asset };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}

async function clearCampaignAssetImage(
  assetId: string,
): Promise<{ ok: true; asset: AssetRow } | { ok: false; error: string }> {
  const res = await adminFetch<{ asset: AssetRow }>(
    `/api/admin/promotions/assets/image?assetId=${encodeURIComponent(assetId)}`,
    { method: "DELETE" },
  );
  if (!res.ok || !res.data?.asset) {
    return { ok: false, error: res.error ?? "Could not restore template." };
  }
  return { ok: true, asset: res.data.asset };
}

type TemplateRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  default_discount_value: number;
  default_promo_code_prefix: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  scheduled: "bg-blue-100 text-blue-700",
  draft: "bg-slate-100 text-slate-600",
  paused: "bg-amber-100 text-amber-800",
  expired: "bg-gray-100 text-gray-600",
  ended: "bg-red-100 text-red-700",
};

const CONTENT_STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  ready: "bg-blue-100 text-blue-700",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-600",
};

function formatZar(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

type HubView =
  | "campaigns"
  | "social"
  | "email"
  | "landing"
  | "analytics"
  | "templates"
  | "assets";

const VIEW_META: Record<HubView, { title: string; blurb: string }> = {
  campaigns: {
    title: "Campaigns",
    blurb: "Create promotions and generate multi-channel content from one place.",
  },
  social: {
    title: "Social Posts",
    blurb:
      "One-click publish for Facebook Page and Google Business Profile. Other channels support copy and download until their adapters ship.",
  },
  email: {
    title: "Email Campaigns",
    blurb: "Generated HTML email drafts ready to paste into your ESP or templates.",
  },
  landing: {
    title: "Landing Pages",
    blurb: "Auto-generated campaign landing pages at /campaigns/[slug].",
  },
  analytics: {
    title: "Campaign Analytics",
    blurb: "Views, redemptions, revenue, and ROI by campaign.",
  },
  templates: {
    title: "Campaign Templates",
    blurb: "Launch First Booking, Seasonal, Black Friday, and more without writing code.",
  },
  assets: {
    title: "Campaign Assets",
    blurb: "Social image templates and QR codes for each campaign.",
  },
};

export function CampaignMarketingHub({ view = "campaigns" }: { view?: HubView }) {
  const meta = VIEW_META[view];
  const [tab, setTab] = useState(
    view === "analytics" ? "analytics" : view === "templates" ? "templates" : "promotions",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailContent, setDetailContent] = useState<ContentRow[]>([]);
  const [detailAssets, setDetailAssets] = useState<AssetRow[]>([]);
  const editPanelRef = useRef<HTMLDivElement>(null);
  const emptyForm = {
    name: "",
    description: "",
    promotion_type: "seasonal" as PromotionType,
    discount_type: "percent",
    discount_value: 10,
    promo_code: "",
    cta_label: "",
    auto_apply: false,
    starts_at: "",
    ends_at: "",
    show_on_homepage: true,
    show_on_booking: true,
    show_featured_card: true,
    show_popup: true,
    show_announcement_bar: true,
    generate: true,
  };
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);

  const params = useMemo(() => {
    const p: Record<string, string> = {};
    if (statusFilter) p.status = statusFilter;
    if (search.trim()) p.search = search.trim();
    return p;
  }, [statusFilter, search]);

  const { data, loading, error, refetch } = useAdminData<{ promotions: PromotionRow[] }>(
    "/api/admin/promotions",
    { params },
  );
  const promotions = data?.promotions ?? [];

  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [memberships, setMemberships] = useState<{
    plans: Record<string, unknown>[];
    stats: { activeMembers: number };
  } | null>(null);
  const [automation, setAutomation] = useState<Record<string, unknown>[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [allContent, setAllContent] = useState<ContentRow[]>([]);
  const [allAssets, setAllAssets] = useState<AssetRow[]>([]);
  const [facebookConfigured, setFacebookConfigured] = useState(false);
  const [facebookHint, setFacebookHint] = useState<string | null>(null);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [googleHint, setGoogleHint] = useState<string | null>(null);
  const [providerRegistry, setProviderRegistry] = useState<RegistryProviderSnapshot[] | null>(
    null,
  );
  const createBaselineRef = useRef(emptyForm);
  const editBaselineRef = useRef(emptyForm);

  const loadAnalytics = useCallback(async () => {
    const res = await adminFetch<AnalyticsPayload>("/api/admin/promotions/analytics");
    if (res.data) setAnalytics(res.data);
  }, []);

  const loadMemberships = useCallback(async () => {
    const res = await adminFetch<{
      plans: Record<string, unknown>[];
      stats: { activeMembers: number };
    }>("/api/admin/memberships");
    if (res.data) setMemberships(res.data);
  }, []);

  const loadAutomation = useCallback(async () => {
    const res = await adminFetch<{ rules: Record<string, unknown>[] }>("/api/admin/marketing-automation");
    if (res.data?.rules) setAutomation(res.data.rules);
  }, []);

  const loadTemplates = useCallback(async () => {
    const res = await adminFetch<{ templates: TemplateRow[] }>("/api/admin/campaign-templates");
    if (res.data?.templates) setTemplates(res.data.templates);
  }, []);

  const loadFacebookStatus = useCallback(async () => {
    const res = await adminFetch<{
      configured: boolean;
      okForPublish?: boolean;
      tokenKind?: string | null;
      hint?: string | null;
    }>("/api/admin/promotions/publish-facebook");
    setFacebookConfigured(Boolean(res.data?.configured));
    if (res.data?.configured && res.data.okForPublish === false && res.data.hint) {
      setFacebookHint(res.data.hint);
    } else if (res.data?.tokenKind === "user") {
      setFacebookHint(
        "FACEBOOK_PAGE_ACCESS_TOKEN is a User token. Replace it with the Page access_token from GET /me/accounts, then restart the server.",
      );
    } else {
      setFacebookHint(null);
    }
  }, []);

  const loadGoogleStatus = useCallback(async () => {
    const res = await adminFetch<{
      configured: boolean;
      connected?: boolean;
      hint?: string | null;
    }>("/api/admin/promotions/publish-google-business");
    setGoogleConfigured(Boolean(res.data?.configured));
    setGoogleHint(res.data?.hint ?? null);
  }, []);

  const loadProviderRegistry = useCallback(async () => {
    const res = await adminFetch<{ providers: RegistryProviderSnapshot[] }>(
      "/api/admin/promotions/providers",
    );
    if (res.data?.providers) setProviderRegistry(res.data.providers);
  }, []);

  const facebookPublishable =
    facebookConfigured && registryAllowsPublish(providerRegistry, "facebook");
  const googlePublishable =
    googleConfigured && registryAllowsPublish(providerRegistry, "google_business");

  const loadContentHub = useCallback(async () => {
    if (view === "assets" || view === "social") {
      const assetsRes = await adminFetch<{ assets: AssetRow[] }>(
        "/api/admin/campaign-templates?view=assets",
      );
      if (assetsRes.data?.assets) setAllAssets(assetsRes.data.assets);
    }
    if (view === "assets") return;

    const channel =
      view === "email" ? "email" : view === "landing" ? "landing" : null;
    const qs = channel
      ? `?view=content&channel=${channel}`
      : view === "social"
        ? "?view=content"
        : null;
    if (!qs) return;

    const res = await adminFetch<{ content: ContentRow[] }>(`/api/admin/campaign-templates${qs}`);
    if (res.data?.content) {
      const socialChannels = new Set([
        "facebook",
        "instagram",
        "linkedin",
        "twitter",
        "whatsapp",
        "google_business",
        "pinterest",
      ]);
      setAllContent(
        view === "social"
          ? res.data.content.filter((c) => socialChannels.has(c.channel))
          : res.data.content,
      );
    }
  }, [view]);

  useEffect(() => {
    void loadAnalytics();
    void loadMemberships();
    void loadAutomation();
    void loadTemplates();
    void loadContentHub();
    void loadFacebookStatus();
    void loadGoogleStatus();
    void loadProviderRegistry();
  }, [
    loadAnalytics,
    loadMemberships,
    loadAutomation,
    loadTemplates,
    loadContentHub,
    loadFacebookStatus,
    loadGoogleStatus,
    loadProviderRegistry,
  ]);

  const formDirty = useMemo(() => {
    if (showCreate) {
      return isCampaignFormDirty(
        createForm as unknown as Record<string, unknown>,
        createBaselineRef.current as unknown as Record<string, unknown>,
      );
    }
    if (editingId) {
      return isCampaignFormDirty(
        editForm as unknown as Record<string, unknown>,
        editBaselineRef.current as unknown as Record<string, unknown>,
      );
    }
    return false;
  }, [showCreate, editingId, createForm, editForm]);

  useEffect(() => {
    if (!formDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formDirty]);

  async function loadDetail(id: string) {
    setSelectedId(id);
    const res = await adminFetch<{ content: ContentRow[]; assets: AssetRow[] }>(
      `/api/admin/promotions/${id}/generate`,
    );
    if (res.data) {
      setDetailContent(res.data.content ?? []);
      setDetailAssets(res.data.assets ?? []);
    }
  }

  async function runAction(id: string, action: string): Promise<boolean> {
    setBusy(`${id}:${action}`);
    const res = await adminFetch(`/api/admin/promotions/${id}`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return false;
    }
    const doneLabel: Record<string, string> = {
      pause: "paused",
      resume: "resumed",
      end: "ended",
      activate: "activated",
      schedule: "scheduled",
      duplicate: "duplicated",
    };
    emitAdminToast(`Campaign ${doneLabel[action] ?? `${action}d`}.`, "success");
    void refetch();
    void loadAnalytics();
    return true;
  }

  async function generateCampaign(id: string) {
    setBusy(`${id}:generate`);
    const res = await adminFetch<{ generatedBy: string }>(`/api/admin/promotions/${id}/generate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return;
    }
    emitAdminToast(
      `Campaign content generated (${res.data?.generatedBy ?? "template"}).`,
      "success",
    );
    await loadDetail(id);
    void refetch();
    void loadContentHub();
  }

  function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function openEdit(p: PromotionRow) {
    setShowCreate(false);
    setSelectedId(null);
    setEditingId(p.id);
    const next = {
      name: p.name,
      description: p.description ?? "",
      promotion_type: p.promotion_type,
      discount_type: p.discount_type,
      discount_value: p.discount_value,
      promo_code: p.promo_code ?? "",
      cta_label: p.cta_label ?? p.display_config.cta ?? "",
      auto_apply: p.auto_apply,
      starts_at: toLocalInput(p.starts_at),
      ends_at: toLocalInput(p.ends_at),
      show_on_homepage: p.show_on_homepage,
      show_on_booking: p.show_on_booking,
      show_featured_card: Boolean(p.show_featured_card),
      show_popup: Boolean(p.show_popup),
      show_announcement_bar: p.show_announcement_bar,
      generate: false,
    };
    editBaselineRef.current = next;
    setEditForm(next);
  }

  useEffect(() => {
    if (!editingId) return;
    const frame = requestAnimationFrame(() => {
      editPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [editingId]);

  async function saveEdit() {
    if (!editingId || !editForm.name.trim()) return;
    setBusy(`${editingId}:edit`);
    const res = await adminFetch<{ promotion: PromotionRow }>(`/api/admin/promotions/${editingId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        promotion_type: editForm.promotion_type,
        discount_type: editForm.discount_type,
        discount_value: Number(editForm.discount_value),
        promo_code: editForm.promo_code.trim() || null,
        cta_label: editForm.cta_label.trim() || null,
        auto_apply: editForm.auto_apply,
        starts_at: editForm.starts_at ? new Date(editForm.starts_at).toISOString() : null,
        ends_at: editForm.ends_at ? new Date(editForm.ends_at).toISOString() : null,
        show_on_homepage: editForm.show_on_homepage,
        show_on_booking: editForm.show_on_booking,
        show_on_pricing: editForm.show_on_homepage,
        show_announcement_bar: editForm.show_announcement_bar,
        show_featured_card: editForm.show_featured_card,
        show_popup: editForm.show_popup,
        show_booking_banner: editForm.show_on_booking,
        display_config: {
          headline: editForm.name.trim(),
          cta: editForm.cta_label.trim() || "Book now",
          countdown: true,
        },
      }),
    });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return;
    }
    emitAdminToast("Campaign updated.", "success");
    setEditingId(null);
    void refetch();
    void loadAnalytics();
  }

  async function deleteCampaign(p: PromotionRow) {
    const ok = window.confirm(
      `Delete “${p.name}”? This permanently removes the campaign, generated content, and assets. Redemption history for this campaign will also be removed.`,
    );
    if (!ok) return;
    setBusy(`${p.id}:delete`);
    const res = await adminFetch(`/api/admin/promotions/${p.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return;
    }
    emitAdminToast("Campaign deleted.", "success");
    if (editingId === p.id) setEditingId(null);
    if (selectedId === p.id) setSelectedId(null);
    void refetch();
    void loadAnalytics();
    void loadContentHub();
  }

  async function createPromotion() {
    setBusy("create");
    const res = await adminFetch<{ promotion: PromotionRow }>("/api/admin/promotions", {
      method: "POST",
      body: JSON.stringify({
        name: createForm.name,
        description: createForm.description.trim() || null,
        promotion_type: createForm.promotion_type,
        discount_type: createForm.discount_type,
        discount_value: Number(createForm.discount_value),
        promo_code: createForm.promo_code || null,
        cta_label: createForm.cta_label.trim() || null,
        auto_apply: createForm.auto_apply,
        starts_at: createForm.starts_at ? new Date(createForm.starts_at).toISOString() : null,
        ends_at: createForm.ends_at ? new Date(createForm.ends_at).toISOString() : null,
        status: createForm.starts_at ? "scheduled" : "draft",
        show_on_homepage: createForm.show_on_homepage,
        show_on_booking: createForm.show_on_booking,
        show_on_pricing: createForm.show_on_homepage,
        show_announcement_bar: createForm.show_announcement_bar,
        show_featured_card: createForm.show_featured_card,
        show_popup: createForm.show_popup,
        show_booking_banner: createForm.show_on_booking,
        show_dashboard_card: true,
        display_config: {
          countdown: true,
          cta: createForm.cta_label.trim() || "Book now",
          headline: createForm.name.trim(),
        },
      }),
    });
    if (res.error || !res.data?.promotion) {
      setBusy(null);
      emitAdminToast(res.error ?? "Create failed", "error");
      return;
    }
    const id = res.data.promotion.id;
    if (createForm.generate) {
      await adminFetch(`/api/admin/promotions/${id}/generate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }
    setBusy(null);
    emitAdminToast("Campaign created.", "success");
    setShowCreate(false);
    setCreateForm(emptyForm);
    void refetch();
    void loadContentHub();
  }

  async function launchTemplate(key: string) {
    setBusy(`tpl:${key}`);
    const res = await adminFetch<{ promotion: PromotionRow }>("/api/admin/campaign-templates", {
      method: "POST",
      body: JSON.stringify({ templateKey: key, generate: true }),
    });
    setBusy(null);
    if (res.error) {
      emitAdminToast(res.error, "error");
      return;
    }
    emitAdminToast(`Launched ${res.data?.promotion.name ?? "campaign"}.`, "success");
    void refetch();
    void loadContentHub();
  }

  async function toggleAutomation(id: string, enabled: boolean) {
    const res = await adminFetch("/api/admin/marketing-automation", {
      method: "PATCH",
      body: JSON.stringify({ id, enabled }),
    });
    if (res.error) emitAdminToast(res.error, "error");
    else {
      emitAdminToast(enabled ? "Rule enabled." : "Rule paused.", "success");
      void loadAutomation();
    }
  }

  async function exportCsv() {
    const { getSupabaseAccessToken } = await import("@/lib/supabase/browser");
    const token = await getSupabaseAccessToken();
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch("/api/admin/promotions/analytics?format=csv", { headers });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaign-analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const selected = promotions.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{meta.blurb}</p>
          <div className="mt-3">
            <MarketingSubNav active={view} />
          </div>
          {formDirty ? (
            <p role="status" className="mt-2 text-xs text-amber-800">
              You have unsaved campaign changes. Save or cancel before leaving this page.
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" /> Refresh
          </Button>
          {view === "campaigns" || view === "templates" ? (
            <Button
              size="sm"
              onClick={() => {
                setEditingId(null);
                createBaselineRef.current = emptyForm;
                setCreateForm(emptyForm);
                setShowCreate(true);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> New campaign
            </Button>
          ) : null}
        </div>
      </div>

      {analytics && (view === "campaigns" || view === "analytics") ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Views", value: analytics.totals.views },
            { label: "Redemptions", value: analytics.totals.redemptions },
            { label: "Revenue attributed", value: formatZar(analytics.totals.revenueZar) },
            { label: "Discount cost", value: formatZar(analytics.totals.discountCostZar) },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{kpi.label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{kpi.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {view === "social" || view === "email" || view === "landing" ? (
        <ContentList
          content={allContent}
          assets={allAssets}
          facebookConfigured={facebookPublishable}
          facebookHint={facebookHint}
          googleConfigured={googlePublishable}
          googleHint={googleHint}
          emptyLabel={`No ${meta.title.toLowerCase()} yet. Generate a campaign first.`}
          emptyStateKey={view === "social" ? "no_draft_posts" : undefined}
          onAssetUpdated={(asset) => {
            setAllAssets((prev) => {
              const idx = prev.findIndex((a) => a.id === asset.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...prev[idx], ...asset };
                return next;
              }
              return [asset, ...prev];
            });
          }}
        />
      ) : null}

      {view === "assets" ? (
        <AssetsList
          assets={allAssets}
          onAssetUpdated={(asset) => {
            setAllAssets((prev) => {
              const idx = prev.findIndex((a) => a.id === asset.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...prev[idx], ...asset };
                return next;
              }
              return [asset, ...prev];
            });
          }}
        />
      ) : null}

      {view === "templates" ? (
        templates.length === 0 ? (
          <MarketingEmptyState stateKey="no_templates" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-semibold text-slate-900">{t.name}</p>
                <p className="mt-1 text-sm text-slate-500">{t.description}</p>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-400">{t.category}</p>
                <Button
                  className="mt-4 min-h-9"
                  size="sm"
                  disabled={busy === `tpl:${t.key}`}
                  onClick={() => void launchTemplate(t.key)}
                >
                  {busy === `tpl:${t.key}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Launch & generate
                </Button>
              </div>
            ))}
          </div>
        )
      ) : null}

      {(view === "campaigns" || view === "analytics") && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="promotions">
              <Megaphone className="mr-1.5 h-4 w-4" /> Campaigns
            </TabsTrigger>
            <TabsTrigger value="memberships">
              <Gift className="mr-1.5 h-4 w-4" /> Memberships
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-1.5 h-4 w-4" /> Analytics
            </TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
          </TabsList>

          <TabsContent value="promotions" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search name, slug, code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-xs"
              />
              <select
                className="rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All statuses</option>
                {(
                  ["draft", "scheduled", "active", "paused", "expired", "ended"] as PromotionStatus[]
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {loading ? (
              <MarketingSectionSkeleton label="Loading campaigns…" rows={4} />
            ) : error ? (
              <div className="space-y-2">
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="min-w-[720px] w-full text-left text-sm">
                  <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Discount</th>
                      <th className="px-4 py-3">Redemptions</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promotions.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 break-words">{p.name}</p>
                          <p className="text-xs text-slate-500 break-words">
                            {p.slug}
                            {p.promo_code ? ` · ${p.promo_code}` : ""}
                            {p.content_generated_at ? " · content ready" : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3 capitalize">{p.promotion_type.replace(/_/g, " ")}</td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              STATUS_BADGE[p.status] ?? STATUS_BADGE.draft,
                            )}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {p.discount_type === "percent"
                            ? `${p.discount_value}%`
                            : p.discount_type === "credit"
                              ? `${formatZar(p.discount_value)} credit`
                              : formatZar(p.discount_value)}
                        </td>
                        <td className="px-4 py-3">{p.redemptions_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              title="Edit campaign"
                              aria-label={`Edit campaign ${p.name}`}
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Generate campaign"
                              aria-label={`Generate content for ${p.name}`}
                              disabled={busy === `${p.id}:generate`}
                              onClick={() => void generateCampaign(p.id)}
                            >
                              {busy === `${p.id}:generate` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              title="Preview content"
                              aria-label={`Preview content for ${p.name}`}
                              onClick={() => void loadDetail(p.id)}
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Link
                              href={p.landing_page_path || `/campaigns/${p.slug}`}
                              target="_blank"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200"
                              title="Open landing page"
                              aria-label={`Open landing page for ${p.name}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </Link>
                            {p.status === "active" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                title="Pause campaign"
                                aria-label={`Pause campaign ${p.name}`}
                                disabled={busy === `${p.id}:pause`}
                                onClick={() => void runAction(p.id, "pause")}
                              >
                                <Pause className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            ) : p.status === "paused" ||
                              p.status === "draft" ||
                              p.status === "scheduled" ||
                              p.status === "ended" ||
                              p.status === "expired" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                title={
                                  p.status === "ended" || p.status === "expired"
                                    ? "Resume campaign"
                                    : p.status === "paused"
                                      ? "Resume campaign"
                                      : "Activate campaign"
                                }
                                aria-label={
                                  p.status === "draft" || p.status === "scheduled"
                                    ? `Activate campaign ${p.name}`
                                    : `Resume campaign ${p.name}`
                                }
                                disabled={busy === `${p.id}:resume` || busy === `${p.id}:activate`}
                                onClick={() => {
                                  const revive = p.status === "ended" || p.status === "expired";
                                  const action =
                                    p.status === "draft" || p.status === "scheduled"
                                      ? "activate"
                                      : "resume";
                                  void runAction(p.id, action).then((ok) => {
                                    if (ok && revive) {
                                      emitAdminToast(
                                        "Past end date cleared if needed. Use Edit to set a new end date.",
                                        "success",
                                      );
                                    }
                                  });
                                }}
                              >
                                <Play className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Duplicate campaign ${p.name}`}
                              disabled={busy === `${p.id}:duplicate`}
                              onClick={() => void runAction(p.id, "duplicate")}
                            >
                              <Copy className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            {p.status !== "ended" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                title="End campaign"
                                aria-label={`End campaign ${p.name}`}
                                disabled={busy === `${p.id}:end`}
                                onClick={() => void runAction(p.id, "end")}
                              >
                                <Square className="h-3.5 w-3.5" aria-hidden />
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              title="Delete campaign"
                              aria-label={`Delete campaign ${p.name}`}
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={busy === `${p.id}:delete`}
                              onClick={() => void deleteCampaign(p)}
                            >
                              {busy === `${p.id}:delete` ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              )}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {promotions.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-4">
                          <MarketingEmptyState stateKey="no_campaigns" className="border-0 bg-transparent" />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}

            {selected ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{selected.name} — generated content</h2>
                  <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
                    Close
                  </Button>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {detailContent.map((c) => (
                    <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {CHANNEL_LABELS[c.channel] ?? c.channel}
                      </p>
                      {c.title ? <p className="mt-1 font-medium">{c.title}</p> : null}
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                        {c.body.slice(0, 1200)}
                      </pre>
                    </div>
                  ))}
                </div>
                {detailAssets.length ? (
                  <div className="mt-4">
                    <h3 className="font-medium">Assets / QR</h3>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {detailAssets.map((a) => (
                        <div key={a.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                          <p className="font-medium">{a.label}</p>
                          <p className="text-slate-500">
                            {a.width}×{a.height}
                          </p>
                          {a.image_url?.startsWith("data:") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.image_url} alt={a.label} className="mt-2 h-24 w-24" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {editingId ? (
              <div
                ref={editPanelRef}
                className="scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-5 space-y-4"
              >
                <h2 className="text-lg font-semibold">Edit campaign</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={editForm.promotion_type}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          promotion_type: e.target.value as PromotionType,
                        }))
                      }
                    >
                      {[
                        "seasonal",
                        "promo_code",
                        "first_booking",
                        "bundle",
                        "birthday",
                        "custom",
                        "referral",
                        "membership",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Description</Label>
                    <Input
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Discount type</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={editForm.discount_type}
                      onChange={(e) => setEditForm((f) => ({ ...f, discount_type: e.target.value }))}
                    >
                      <option value="percent">Percent</option>
                      <option value="fixed">Fixed ZAR</option>
                      <option value="credit">Cleaning credit</option>
                    </select>
                  </div>
                  <div>
                    <Label>Discount value</Label>
                    <Input
                      type="number"
                      value={editForm.discount_value}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, discount_value: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Promo code</Label>
                    <Input
                      value={editForm.promo_code}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, promo_code: e.target.value.toUpperCase() }))
                      }
                    />
                  </div>
                  <div>
                    <Label>CTA label</Label>
                    <Input
                      value={editForm.cta_label}
                      onChange={(e) => setEditForm((f) => ({ ...f, cta_label: e.target.value }))}
                      placeholder="Book now"
                    />
                  </div>
                  <div>
                    <Label>Starts at</Label>
                    <Input
                      type="datetime-local"
                      value={editForm.starts_at}
                      onChange={(e) => setEditForm((f) => ({ ...f, starts_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Ends at</Label>
                    <Input
                      type="datetime-local"
                      value={editForm.ends_at}
                      onChange={(e) => setEditForm((f) => ({ ...f, ends_at: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2 pb-2 text-sm md:col-span-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.auto_apply}
                        onChange={(e) => setEditForm((f) => ({ ...f, auto_apply: e.target.checked }))}
                      />
                      Auto-apply at checkout
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.show_on_homepage}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, show_on_homepage: e.target.checked }))
                        }
                      />
                      Show on homepage
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.show_announcement_bar}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, show_announcement_bar: e.target.checked }))
                        }
                      />
                      Announcement bar
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.show_on_booking}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, show_on_booking: e.target.checked }))
                        }
                      />
                      Booking banner
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.show_featured_card}
                        onChange={(e) =>
                          setEditForm((f) => ({ ...f, show_featured_card: e.target.checked }))
                        }
                      />
                      Featured homepage card
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={editForm.show_popup}
                        onChange={(e) => setEditForm((f) => ({ ...f, show_popup: e.target.checked }))}
                      />
                      Optional popup
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={busy === `${editingId}:edit` || !editForm.name.trim()}
                    onClick={() => void saveEdit()}
                  >
                    {busy === `${editingId}:edit` ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Save changes
                  </Button>
                  <Button variant="outline" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            {showCreate ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                <h2 className="text-lg font-semibold">Create campaign</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input
                      value={createForm.name}
                      onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Type</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={createForm.promotion_type}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          promotion_type: e.target.value as PromotionType,
                        }))
                      }
                    >
                      {[
                        "seasonal",
                        "promo_code",
                        "first_booking",
                        "bundle",
                        "birthday",
                        "custom",
                      ].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Discount type</Label>
                    <select
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={createForm.discount_type}
                      onChange={(e) => setCreateForm((f) => ({ ...f, discount_type: e.target.value }))}
                    >
                      <option value="percent">Percent</option>
                      <option value="fixed">Fixed ZAR</option>
                      <option value="credit">Cleaning credit</option>
                    </select>
                  </div>
                  <div>
                    <Label>Discount value</Label>
                    <Input
                      type="number"
                      value={createForm.discount_value}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, discount_value: Number(e.target.value) }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Promo code (optional)</Label>
                    <Input
                      value={createForm.promo_code}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, promo_code: e.target.value.toUpperCase() }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Starts at</Label>
                    <Input
                      type="datetime-local"
                      value={createForm.starts_at}
                      onChange={(e) => setCreateForm((f) => ({ ...f, starts_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Ends at</Label>
                    <Input
                      type="datetime-local"
                      value={createForm.ends_at}
                      onChange={(e) => setCreateForm((f) => ({ ...f, ends_at: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col gap-2 pb-2 text-sm md:col-span-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={createForm.auto_apply}
                        onChange={(e) => setCreateForm((f) => ({ ...f, auto_apply: e.target.checked }))}
                      />
                      Auto-apply at checkout
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={createForm.generate}
                        onChange={(e) => setCreateForm((f) => ({ ...f, generate: e.target.checked }))}
                      />
                      Generate campaign content (social, email, landing, QR)
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={createForm.show_featured_card}
                        onChange={(e) =>
                          setCreateForm((f) => ({ ...f, show_featured_card: e.target.checked }))
                        }
                      />
                      Show featured homepage card
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={createForm.show_popup}
                        onChange={(e) => setCreateForm((f) => ({ ...f, show_popup: e.target.checked }))}
                      />
                      Show optional popup
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={busy === "create" || !createForm.name.trim()}
                    onClick={() => void createPromotion()}
                  >
                    {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreate(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="memberships" className="space-y-4">
            <p className="text-sm text-slate-600">
              Active members: <strong>{memberships?.stats.activeMembers ?? 0}</strong>
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {(memberships?.plans ?? []).map((plan) => (
                <div key={String(plan.id)} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-slate-900">{String(plan.name)}</p>
                  <p className="mt-1 text-sm text-slate-500">{String(plan.description ?? "")}</p>
                  <p className="mt-3 text-lg font-bold text-emerald-700">
                    {Number(plan.discount_percent)}% off · {String(plan.billing_frequency)}
                  </p>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
                Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Campaign</th>
                    <th className="px-4 py-3">Views</th>
                    <th className="px-4 py-3">Clicks</th>
                    <th className="px-4 py-3">Redemptions</th>
                    <th className="px-4 py-3">Revenue</th>
                    <th className="px-4 py-3">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics?.summaries ?? []).map((s) => (
                    <tr key={s.promotionId} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium break-words">{s.name}</td>
                      <td className="px-4 py-3">{s.views}</td>
                      <td className="px-4 py-3">{s.clicks}</td>
                      <td className="px-4 py-3">{s.redemptions}</td>
                      <td className="px-4 py-3">{formatZar(s.revenueGeneratedZar)}</td>
                      <td className="px-4 py-3">{formatSafeRoi(s.roi, s.views)}</td>
                    </tr>
                  ))}
                  {(analytics?.summaries ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-4">
                        <MarketingEmptyState
                          stateKey="insufficient_analytics"
                          className="border-0 bg-transparent"
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="automation" className="space-y-3">
            {automation.map((rule) => (
              <div
                key={String(rule.id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-slate-900">{String(rule.name)}</p>
                  <p className="text-xs text-slate-500">
                    Trigger: {String(rule.trigger_event)} · Channel: {String(rule.channel)}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(rule.enabled)}
                    onChange={(e) => void toggleAutomation(String(rule.id), e.target.checked)}
                  />
                  Enabled
                </label>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

const CHANNEL_TO_ASSET: Partial<Record<CampaignContentChannel, string>> = {
  facebook: "facebook_feed",
  instagram: "instagram_feed",
  linkedin: "linkedin_banner",
  twitter: "twitter_image",
  whatsapp: "whatsapp_status",
  google_business: "google_business_cover",
  pinterest: "pinterest_pin",
};

function ContentList({
  content,
  assets,
  facebookConfigured,
  facebookHint,
  googleConfigured,
  googleHint,
  emptyLabel,
  emptyStateKey,
  onAssetUpdated,
}: {
  content: ContentRow[];
  assets: AssetRow[];
  facebookConfigured: boolean;
  facebookHint: string | null;
  googleConfigured: boolean;
  googleHint: string | null;
  emptyLabel: string;
  emptyStateKey?: "no_draft_posts";
  onAssetUpdated?: (asset: AssetRow) => void;
}) {
  if (!content.length) {
    return emptyStateKey ? (
      <MarketingEmptyState stateKey={emptyStateKey} description={emptyLabel} />
    ) : (
      <MarketingEmptyState title={emptyLabel.split(".")[0]} description={emptyLabel} />
    );
  }
  return (
    <div className="space-y-3">
      {!facebookConfigured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Facebook one-click publish needs <code className="font-mono text-xs">FACEBOOK_PAGE_ID</code>{" "}
          and a <strong>Page</strong> access token in{" "}
          <code className="font-mono text-xs">FACEBOOK_PAGE_ACCESS_TOKEN</code> with{" "}
          <code className="font-mono text-xs">pages_manage_posts</code> (from Graph API{" "}
          <code className="font-mono text-xs">/me/accounts</code> — not a User token / deprecated{" "}
          <code className="font-mono text-xs">publish_actions</code>). You can still copy text and
          download PNGs to post manually.
        </p>
      ) : facebookHint ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {facebookHint}
        </p>
      ) : null}
      {!googleConfigured ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {googleHint ?? (
            <>
              Google Business one-click publish needs a connected location. Open{" "}
              <Link href="/office/marketing/connected-accounts" className="font-medium underline">
                Connected Accounts
              </Link>{" "}
              to connect Google Business Profile.
            </>
          )}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {content.map((c) => (
          <SocialContentCard
            key={c.id}
            content={c}
            asset={
              assets.find(
                (a) =>
                  a.asset_type === (CHANNEL_TO_ASSET[c.channel] ?? "") &&
                  (c.promotion_id
                    ? a.promotion_id === c.promotion_id
                    : a.promotion?.slug === c.promotion?.slug),
              ) ??
              assets.find(
                (a) =>
                  a.asset_type === (CHANNEL_TO_ASSET[c.channel] ?? "") &&
                  a.promotion?.slug === c.promotion?.slug,
              ) ??
              null
            }
            facebookConfigured={facebookConfigured}
            googleConfigured={googleConfigured}
            onAssetUpdated={onAssetUpdated}
          />
        ))}
      </div>
    </div>
  );
}

function SocialContentCard({
  content,
  asset,
  facebookConfigured,
  googleConfigured,
  onAssetUpdated,
  onContentStatusChange,
}: {
  content: ContentRow;
  asset: AssetRow | null;
  facebookConfigured: boolean;
  googleConfigured: boolean;
  onAssetUpdated?: (asset: AssetRow) => void;
  onContentStatusChange?: (contentId: string, status: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [localAsset, setLocalAsset] = useState<AssetRow | null>(asset);
  const [localStatus, setLocalStatus] = useState(content.status);
  const [caption, setCaption] = useState(content.body);
  const text = content.html_body || caption;
  const activeAsset = localAsset ?? asset;
  const payload = activeAsset?.template_payload ?? {};
  const width = activeAsset?.width ?? 1200;
  const height = activeAsset?.height ?? 630;
  const showImage = Boolean(CHANNEL_TO_ASSET[content.channel]);
  const customImage = isCustomCampaignAssetImage(activeAsset?.image_url);
  const previewMax = 280;
  const previewScale = Math.min(1, previewMax / width);
  const isPublishChannel =
    content.channel === "facebook" || content.channel === "google_business";
  const publishConfigured =
    content.channel === "facebook" ? facebookConfigured : googleConfigured;
  const charLimit =
    content.channel === "facebook"
      ? 63_206
      : content.channel === "google_business"
        ? 1500
        : null;
  const overLimit = charLimit != null && caption.trim().length > charLimit;

  useEffect(() => {
    setLocalAsset(asset);
  }, [asset]);

  useEffect(() => {
    setLocalStatus(content.status);
    setCaption(content.body);
  }, [content.id, content.status, content.body]);

  function toastPublishFailure(res: { error?: string; data?: unknown }) {
    const fields = {
      error: res.error,
      ...(typeof res.data === "object" && res.data ? (res.data as PublishFailureFields) : {}),
    };
    emitAdminToast(formatPublishFailureToast(fields), "error");
  }

  async function copy() {
    const ok = await copyTextToClipboard(text);
    emitAdminToast(ok ? "Copied to clipboard." : "Could not copy.", ok ? "success" : "error");
  }

  async function downloadPng() {
    setBusy("png");
    try {
      if (customImage && activeAsset?.image_url) {
        await downloadImageUrl(
          activeAsset.image_url,
          `${content.promotion?.slug ?? "campaign"}-${content.channel}.png`,
        );
      } else {
        if (!cardRef.current) {
          emitAdminToast("Image not ready.", "error");
          return;
        }
        const dataUrl = await captureNodeAsPngDataUrl(cardRef.current);
        downloadDataUrl(
          dataUrl,
          `${content.promotion?.slug ?? "campaign"}-${content.channel}.png`,
        );
      }
      emitAdminToast("PNG downloaded.", "success");
    } catch (e) {
      emitAdminToast(e instanceof Error ? e.message : "PNG export failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function publishFacebook() {
    if (
      !canInvokePublish({
        busy: busy != null,
        configured: facebookConfigured,
        overLimit,
        caption,
      })
    ) {
      return;
    }
    const precheck = validatePublishPayloadClient({
      channel: "facebook",
      message: caption,
      hasImage: Boolean(customImage || cardRef.current),
    });
    if (!precheck.ok) {
      emitAdminToast(precheck.error, "error");
      return;
    }
    setBusy("fb");
    try {
      let imageDataUrl: string | null = null;
      let imageUrl: string | null = null;
      if (customImage && activeAsset?.image_url) {
        imageUrl = activeAsset.image_url;
      } else if (cardRef.current) {
        imageDataUrl = await captureNodeAsPngDataUrl(cardRef.current);
      }
      const link = canonicalizePublicSiteUrl(
        typeof payload.landing === "string"
          ? payload.landing
          : content.promotion?.slug
            ? `https://shalean.co.za/campaigns/${content.promotion.slug}`
            : "https://shalean.co.za/book",
      );
      const res = await adminFetch<{ postId: string; correlationId?: string }>(
        "/api/admin/promotions/publish-facebook",
        {
          method: "POST",
          body: JSON.stringify({
            message: caption,
            imageDataUrl,
            imageUrl,
            link,
            promotionId: content.promotion_id ?? null,
          }),
        },
      );
      if (res.error) {
        toastPublishFailure(res);
        return;
      }
      setLocalStatus("published");
      onContentStatusChange?.(content.id, "published");
      emitAdminToast(
        `Posted to Facebook (id ${res.data?.postId ?? "ok"})${
          res.data?.correlationId ? ` · Ref ${res.data.correlationId}` : ""
        }.`,
        "success",
      );
    } catch (e) {
      emitAdminToast(e instanceof Error ? e.message : "Publish failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function publishGoogleBusiness() {
    if (
      !canInvokePublish({
        busy: busy != null,
        configured: googleConfigured,
        overLimit,
        caption,
      })
    ) {
      return;
    }
    const precheck = validatePublishPayloadClient({
      channel: "google_business",
      message: caption,
      hasImage: Boolean(customImage || cardRef.current),
    });
    if (!precheck.ok) {
      emitAdminToast(precheck.error, "error");
      return;
    }
    setBusy("gbp");
    try {
      let imageDataUrl: string | null = null;
      let imageUrl: string | null = null;
      if (customImage && activeAsset?.image_url) {
        imageUrl = activeAsset.image_url;
      } else if (cardRef.current) {
        imageDataUrl = await captureNodeAsPngDataUrl(cardRef.current);
      }
      const link = canonicalizePublicSiteUrl(
        typeof payload.landing === "string"
          ? payload.landing
          : content.promotion?.slug
            ? `https://shalean.co.za/campaigns/${content.promotion.slug}`
            : "https://shalean.co.za/book",
      );
      const res = await adminFetch<{ postName: string; correlationId?: string }>(
        "/api/admin/promotions/publish-google-business",
        {
          method: "POST",
          body: JSON.stringify({
            message: caption,
            imageDataUrl,
            imageUrl,
            link,
            promotionId: content.promotion_id ?? null,
            campaignName: content.promotion?.name ?? null,
          }),
        },
      );
      if (res.error) {
        toastPublishFailure(res);
        return;
      }
      setLocalStatus("published");
      onContentStatusChange?.(content.id, "published");
      emitAdminToast(
        `Posted to Google Business (${res.data?.postName ?? "ok"})${
          res.data?.correlationId ? ` · Ref ${res.data.correlationId}` : ""
        }.`,
        "success",
      );
    } catch (e) {
      emitAdminToast(e instanceof Error ? e.message : "Publish failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function onFileSelected(file: File | undefined) {
    if (!file) return;
    const assetType = CHANNEL_TO_ASSET[content.channel];
    if (!assetType && !activeAsset?.id) {
      emitAdminToast("No image slot for this channel.", "error");
      return;
    }
    setBusy("upload");
    try {
      const res = await uploadCampaignAssetImage({
        file,
        assetId: activeAsset?.id,
        promotionId: content.promotion_id ?? activeAsset?.promotion_id,
        assetType: assetType ?? activeAsset?.asset_type,
      });
      if (!res.ok) {
        emitAdminToast(res.error, "error");
        return;
      }
      setLocalAsset(res.asset);
      onAssetUpdated?.(res.asset);
      emitAdminToast("Custom image uploaded.", "success");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function restoreTemplate() {
    if (!activeAsset?.id) return;
    setBusy("reset");
    try {
      const res = await clearCampaignAssetImage(activeAsset.id);
      if (!res.ok) {
        emitAdminToast(res.error, "error");
        return;
      }
      setLocalAsset(res.asset);
      onAssetUpdated?.(res.asset);
      emitAdminToast("Restored generated template.", "success");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" aria-busy={busy != null}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {CHANNEL_LABELS[content.channel] ?? content.channel}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span
            role="status"
            aria-label={`Content status ${localStatus}`}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              CONTENT_STATUS_BADGE[localStatus] ?? "bg-slate-100 text-slate-600",
            )}
          >
            {localStatus}
          </span>
          <p className="text-xs text-slate-400">{content.promotion?.name}</p>
        </div>
      </div>
      {content.title ? <p className="mt-1 font-medium">{content.title}</p> : null}
      {isPublishChannel ? (
        <div className="mt-2">
          <Label htmlFor={`caption-${content.id}`} className="text-xs text-slate-500">
            Caption (editable before publish)
          </Label>
          <textarea
            id={`caption-${content.id}`}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            className={cn(
              "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700",
              overLimit && "border-rose-300 bg-rose-50",
            )}
            aria-invalid={overLimit}
            aria-describedby={
              charLimit != null ? `caption-count-${content.id}` : undefined
            }
          />
          {charLimit != null ? (
            <p
              id={`caption-count-${content.id}`}
              className={cn("mt-1 text-[11px]", overLimit ? "text-rose-700" : "text-slate-400")}
              role={overLimit ? "alert" : undefined}
            >
              {caption.trim().length.toLocaleString()} / {charLimit.toLocaleString()} characters
              {overLimit ? " — over limit; shorten before publish." : ""}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
            {text.slice(0, 1200)}
          </pre>
          <p className="mt-2 text-[11px] text-slate-500">
            Copy / download only — one-click publish is not enabled for this channel.
          </p>
        </>
      )}

      {showImage ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-3">
          {customImage && activeAsset?.image_url ? (
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                Custom upload
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activeAsset.image_url}
                alt={`${CHANNEL_LABELS[content.channel] ?? content.channel} creative`}
                className="rounded-lg object-cover"
                style={{
                  width: width * previewScale,
                  height: height * previewScale,
                  maxWidth: "100%",
                }}
              />
            </div>
          ) : (
            <SocialImageCard
              ref={cardRef}
              width={width}
              height={height}
              previewMaxWidth={previewMax}
              {...socialCardPropsFromPayload(payload, {
                headline: content.title ?? content.promotion?.name ?? "Shalean",
                subheadline: content.cta,
                cta: content.cta ?? "Book Now",
                format: CHANNEL_TO_ASSET[content.channel] ?? null,
              })}
            />
          )}
        </div>
      ) : null}

                      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        aria-label="Upload campaign image"
        onChange={(e) => void onFileSelected(e.target.files?.[0])}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void copy()} aria-label="Copy caption text">
          <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copy text
        </Button>
        {showImage ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "png"}
              onClick={() => void downloadPng()}
              aria-label="Download PNG creative"
            >
              {busy === "png" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Download PNG
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "upload" || (!content.promotion_id && !activeAsset?.id)}
              onClick={() => fileInputRef.current?.click()}
              title="Replace with an image from your computer"
              aria-label="Upload custom image"
            >
              {busy === "upload" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              )}
              Upload image
            </Button>
            {customImage ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy === "reset" || !activeAsset?.id}
                onClick={() => void restoreTemplate()}
                aria-label="Restore generated template image"
              >
                {busy === "reset" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                Use template
              </Button>
            ) : null}
          </>
        ) : null}
        {content.channel === "facebook" ? (
          <Button
            size="sm"
            className="min-h-9"
            disabled={
              !canInvokePublish({
                busy: busy != null,
                configured: facebookConfigured,
                overLimit,
                caption,
              })
            }
            onClick={() => void publishFacebook()}
            title={
              facebookConfigured
                ? "Post image + caption to your Facebook Page"
                : "Configure FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN"
            }
            aria-label="Post to Facebook Page"
            aria-busy={busy === "fb"}
          >
            {busy === "fb" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Post to Facebook
          </Button>
        ) : null}
        {content.channel === "google_business" ? (
          <Button
            size="sm"
            className="min-h-9"
            disabled={
              !canInvokePublish({
                busy: busy != null,
                configured: googleConfigured,
                overLimit,
                caption,
              })
            }
            onClick={() => void publishGoogleBusiness()}
            title={
              googleConfigured
                ? "Upload image and create a Google Business local post"
                : "Connect Google Business Profile in Connected Accounts"
            }
            aria-label="Upload to Google Business Profile"
            aria-busy={busy === "gbp"}
          >
            {busy === "gbp" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Share2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            )}
            Upload to Google Business
          </Button>
        ) : null}
      </div>
      {isPublishChannel && !publishConfigured ? (
        <p className="mt-2 text-[11px] text-amber-800">
          Publishing is disabled until this provider is connected or configured. Open{" "}
          <Link href="/office/marketing/connected-accounts" className="underline">
            Connected Accounts
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}

function AssetsList({
  assets,
  onAssetUpdated,
}: {
  assets: AssetRow[];
  onAssetUpdated?: (asset: AssetRow) => void;
}) {
  if (!assets.length) {
    return <MarketingEmptyState stateKey="no_assets" />;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {assets.map((a) => (
        <AssetCard key={a.id} asset={a} onAssetUpdated={onAssetUpdated} />
      ))}
    </div>
  );
}

function AssetCard({
  asset,
  onAssetUpdated,
}: {
  asset: AssetRow;
  onAssetUpdated?: (asset: AssetRow) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [localAsset, setLocalAsset] = useState(asset);
  const active = localAsset;
  const payload = active.template_payload ?? {};
  const isQr = active.asset_type === "qr_code" || active.image_url?.startsWith("data:");
  const customImage = !isQr && isCustomCampaignAssetImage(active.image_url);
  const width = active.width ?? 1200;
  const height = active.height ?? 630;
  const previewMax = 260;
  const previewScale = Math.min(1, previewMax / width);

  useEffect(() => {
    setLocalAsset(asset);
  }, [asset]);

  async function download() {
    if (isQr && active.image_url) {
      downloadDataUrl(active.image_url, `${active.promotion?.slug ?? "campaign"}-qr.png`);
      emitAdminToast("QR downloaded.", "success");
      return;
    }
    setBusy("png");
    try {
      if (customImage && active.image_url) {
        await downloadImageUrl(
          active.image_url,
          `${active.promotion?.slug ?? "campaign"}-${active.asset_type}.png`,
        );
      } else {
        if (!cardRef.current) {
          emitAdminToast("Image not ready.", "error");
          return;
        }
        const dataUrl = await captureNodeAsPngDataUrl(cardRef.current);
        downloadDataUrl(
          dataUrl,
          `${active.promotion?.slug ?? "campaign"}-${active.asset_type}.png`,
        );
      }
      emitAdminToast("PNG downloaded.", "success");
    } catch (e) {
      emitAdminToast(e instanceof Error ? e.message : "PNG export failed.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function onFileSelected(file: File | undefined) {
    if (!file || isQr) return;
    setBusy("upload");
    try {
      const res = await uploadCampaignAssetImage({
        file,
        assetId: active.id,
        promotionId: active.promotion_id,
        assetType: active.asset_type,
      });
      if (!res.ok) {
        emitAdminToast(res.error, "error");
        return;
      }
      setLocalAsset({ ...active, ...res.asset, promotion: active.promotion });
      onAssetUpdated?.({ ...active, ...res.asset, promotion: active.promotion });
      emitAdminToast("Custom image uploaded.", "success");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function restoreTemplate() {
    if (!active.id || isQr) return;
    setBusy("reset");
    try {
      const res = await clearCampaignAssetImage(active.id);
      if (!res.ok) {
        emitAdminToast(res.error, "error");
        return;
      }
      setLocalAsset({ ...active, ...res.asset, promotion: active.promotion });
      onAssetUpdated?.({ ...active, ...res.asset, promotion: active.promotion });
      emitAdminToast("Restored generated template.", "success");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="font-medium">{active.label}</p>
      <p className="text-xs text-slate-500">
        {active.promotion?.name}
        {active.width && active.height ? ` · ${active.width}×${active.height}` : ""}
        {customImage ? " · Custom upload" : ""}
      </p>
      {isQr && active.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={active.image_url} alt={active.label} className="mt-3 h-28 w-28" />
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 p-2">
          {customImage && active.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.image_url}
              alt={active.label}
              className="rounded-lg object-cover"
              style={{
                width: width * previewScale,
                height: height * previewScale,
                maxWidth: "100%",
              }}
            />
          ) : (
            <SocialImageCard
              ref={cardRef}
              width={width}
              height={height}
              previewMaxWidth={previewMax}
              {...socialCardPropsFromPayload(payload, {
                headline: active.promotion?.name ?? "Shalean",
                format: active.asset_type,
              })}
            />
          )}
        </div>
      )}

      {!isQr ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => void onFileSelected(e.target.files?.[0])}
        />
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy === "png"} onClick={() => void download()}>
          {busy === "png" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          Download PNG
        </Button>
        {!isQr ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "upload"}
              onClick={() => fileInputRef.current?.click()}
            >
              {busy === "upload" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
              )}
              Upload
            </Button>
            {customImage ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy === "reset"}
                onClick={() => void restoreTemplate()}
              >
                {busy === "reset" ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Use template
              </Button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
