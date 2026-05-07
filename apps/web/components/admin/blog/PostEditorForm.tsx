"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Circle } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentBlock, type BlogContentJson } from "@/lib/blog/content-json";
import { safeParseBlogContentJson } from "@/lib/blog/content-json-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ClusterPeerPost } from "@/lib/blog/seo/blog-cluster-collision";
import { validateBlogPublish, type PublishValidationResult } from "@/lib/blog/seo/publish-validation";
import { resolveSemanticClusterKey, SEMANTIC_CLUSTER_KEYS } from "@/lib/seo/blogGovernance";
import {
  buildBlogTemplateContent,
  BLOG_TEMPLATE_OPTIONS,
  type BlogTemplateId,
} from "@/lib/blog/templates";
import { legacyParagraphToRichHtml } from "@/lib/blog/legacy-paragraph-to-rich-html";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";
import { BlogContent } from "@/components/blog/engine/BlogContent";
import { RichTextBlockEditor } from "./RichTextBlockEditor";

type AddableType =
  | "intro"
  | "quick_answer"
  | "section"
  | "rich_text"
  | "image"
  | "heading"
  | "bullets"
  | "bullet_list"
  | "numbered_list"
  | "key_takeaways"
  | "faq"
  | "cta"
  | "internal_links"
  | "comparison_table";

function newBlockId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable `id` for React keys and future anchor sync; preserved when editing. */
function withBlockId<B extends BlogContentBlock>(block: B): B {
  if (block.id && block.id.trim()) return block;
  return { ...block, id: newBlockId() };
}

/** Loads legacy `paragraph` blocks into the TipTap-powered `rich_text` shape. */
function normalizeBlockForEditor(b: BlogContentBlock): BlogContentBlock {
  if (b.type === "paragraph") {
    return {
      id: b.id,
      type: "rich_text",
      html: legacyParagraphToRichHtml(b.content),
    };
  }
  return b;
}

function newBlock(type: AddableType): BlogContentBlock {
  switch (type) {
    case "intro":
      return withBlockId({ type: "intro", content: "" });
    case "quick_answer":
      return withBlockId({ type: "quick_answer", content: "" });
    case "section":
      return withBlockId({ type: "section", title: "", content: "", heading_level: 2 });
    case "rich_text":
      return withBlockId({ type: "rich_text", html: "<p></p>" });
    case "image":
      return withBlockId({ type: "image", url: "", alt: "" });
    case "heading":
      return withBlockId({ type: "heading", level: 2, content: "" });
    case "bullets":
      return withBlockId({ type: "bullets", items: [""] });
    case "bullet_list":
      return withBlockId({ type: "bullet_list", items: [""] });
    case "numbered_list":
      return withBlockId({ type: "numbered_list", items: [""] });
    case "key_takeaways":
      return withBlockId({ type: "key_takeaways", items: [""] });
    case "faq":
      return withBlockId({ type: "faq", items: [{ question: "", answer: "" }] });
    case "cta":
      return withBlockId({
        type: "cta",
        title: "",
        button_text: "Book now",
        link: "/booking",
        variant: "primary",
      });
    case "internal_links":
      return withBlockId({ type: "internal_links", title: "Related", links: [{ label: "", url: "/blog" }] });
    case "comparison_table":
      return withBlockId({ type: "comparison_table", columns: ["", "A", "B"], rows: [["", "", ""]] });
    default: {
      const _t: never = type;
      return _t;
    }
  }
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDatetimeLocalValue(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function getToken(): Promise<string | null> {
  const sb = getSupabaseBrowser();
  const session = await sb?.auth.getSession();
  return session?.data.session?.access_token ?? null;
}

function EditorialSectionCard({
  kicker,
  title,
  description,
  children,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-zinc-200/90 shadow-sm dark:border-zinc-800/90 dark:shadow-none",
        className,
      )}
    >
      <CardHeader className="space-y-1 border-b border-zinc-100 bg-zinc-50/60 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        {kicker ? (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{kicker}</p>
        ) : null}
        <CardTitle className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</CardTitle>
        {description ? <CardDescription className="text-xs leading-relaxed">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-5">{children}</CardContent>
    </Card>
  );
}

function PublishSidebarPanel({
  saving,
  onSave,
  status,
  onStatusChange,
  source,
  onSourceChange,
  publishedAtLocal,
  onPublishedAtLocalChange,
  slug,
  canonicalUrl,
  metaTitle,
  metaDescription,
  semanticCluster,
  resolvedClusterKey,
  preview,
  clusterPeerCount,
}: {
  saving: boolean;
  onSave: () => void;
  status: "draft" | "published" | "scheduled";
  onStatusChange: (v: "draft" | "published" | "scheduled") => void;
  source: "editorial" | "programmatic" | "high_conversion";
  onSourceChange: (v: "editorial" | "programmatic" | "high_conversion") => void;
  publishedAtLocal: string;
  onPublishedAtLocalChange: (v: string) => void;
  slug: string;
  canonicalUrl: string;
  metaTitle: string;
  metaDescription: string;
  semanticCluster: string;
  resolvedClusterKey: string | null;
  preview: PublishValidationResult;
  clusterPeerCount: number;
}) {
  const fieldId = useId();
  const statusVariant =
    status === "published" ? "success" : status === "scheduled" ? ("warning" as const) : ("outline" as const);
  const readingMins = Math.max(1, Math.round(preview.wordCount / 220));
  const sourceLabel = source.replace(/_/g, " ");

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Button type="button" className="w-full" size="lg" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="outline" className="w-full" asChild>
          <Link href="/admin/blog">Back to posts</Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant}>{status}</Badge>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Source · {sourceLabel}</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-status`} className="text-xs text-zinc-500">
          Status
        </Label>
        <select
          id={`${fieldId}-status`}
          className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
          value={status}
          onChange={(e) => onStatusChange(e.target.value as typeof status)}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="scheduled">Scheduled</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-source`} className="text-xs text-zinc-500">
          Source
        </Label>
        <select
          id={`${fieldId}-source`}
          className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
          value={source}
          onChange={(e) => onSourceChange(e.target.value as typeof source)}
        >
          <option value="editorial">Editorial</option>
          <option value="programmatic">Programmatic</option>
          <option value="high_conversion">High conversion</option>
        </select>
      </div>
      {(status === "published" || status === "scheduled") && (
        <div className="space-y-2">
          <Label htmlFor={`${fieldId}-pub`} className="text-xs text-zinc-500">
            Publish date / time
          </Label>
          <Input
            id={`${fieldId}-pub`}
            type="datetime-local"
            value={publishedAtLocal}
            onChange={(e) => onPublishedAtLocalChange(e.target.value)}
            className="rounded-lg"
          />
          <p className="text-[11px] leading-relaxed text-zinc-500">
            Empty uses &quot;now&quot; when publishing. Drafts clear the schedule.
          </p>
        </div>
      )}

      <Separator className="bg-zinc-200/80 dark:bg-zinc-800" />

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">SEO snapshot</p>
        <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50">
          {preview.seoScore}
          <span className="text-sm font-medium text-zinc-400">/100</span>
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {preview.wordCount.toLocaleString()} words · ~{readingMins} min read
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200/90 bg-white/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950/60">
        <p className="font-medium text-zinc-700 dark:text-zinc-200">URL & canonical</p>
        <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-600 dark:text-zinc-400" title={slug}>
          /blog/{slug.trim() || "…"}
        </p>
        {canonicalUrl.trim() ? (
          <p className="mt-1 break-all font-mono text-[11px] text-zinc-500" title={canonicalUrl}>
            {canonicalUrl}
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-zinc-400">Canonical inherits from slug unless set.</p>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200/90 bg-white/80 p-3 text-xs dark:border-zinc-700 dark:bg-zinc-950/60">
        <p className="font-medium text-zinc-700 dark:text-zinc-200">Cluster</p>
        <p className="mt-1 text-zinc-600 dark:text-zinc-300">
          {semanticCluster.trim() ? (
            <span className="font-mono text-[11px]">{semanticCluster.trim()}</span>
          ) : (
            <span className="text-zinc-400">Unset — inferred from tags when applicable</span>
          )}
        </p>
        {resolvedClusterKey ? (
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Resolved for checks: <span className="font-mono text-zinc-600 dark:text-zinc-400">{resolvedClusterKey}</span>
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-zinc-400">{clusterPeerCount} peer posts loaded for overlap hints</p>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Publishing checklist</p>
        <ul className="mt-2 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          {[
            ["FAQ block", preview.hasFaq],
            ["CTA block", preview.hasCta],
            ["Internal links", preview.hasInternalLinks],
            ["Booking link", preview.hasBookingLink],
            ["H2 section", preview.hasH2Section],
          ].map(([label, ok]) => (
            <li key={String(label)} className="flex items-center gap-2">
              {ok ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
              )}
              <span className={ok ? "" : "text-zinc-400"}>{label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
          Live publish still runs full validation (e.g. ≥800 words).
        </p>
      </div>

      {(metaTitle.trim() || metaDescription.trim()) && (
        <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
          <p className="text-[11px] font-medium text-zinc-500">Meta in use</p>
          <p className="mt-1 line-clamp-2 text-xs font-medium text-zinc-800 dark:text-zinc-100">{metaTitle || "—"}</p>
          <p className="mt-1 line-clamp-3 text-[11px] text-zinc-600 dark:text-zinc-400">{metaDescription || "—"}</p>
        </div>
      )}

      {preview.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-950 dark:text-amber-100">
            {preview.warnings.length} advisory note{preview.warnings.length > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-900/80 dark:text-amber-100/80">
            Cluster overlap and intent hints — optional to resolve before publish.
          </p>
          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-100">
              <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" aria-hidden />
              View details
            </summary>
            <ul className="mt-2 space-y-3 border-t border-amber-200/50 pt-2 dark:border-amber-800/40">
              {preview.warnings.map((w) => (
                <li key={`${w.code}-${w.relatedSlug ?? ""}-${w.message.slice(0, 40)}`} className="text-[11px] leading-relaxed text-amber-950/90 dark:text-amber-50/90">
                  <span className="font-medium">{w.message}</span>
                  {(w.confidence || w.code) && (
                    <span className="mt-0.5 block text-[10px] text-amber-800/80 dark:text-amber-200/70">
                      {w.code}
                      {w.confidence ? ` · confidence ${w.confidence}` : ""}
                      {w.relatedSlug ? ` · ${w.relatedSlug}` : ""}
                    </span>
                  )}
                  {w.matchedSignals && w.matchedSignals.length > 0 ? (
                    <span className="mt-1 block text-[10px] text-amber-800/75 dark:text-amber-200/65">
                      Signals: {w.matchedSignals.join(", ")}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-400">No cluster overlap flags for this draft.</p>
      )}
    </div>
  );
}

type Props = { mode: "create" | "edit"; postId?: string };

export function PostEditorForm({ mode, postId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slugAuto, setSlugAuto] = useState(true);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [h1, setH1] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [status, setStatus] = useState<"draft" | "published" | "scheduled">("draft");
  const [source, setSource] = useState<"editorial" | "programmatic" | "high_conversion">("editorial");
  const [publishedAtLocal, setPublishedAtLocal] = useState("");
  const [metaTitle, setMetaTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [featuredUrl, setFeaturedUrl] = useState("");
  const [featuredAlt, setFeaturedAlt] = useState("");
  const [noindex, setNoindex] = useState(false);
  const [blocks, setBlocks] = useState<BlogContentBlock[]>([]);
  const [addType, setAddType] = useState<AddableType>("rich_text");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [secondaryKwText, setSecondaryKwText] = useState("");
  const [searchIntent, setSearchIntent] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [semanticCluster, setSemanticCluster] = useState("");
  const [relatedGuideOverrideText, setRelatedGuideOverrideText] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [clusterPeers, setClusterPeers] = useState<ClusterPeerPost[]>([]);
  const [categories, setCategories] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; slug: string; name: string }[]>([]);
  const [seoGenSlug, setSeoGenSlug] = useState(false);
  const [seoApplySuggestions, setSeoApplySuggestions] = useState(false);
  const [templateChoice, setTemplateChoice] = useState<BlogTemplateId | "">("");
  const [tplArea, setTplArea] = useState("Claremont");
  const [tplCity, setTplCity] = useState("Cape Town");
  const [tplService, setTplService] = useState("Home cleaning");
  const [tplA, setTplA] = useState("Standard cleaning");
  const [tplB, setTplB] = useState("Deep cleaning");
  const [tplTopic, setTplTopic] = useState("home cleaning");

  const contentJson: BlogContentJson = useMemo(
    () => ({ schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION, blocks }),
    [blocks],
  );

  const selectedTagSlugs = useMemo(
    () =>
      tagIds
        .map((id) => tags.find((t) => t.id === id)?.slug)
        .filter((s): s is string => Boolean(s)),
    [tagIds, tags],
  );

  const resolvedSemanticClusterKey = useMemo(
    () =>
      resolveSemanticClusterKey({
        persisted: semanticCluster.trim() || null,
        tags: selectedTagSlugs,
      }),
    [semanticCluster, selectedTagSlugs],
  );

  const publishPreview = useMemo(
    () =>
      validateBlogPublish(contentJson, {
        tags: selectedTagSlugs,
        semanticCluster: resolvedSemanticClusterKey ?? undefined,
        clusterPeers,
        slug: slug.trim(),
        title: title.trim(),
        primaryKeyword: primaryKeyword.trim() || null,
      }),
    [contentJson, selectedTagSlugs, resolvedSemanticClusterKey, clusterPeers, slug, title, primaryKeyword],
  );

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      if (!slug.trim() || !resolvedSemanticClusterKey) {
        setClusterPeers([]);
        return;
      }
      void (async () => {
        const token = await getToken();
        if (cancelled || !token) return;
        const qp = new URLSearchParams();
        qp.set("exclude_slug", slug.trim());
        qp.set("tag_slugs", selectedTagSlugs.join(","));
        if (semanticCluster.trim()) qp.set("semantic_cluster", semanticCluster.trim());
        const res = await fetch(`/api/admin/blog/cluster-peers?${qp.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => ({}))) as { peers?: ClusterPeerPost[] };
        if (cancelled || !res.ok) return;
        setClusterPeers(Array.isArray(json.peers) ? json.peers : []);
      })();
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [slug, selectedTagSlugs, semanticCluster, resolvedSemanticClusterKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) return;
      const res = await fetch("/api/admin/blog/taxonomy", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        categories?: { id: string; slug: string; name: string }[];
        tags?: { id: string; slug: string; name: string }[];
      };
      if (cancelled || !res.ok) return;
      setCategories(json.categories ?? []);
      setTags(json.tags ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode !== "edit" || !postId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const token = await getToken();
      if (!token) {
        setLoadError("Not signed in.");
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/admin/blog/posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { post?: Record<string, unknown>; error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(json.error ?? "Failed to load post.");
        setLoading(false);
        return;
      }
      const p = json.post;
      if (!p) {
        setLoadError("Post not found.");
        setLoading(false);
        return;
      }
      setTitle(String(p.title ?? ""));
      setSlug(String(p.slug ?? ""));
      setSlugAuto(false);
      setH1(p.h1 == null ? "" : String(p.h1));
      setExcerpt(p.excerpt == null ? "" : String(p.excerpt));
      setStatus((p.status as typeof status) ?? "draft");
      setSource((p.source as typeof source) ?? "editorial");
      setPublishedAtLocal(toDatetimeLocalValue(p.published_at == null ? null : String(p.published_at)));
      setMetaTitle(p.meta_title == null ? "" : String(p.meta_title));
      setMetaDescription(p.meta_description == null ? "" : String(p.meta_description));
      setCanonicalUrl(p.canonical_url == null ? "" : String(p.canonical_url));
      setFeaturedUrl(p.featured_image_url == null ? "" : String(p.featured_image_url));
      setFeaturedAlt(p.featured_image_alt == null ? "" : String(p.featured_image_alt));
      setNoindex(Boolean(p.noindex));
      setPrimaryKeyword(p.primary_keyword == null ? "" : String(p.primary_keyword));
      const sec = p.secondary_keywords;
      setSecondaryKwText(Array.isArray(sec) ? (sec as string[]).join("\n") : "");
      setSearchIntent(p.search_intent == null ? "" : String(p.search_intent));
      setCategoryId(p.category_id == null ? "" : String(p.category_id));
      setSemanticCluster(
        (p as { semantic_cluster?: string | null }).semantic_cluster == null
          ? ""
          : String((p as { semantic_cluster?: string | null }).semantic_cluster),
      );
      const rg = (p as { related_guide_override_slugs?: string[] | null }).related_guide_override_slugs;
      setRelatedGuideOverrideText(Array.isArray(rg) ? rg.join("\n") : "");
      const tids = (p as { tag_ids?: string[] }).tag_ids;
      setTagIds(Array.isArray(tids) ? tids : []);
      const raw = p.content_json;
      const parsed = safeParseBlogContentJson(raw);
      setBlocks(
        parsed.success ? parsed.data.blocks.map((b) => normalizeBlockForEditor(withBlockId(b))) : [],
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, postId]);

  /** Slug follows title only while "Auto-generate" is on; any manual slug edit sets `slugAuto` false. */
  useEffect(() => {
    if (!slugAuto) return;
    if (mode === "edit") return;
    setSlug(slugifyTitle(title));
  }, [title, slugAuto, mode]);

  const updateBlock = useCallback((index: number, next: BlogContentBlock) => {
    setBlocks((prev) => {
      const copy = [...prev];
      const prevB = copy[index];
      const merged = prevB ? ({ ...prevB, ...next } as BlogContentBlock) : next;
      copy[index] = withBlockId(merged);
      return copy;
    });
  }, []);

  const removeBlock = (index: number) => {
    setBlocks((prev) => prev.filter((_, i) => i !== index));
  };

  const moveBlock = (index: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[j]] = [copy[j], copy[index]];
      return copy;
    });
  };

  const validateClient = (): boolean => {
    setFieldErrors([]);
    const errs: string[] = [];
    if (status === "scheduled" && !publishedAtLocal.trim()) {
      errs.push("Scheduled posts need a publish date/time.");
    }
    blocks.forEach((b, bi) => {
      if (b.type !== "faq") return;
      b.items.forEach((it, qi) => {
        if (!it.question.trim() || !it.answer.trim()) {
          errs.push(`FAQ block #${bi + 1}, item ${qi + 1}: question and answer are required.`);
        }
      });
    });
    const c = safeParseBlogContentJson(contentJson);
    if (!c.success) {
      errs.push("Content blocks failed validation — check required fields per block.");
      c.error.errors.slice(0, 8).forEach((e) => errs.push(`${e.path.join(".")}: ${e.message}`));
    }
    if (!title.trim()) errs.push("Title is required.");
    if (!slug.trim()) errs.push("Slug is required.");
    setFieldErrors(errs);
    return errs.length === 0;
  };

  const save = async () => {
    setFormError(null);
    if (!validateClient()) return;
    setSaving(true);
    const token = await getToken();
    if (!token) {
      setFormError("Not signed in.");
      setSaving(false);
      return;
    }
    const published_at =
      status === "draft"
        ? null
        : fromDatetimeLocalValue(publishedAtLocal) ??
          (status === "published" ? new Date().toISOString() : null);
    const body = {
      ...(mode === "edit" && postId ? { id: postId } : {}),
      title: title.trim(),
      slug: slug.trim(),
      h1: h1.trim() || null,
      excerpt: excerpt.trim() || null,
      status,
      source,
      published_at,
      meta_title: metaTitle.trim() || null,
      meta_description: metaDescription.trim() || null,
      canonical_url: canonicalUrl.trim() || null,
      featured_image_url: featuredUrl.trim() || null,
      featured_image_alt: featuredAlt.trim() || null,
      noindex,
      content_json: contentJson,
      primary_keyword: primaryKeyword.trim() || null,
      secondary_keywords: secondaryKwText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      search_intent: searchIntent.trim() || null,
      category_id: categoryId.trim() || null,
      semantic_cluster: semanticCluster.trim() || null,
      related_guide_override_slugs: relatedGuideOverrideText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      tag_ids: tagIds,
      seo_generate_slug_from_keyword: seoGenSlug,
      seo_apply_suggestions: seoApplySuggestions,
    };

    const res = await fetch("/api/admin/blog/posts", {
      method: mode === "edit" ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: string;
      post?: { id: string };
      validation?: { issues?: { code: string; message: string }[] };
    };
    setSaving(false);
    if (!res.ok) {
      const pubIssues = json.validation?.issues?.map((i) => i.message).filter(Boolean) ?? [];
      setFieldErrors(pubIssues);
      setFormError(json.error ?? "Save failed.");
      return;
    }
    setFieldErrors([]);
    if (mode === "create" && json.post?.id) {
      router.push(`/admin/blog/${json.post.id}`);
      router.refresh();
      return;
    }
    router.refresh();
  };

  const applyTemplate = () => {
    if (!templateChoice) return;
    let json: BlogContentJson;
    if (templateChoice === "location") {
      json = buildBlogTemplateContent({
        template: "location",
        vars: { areaName: tplArea, cityName: tplCity, serviceName: tplService },
      });
    } else if (templateChoice === "comparison") {
      json = buildBlogTemplateContent({
        template: "comparison",
        vars: { topicA: tplA, topicB: tplB, cityName: tplCity },
      });
    } else {
      json = buildBlogTemplateContent({
        template: "guide",
        vars: { topic: tplTopic, cityName: tplCity },
      });
    }
    setBlocks(json.blocks.map((b) => withBlockId(b)));
  };

  if (loading) {
    return <p className="text-sm text-zinc-600">Loading…</p>;
  }
  if (loadError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {loadError}{" "}
        <Link href="/admin/blog" className="font-medium underline">
          Back to list
        </Link>
      </div>
    );
  }

  const publishSidebarProps = {
    saving,
    onSave: save,
    status,
    onStatusChange: setStatus,
    source,
    onSourceChange: setSource,
    publishedAtLocal,
    onPublishedAtLocalChange: setPublishedAtLocal,
    slug,
    canonicalUrl,
    metaTitle,
    metaDescription,
    semanticCluster,
    resolvedClusterKey: resolvedSemanticClusterKey,
    preview: publishPreview,
    clusterPeerCount: clusterPeers.length,
  };

  return (
    <div className="w-full min-w-0 pb-28 md:pb-16">
      {(formError || fieldErrors.length > 0) && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
          {formError ? <p className="font-medium">{formError}</p> : null}
          {fieldErrors.length > 0 ? (
            <ul className={cn("list-disc pl-5", formError ? "mt-2" : "")}>
              {fieldErrors.map((e, idx) => (
                <li key={`${idx}-${e}`}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <header className="mb-8 flex flex-col gap-4 border-b border-zinc-200/90 pb-8 sm:flex-row sm:items-end sm:justify-between dark:border-zinc-800/90">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Blog</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
            {mode === "create" ? "New article" : "Edit article"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
            Long-form workspace — content, SEO, and cluster governance stay separate so you can focus on the draft.
          </p>
        </div>
        <Button type="button" variant="outline" className="shrink-0 self-start sm:self-auto" asChild>
          <Link href="/admin/blog">← All posts</Link>
        </Button>
      </header>

      <div className="mb-6 xl:hidden">
        <details className="group overflow-hidden rounded-2xl border border-zinc-200/90 bg-zinc-50/90 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Publishing & SEO</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="max-h-[min(70vh,520px)] overflow-y-auto border-t border-zinc-200/80 px-4 py-4 dark:border-zinc-800">
            <PublishSidebarPanel {...publishSidebarProps} />
          </div>
        </details>
      </div>

      <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-10 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-12">
        <div className="min-w-0 space-y-10 xl:max-w-[860px] xl:justify-self-end">
          <EditorialSectionCard
            kicker="A — Article basics"
            title="Article basics"
            description="Title, URL, excerpt, and how the post is filed in the blog taxonomy."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  className="rounded-lg text-base"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Working title"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="slug">Slug</Label>
                  <Input
                    id="slug"
                    className="rounded-lg font-mono text-sm"
                    value={slug}
                    onChange={(e) => {
                      setSlugAuto(false);
                      setSlug(e.target.value);
                    }}
                    placeholder="url-slug"
                  />
                  {mode === "create" ? (
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      <input type="checkbox" checked={slugAuto} onChange={(e) => setSlugAuto(e.target.checked)} />
                      Auto-generate from title
                    </label>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="h1">H1 override (optional)</Label>
                  <Input
                    id="h1"
                    className="rounded-lg"
                    value={h1}
                    onChange={(e) => setH1(e.target.value)}
                    placeholder="Visible H1 if different from title"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="excerpt">Excerpt</Label>
                <Textarea
                  id="excerpt"
                  className="rounded-lg"
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  rows={3}
                  placeholder="Short summary for cards and meta fallback"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="cat">Category</Label>
                  <select
                    id="cat"
                    className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-950"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Tags</Label>
                  <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg border border-zinc-200/90 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    {tags.map((t) => {
                      const on = tagIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-2 py-1 text-xs hover:border-zinc-200 hover:bg-white dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              setTagIds((prev) => (on ? prev.filter((id) => id !== t.id) : [...prev, t.id]))
                            }
                          />
                          {t.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </EditorialSectionCard>

          {mode === "create" ? (
            <Card className="border-blue-200/60 bg-blue-50/40 dark:border-blue-900/40 dark:bg-blue-950/25">
              <CardHeader className="px-5 py-4">
                <CardTitle className="text-base">Start from template</CardTitle>
                <CardDescription>
                  Inserts starter blocks — expand copy before publishing (minimum 800 words).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-5 pb-5">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Template</Label>
                    <select
                      className="flex h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      value={templateChoice}
                      onChange={(e) => setTemplateChoice(e.target.value as BlogTemplateId | "")}
                    >
                      <option value="">— None —</option>
                      {BLOG_TEMPLATE_OPTIONS.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {templateChoice === "location" ? (
                    <>
                      <Input placeholder="Area" value={tplArea} onChange={(e) => setTplArea(e.target.value)} />
                      <Input placeholder="City" value={tplCity} onChange={(e) => setTplCity(e.target.value)} />
                      <Input placeholder="Service" value={tplService} onChange={(e) => setTplService(e.target.value)} />
                    </>
                  ) : null}
                  {templateChoice === "comparison" ? (
                    <>
                      <Input placeholder="Option A" value={tplA} onChange={(e) => setTplA(e.target.value)} />
                      <Input placeholder="Option B" value={tplB} onChange={(e) => setTplB(e.target.value)} />
                      <Input placeholder="City" value={tplCity} onChange={(e) => setTplCity(e.target.value)} />
                    </>
                  ) : null}
                  {templateChoice === "guide" ? (
                    <>
                      <Input placeholder="Topic" value={tplTopic} onChange={(e) => setTplTopic(e.target.value)} />
                      <Input placeholder="City" value={tplCity} onChange={(e) => setTplCity(e.target.value)} />
                    </>
                  ) : null}
                  <Button type="button" variant="secondary" size="sm" onClick={applyTemplate} disabled={!templateChoice}>
                    Apply template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <EditorialSectionCard
            kicker="B — SEO"
            title="Search & metadata"
            description="What search engines and social previews use — distinct from the article body below."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="mt">Meta title</Label>
                <Input id="mt" className="rounded-lg" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="md">Meta description</Label>
                <Textarea
                  id="md"
                  className="rounded-lg"
                  value={metaDescription}
                  onChange={(e) => setMetaDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="can">Canonical URL (optional)</Label>
                <Input
                  id="can"
                  className="rounded-lg font-mono text-sm"
                  value={canonicalUrl}
                  onChange={(e) => setCanonicalUrl(e.target.value)}
                  placeholder="/blog/slug"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-zinc-600 sm:col-span-2 dark:text-zinc-300">
                <input id="noi" type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
                <Label htmlFor="noi" className="cursor-pointer font-normal">
                  Noindex
                </Label>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/50">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">SERP-style preview</p>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-blue-800 dark:text-blue-300">
                {metaTitle.trim() || title.trim() || "Meta title preview"}
              </p>
              <p className="mt-0.5 truncate text-xs text-emerald-700 dark:text-emerald-400/90">
                shalean.co.za › blog › {slug.trim() || "your-slug"}
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {metaDescription.trim() || excerpt.trim() || "Meta description will fall back to excerpt when empty."}
              </p>
            </div>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="pk">Primary keyword</Label>
                <Input
                  id="pk"
                  className="rounded-lg"
                  value={primaryKeyword}
                  onChange={(e) => setPrimaryKeyword(e.target.value)}
                  placeholder="e.g. cleaning claremont"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sk">Secondary keywords (one per line)</Label>
                <Textarea
                  id="sk"
                  className="rounded-lg"
                  value={secondaryKwText}
                  onChange={(e) => setSecondaryKwText(e.target.value)}
                  rows={3}
                  placeholder={"house cleaning claremont\ncleaners near me"}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="intent">Search intent</Label>
                <select
                  id="intent"
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  value={searchIntent}
                  onChange={(e) => setSearchIntent(e.target.value)}
                >
                  <option value="">—</option>
                  <option value="informational">informational</option>
                  <option value="transactional">transactional</option>
                  <option value="commercial">commercial</option>
                  <option value="navigational">navigational</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                <input type="checkbox" checked={seoGenSlug} onChange={(e) => setSeoGenSlug(e.target.checked)} />
                Generate slug from primary keyword on save (server)
              </label>
              <label className="flex items-center gap-2 text-xs text-zinc-600 sm:col-span-2 dark:text-zinc-400">
                <input type="checkbox" checked={seoApplySuggestions} onChange={(e) => setSeoApplySuggestions(e.target.checked)} />
                Apply meta/H1 suggestions where empty (server)
              </label>
            </div>
          </EditorialSectionCard>

          <EditorialSectionCard
            kicker="D — Cluster governance"
            title="Topical cluster & related guides"
            description="Advisory signals — tune intent overlap and footer related guides without blocking your draft."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="semantic-cluster">Semantic cluster</Label>
                <select
                  id="semantic-cluster"
                  className="flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  value={semanticCluster}
                  onChange={(e) => setSemanticCluster(e.target.value)}
                >
                  <option value="">— Unset —</option>
                  {SEMANTIC_CLUSTER_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
                <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Internal topical graph key for validation and peers. Optional <code className="rounded bg-zinc-100 px-1 font-mono text-[11px] dark:bg-zinc-800">cluster-*</code> tags still apply when unset.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="related-guide-overrides">Related guide overrides (optional)</Label>
                <Textarea
                  id="related-guide-overrides"
                  rows={4}
                  className="rounded-lg font-mono text-xs"
                  placeholder={"one slug per line"}
                  value={relatedGuideOverrideText}
                  onChange={(e) => setRelatedGuideOverrideText(e.target.value)}
                />
                <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Pins appear first in &quot;Related guides (Shalean cluster)&quot;; remaining slots fill from peers (max 8).
                </p>
              </div>
              {publishPreview.warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/35 p-4 dark:border-amber-900/35 dark:bg-amber-950/20">
                  <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
                    {publishPreview.warnings.length} overlap / intent advisory{" "}
                    {publishPreview.warnings.length === 1 ? "note" : "notes"}
                  </p>
                  <p className="mt-1 text-xs text-amber-900/85 dark:text-amber-100/80">
                    Same details appear in the publishing column — expand there for the full list.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">No cluster overlap flags for this draft.</p>
              )}
            </div>
          </EditorialSectionCard>

          <EditorialSectionCard
            kicker="E — Media"
            title="Featured image"
            description="Hero image for listings and social sharing."
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="feat">Image URL</Label>
                <Input id="feat" className="rounded-lg font-mono text-sm" value={featuredUrl} onChange={(e) => setFeaturedUrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="feata">Alt text</Label>
                <Input id="feata" className="rounded-lg" value={featuredAlt} onChange={(e) => setFeaturedAlt(e.target.value)} />
              </div>
            </div>
          </EditorialSectionCard>

          <section className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">C — Content</p>
              <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Article body</h2>
              <p className="mt-1 max-w-xl text-sm text-zinc-500 dark:text-zinc-400">
                Blocks render on the public blog in order — use rich text for long copy, then structured blocks for FAQ, CTA, and internal links.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-zinc-200/90 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
              <div className="space-y-1">
                <Label>Add block</Label>
                <select
                  className="flex h-10 min-w-[220px] rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  value={addType}
                  onChange={(e) => setAddType(e.target.value as AddableType)}
                >
                  <optgroup label="Rich & structured">
                    <option value="rich_text">rich_text (WordPress-style)</option>
                    <option value="image">image</option>
                    <option value="faq">faq</option>
                    <option value="cta">cta</option>
                    <option value="internal_links">internal_links</option>
                  </optgroup>
                  <optgroup label="Layouts">
                    <option value="intro">intro</option>
                    <option value="quick_answer">quick_answer</option>
                    <option value="section">section</option>
                    <option value="heading">heading</option>
                    <option value="bullets">bullets</option>
                    <option value="bullet_list">bullet_list</option>
                    <option value="numbered_list">numbered_list</option>
                    <option value="key_takeaways">key_takeaways</option>
                    <option value="comparison_table">comparison_table</option>
                  </optgroup>
                </select>
              </div>
              <Button type="button" variant="secondary" onClick={() => setBlocks((b) => [...b, newBlock(addType)])}>
                Add block
              </Button>
              <Button type="button" variant="outline" onClick={() => setBlocks((b) => [...b, newBlock("image")])}>
                Insert image
              </Button>
            </div>

            <div className="article-editor-canvas space-y-5">
              {blocks.map((block, i) => (
                <div
                  key={block.id ?? `idx-${i}`}
                  className="rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80"
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      {block.type} · #{i + 1}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => moveBlock(i, -1)}>
                        Up
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => moveBlock(i, 1)}>
                        Down
                      </Button>
                      <Button type="button" size="sm" variant="destructive" onClick={() => removeBlock(i)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                  <BlockFields block={block} onChange={(next) => updateBlock(i, next)} />
                </div>
              ))}
            </div>

            <details className="group overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/80">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
                <span>Reading preview (public layout)</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" aria-hidden />
              </summary>
              <div className="article-reading-preview max-h-[min(70vh,640px)] overflow-y-auto border-t border-zinc-100 px-5 py-6 dark:border-zinc-800">
                <BlogContent prose>
                  <BlogContentRenderer content={contentJson} />
                </BlogContent>
              </div>
            </details>
          </section>
        </div>

        <aside className="hidden min-w-0 xl:block">
          <div className="sticky top-20 max-h-[calc(100vh-5.5rem)] overflow-y-auto rounded-2xl border border-zinc-200/90 bg-zinc-50/90 p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">F — Publishing</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Status, save, and a calm summary of SEO + cluster signals.</p>
            <div className="mt-5">
              <PublishSidebarPanel {...publishSidebarProps} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function BlockFields({
  block,
  onChange,
}: {
  block: BlogContentBlock;
  onChange: (b: BlogContentBlock) => void;
}) {
  const lab = "text-xs font-medium text-zinc-600 dark:text-zinc-400";
  const inp = "mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950";

  switch (block.type) {
    case "intro":
      return (
        <div>
          <label className={lab}>Content</label>
          <Textarea className={cn(inp, "min-h-[88px]")} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
        </div>
      );
    case "section":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Title</label>
            <Input className={inp} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </div>
          <div>
            <label className={lab}>Heading level</label>
            <select
              className={inp}
              value={String(block.heading_level ?? 2)}
              onChange={(e) =>
                onChange({ ...block, heading_level: Number(e.target.value) as 2 | 3 | 4 })
              }
            >
              <option value="2">h2</option>
              <option value="3">h3</option>
              <option value="4">h4</option>
            </select>
          </div>
          <div>
            <label className={lab}>Content</label>
            <Textarea className={cn(inp, "min-h-[100px]")} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
          </div>
        </div>
      );
    case "heading":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Level</label>
            <select
              className={inp}
              value={String(block.level)}
              onChange={(e) => onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 })}
            >
              <option value="1">h1</option>
              <option value="2">h2</option>
              <option value="3">h3</option>
            </select>
          </div>
          <div>
            <label className={lab}>Text</label>
            <Input className={inp} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
          </div>
        </div>
      );
    case "bullets":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Section title (optional)</label>
            <Input className={inp} value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value || undefined })} />
          </div>
          {block.items.map((item, j) => (
            <div key={j} className="flex gap-2">
              <Input
                className={inp}
                value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = e.target.value;
                  onChange({ ...block, items });
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })}
              >
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...block, items: [...block.items, ""] })}>
            Add bullet
          </Button>
        </div>
      );
    case "bullet_list":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Section title (optional)</label>
            <Input className={inp} value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value || undefined })} />
          </div>
          {block.items.map((item, j) => (
            <div key={j} className="flex gap-2">
              <Input
                className={inp}
                value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = e.target.value;
                  onChange({ ...block, items });
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })}
              >
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...block, items: [...block.items, ""] })}>
            Add item
          </Button>
        </div>
      );
    case "numbered_list":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Section title (optional)</label>
            <Input className={inp} value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value || undefined })} />
          </div>
          {block.items.map((item, j) => (
            <div key={j} className="flex gap-2">
              <Input
                className={inp}
                value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = e.target.value;
                  onChange({ ...block, items });
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })}
              >
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...block, items: [...block.items, ""] })}>
            Add step
          </Button>
        </div>
      );
    case "faq":
      return (
        <div className="blog-editor-faq-root space-y-4">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={Boolean(block.omit_section_heading)}
              onChange={(e) =>
                onChange({
                  ...block,
                  omit_section_heading: e.target.checked ? true : undefined,
                })
              }
            />
            Omit built-in FAQ title (use a preceding heading block)
          </label>
          {block.items.map((item, j) => (
            <div
              key={j}
              className="overflow-hidden rounded-xl border border-zinc-200/90 bg-zinc-50/40 shadow-sm dark:border-zinc-700/90 dark:bg-zinc-900/35"
            >
              <div className="border-l-[3px] border-l-zinc-400 bg-zinc-100/30 px-3 py-3 dark:border-l-zinc-500 dark:bg-zinc-800/25">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  FAQ · Question {j + 1}
                </p>
                <Input
                  className={cn(
                    "mt-2 border-0 border-b border-zinc-200/80 bg-transparent px-0 pb-2 text-base font-semibold leading-snug tracking-tight text-zinc-900 shadow-none placeholder:text-zinc-400 focus-visible:border-zinc-400 focus-visible:ring-0 dark:border-zinc-600 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus-visible:border-zinc-500",
                  )}
                  value={item.question}
                  placeholder="Question shown as a heading on the site"
                  onChange={(e) => {
                    const items = [...block.items];
                    items[j] = { ...items[j], question: e.target.value };
                    onChange({ ...block, items });
                  }}
                />
              </div>
              <div className="border-t border-zinc-200/70 bg-white/70 px-3 py-3 dark:border-zinc-700/80 dark:bg-zinc-950/40">
                <label className={lab}>Answer</label>
                <Textarea
                  className={cn(inp, "mt-1 min-h-[88px] rounded-lg")}
                  value={item.answer}
                  onChange={(e) => {
                    const items = [...block.items];
                    items[j] = { ...items[j], answer: e.target.value };
                    onChange({ ...block, items });
                  }}
                />
                <Button
                  type="button"
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })}
                >
                  Remove FAQ
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...block, items: [...block.items, { question: "", answer: "" }] })}
          >
            Add FAQ item
          </Button>
        </div>
      );
    case "cta":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={lab}>Title</label>
            <Input className={inp} value={block.title} onChange={(e) => onChange({ ...block, title: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className={lab}>Description (optional)</label>
            <Textarea className={inp} value={block.description ?? ""} onChange={(e) => onChange({ ...block, description: e.target.value || undefined })} />
          </div>
          <div>
            <label className={lab}>Button</label>
            <Input className={inp} value={block.button_text} onChange={(e) => onChange({ ...block, button_text: e.target.value })} />
          </div>
          <div>
            <label className={lab}>Link</label>
            <Input className={inp} value={block.link} onChange={(e) => onChange({ ...block, link: e.target.value })} />
          </div>
          <div>
            <label className={lab}>Variant</label>
            <select
              className={inp}
              value={block.variant ?? "primary"}
              onChange={(e) => onChange({ ...block, variant: e.target.value as "primary" | "secondary" })}
            >
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
            </select>
          </div>
        </div>
      );
    case "internal_links":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Title (optional)</label>
            <Input className={inp} value={block.title ?? ""} onChange={(e) => onChange({ ...block, title: e.target.value || undefined })} />
          </div>
          {block.links.map((l, j) => (
            <div key={j} className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input
                className={cn(inp, "sm:flex-1")}
                placeholder="Label"
                value={l.label}
                onChange={(e) => {
                  const links = [...block.links];
                  links[j] = { ...links[j], label: e.target.value };
                  onChange({ ...block, links });
                }}
              />
              <Input
                className={cn(inp, "sm:flex-1")}
                placeholder="/path"
                value={l.url}
                onChange={(e) => {
                  const links = [...block.links];
                  links[j] = { ...links[j], url: e.target.value };
                  onChange({ ...block, links });
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...block, links: block.links.filter((_, k) => k !== j) })}>
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...block, links: [...block.links, { label: "", url: "/" }] })}>
            Add link
          </Button>
        </div>
      );
    case "quick_answer":
      return (
        <div>
          <label className={lab}>Content</label>
          <Textarea className={cn(inp, "min-h-[88px]")} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
        </div>
      );
    case "rich_text":
      return (
        <div className="space-y-2">
          <label className={lab}>Rich content</label>
          <RichTextBlockEditor html={block.html} onChange={(html) => onChange({ ...block, html })} />
        </div>
      );
    case "paragraph":
      return (
        <div className="space-y-2">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Legacy paragraph block — edit below or save to migrate copy into rich_text elsewhere.
          </p>
          <label className={lab}>Content</label>
          <Textarea className={cn(inp, "min-h-[88px]")} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
        </div>
      );
    case "key_takeaways":
      return (
        <div className="space-y-2">
          {block.items.map((item, j) => (
            <div key={j} className="flex gap-2">
              <Input
                className={inp}
                value={item}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = e.target.value;
                  onChange({ ...block, items });
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })}>
                ×
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...block, items: [...block.items, ""] })}>
            Add line
          </Button>
        </div>
      );
    case "image":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>URL</label>
            <Input className={inp} value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} />
          </div>
          <div>
            <label className={lab}>Alt</label>
            <Input className={inp} value={block.alt} onChange={(e) => onChange({ ...block, alt: e.target.value })} />
          </div>
          <div>
            <label className={lab}>Caption (optional)</label>
            <Input className={inp} value={block.caption ?? ""} onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })} />
          </div>
        </div>
      );
    case "quote":
      return (
        <div className="space-y-2">
          <div>
            <label className={lab}>Quote</label>
            <Textarea className={cn(inp, "min-h-[80px]")} value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} />
          </div>
          <div>
            <label className={lab}>Attribution (optional)</label>
            <Input className={inp} value={block.attribution ?? ""} onChange={(e) => onChange({ ...block, attribution: e.target.value || undefined })} />
          </div>
        </div>
      );
    case "comparison":
      return (
        <div className="space-y-3">
          {block.items.map((item, j) => (
            <div key={j} className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
              <label className={lab}>Label</label>
              <Input
                className={inp}
                value={item.label}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = { ...items[j], label: e.target.value };
                  onChange({ ...block, items });
                }}
              />
              <label className={cn(lab, "mt-2 block")}>Value</label>
              <Textarea
                className={cn(inp, "min-h-[64px]")}
                value={item.value}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = { ...items[j], value: e.target.value };
                  onChange({ ...block, items });
                }}
              />
              <Button type="button" className="mt-2" size="sm" variant="outline" onClick={() => onChange({ ...block, items: block.items.filter((_, k) => k !== j) })}>
                Remove
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ ...block, items: [...block.items, { label: "", value: "" }] })}>
            Add pair
          </Button>
        </div>
      );
    case "service_area":
      return (
        <div>
          <label className={lab}>Locations (one per line)</label>
          <Textarea
            className={cn(inp, "min-h-[100px]")}
            value={block.locations.join("\n")}
            onChange={(e) =>
              onChange({
                ...block,
                locations: e.target.value
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      );
    case "comparison_table":
      return (
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Edit columns first; row cells must match column count.</p>
          <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex min-w-min flex-wrap gap-2">
            {block.columns.map((c, j) => (
              <Input
                key={j}
                className={cn(inp, "w-32")}
                placeholder={`Col ${j + 1}`}
                value={c}
                onChange={(e) => {
                  const columns = [...block.columns];
                  columns[j] = e.target.value;
                  const n = columns.length;
                  const rows = block.rows.map((row) => {
                    const next = [...row];
                    while (next.length < n) next.push("");
                    return next.slice(0, n);
                  });
                  onChange({ ...block, columns, rows });
                }}
              />
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                onChange({
                  ...block,
                  columns: [...block.columns, ""],
                  rows: block.rows.map((row) => [...row, ""]),
                })
              }
            >
              +Col
            </Button>
            {block.columns.length > 1 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  const columns = block.columns.slice(0, -1);
                  const n = columns.length;
                  const rows = block.rows.map((row) => row.slice(0, n));
                  onChange({ ...block, columns, rows });
                }}
              >
                −Col
              </Button>
            ) : null}
          </div>
          </div>
          {block.rows.map((row, ri) => (
            <div key={ri} className="flex min-w-0 flex-wrap gap-2 overflow-x-auto">
              {row.map((cell, ci) => (
                <Input
                  key={ci}
                  className={cn(inp, "w-28 sm:w-36")}
                  value={cell}
                  onChange={(e) => {
                    const rows = [...block.rows];
                    const nr = [...rows[ri]];
                    nr[ci] = e.target.value;
                    rows[ri] = nr;
                    onChange({ ...block, rows });
                  }}
                />
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => onChange({ ...block, rows: block.rows.filter((_, k) => k !== ri) })}>
                × row
              </Button>
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onChange({ ...block, rows: [...block.rows, block.columns.map(() => "")] })}
          >
            Add row
          </Button>
        </div>
      );
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
