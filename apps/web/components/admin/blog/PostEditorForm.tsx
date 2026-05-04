"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { slugifyTitle } from "@/lib/blog/slugify-title";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentBlock, type BlogContentJson } from "@/lib/blog/content-json";
import { safeParseBlogContentJson } from "@/lib/blog/content-json-schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { validateBlogPublish } from "@/lib/blog/seo/publish-validation";
import {
  buildBlogTemplateContent,
  BLOG_TEMPLATE_OPTIONS,
  type BlogTemplateId,
} from "@/lib/blog/templates";
import { legacyParagraphToRichHtml } from "@/lib/blog/legacy-paragraph-to-rich-html";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";
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
  const [tagIds, setTagIds] = useState<string[]>([]);
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

  const publishPreview = useMemo(() => validateBlogPublish(contentJson), [contentJson]);

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
      tag_ids: tagIds,
      seo_generate_slug_from_keyword: seoGenSlug,
      seo_apply_suggestions: seoApplySuggestions,
    };

    const res = await fetch("/api/admin/blog/posts", {
      method: mode === "edit" ? "PUT" : "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string; post?: { id: string } };
    setSaving(false);
    if (!res.ok) {
      setFormError(json.error ?? "Save failed.");
      return;
    }
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

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-16 px-4">
      {(formError || fieldErrors.length > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError ? <p>{formError}</p> : null}
          {fieldErrors.length > 0 ? (
            <ul className="mt-2 list-disc pl-5">
              {fieldErrors.map((e, idx) => (
                <li key={`${idx}-${e}`}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Post title"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => {
              setSlugAuto(false);
              setSlug(e.target.value);
            }}
            placeholder="url-slug"
          />
          {mode === "create" ? (
            <label className="flex items-center gap-2 text-xs text-zinc-600">
              <input type="checkbox" checked={slugAuto} onChange={(e) => setSlugAuto(e.target.checked)} />
              Auto-generate from title
            </label>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="h1">H1 (optional)</Label>
          <Input id="h1" value={h1} onChange={(e) => setH1(e.target.value)} placeholder="Overrides visible H1" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Source</Label>
          <select
            id="source"
            className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={source}
            onChange={(e) => setSource(e.target.value as typeof source)}
          >
            <option value="editorial">Editorial</option>
            <option value="programmatic">Programmatic</option>
            <option value="high_conversion">High conversion</option>
          </select>
        </div>
        {(status === "published" || status === "scheduled") && (
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="pub">Publish date / time</Label>
            <Input
              id="pub"
              type="datetime-local"
              value={publishedAtLocal}
              onChange={(e) => setPublishedAtLocal(e.target.value)}
            />
            <p className="text-xs text-zinc-500">
              When publishing without a date, the server sets &quot;now&quot;. Drafts clear publish date.
            </p>
          </div>
        )}
        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="excerpt">Excerpt (optional)</Label>
          <Textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="feat">Featured image URL</Label>
          <Input id="feat" value={featuredUrl} onChange={(e) => setFeaturedUrl(e.target.value)} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="feata">Featured image alt</Label>
          <Input id="feata" value={featuredAlt} onChange={(e) => setFeaturedAlt(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mt">Meta title</Label>
          <Input id="mt" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="md">Meta description</Label>
          <Textarea id="md" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={2} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label htmlFor="can">Canonical URL (optional)</Label>
          <Input id="can" value={canonicalUrl} onChange={(e) => setCanonicalUrl(e.target.value)} placeholder="/blog/slug" />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <input id="noi" type="checkbox" checked={noindex} onChange={(e) => setNoindex(e.target.checked)} />
          <Label htmlFor="noi">Noindex</Label>
        </div>
      </div>

      {mode === "create" ? (
        <section className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Start from template</h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            Inserts starter blocks — expand copy before publishing (minimum 800 words).
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Template</Label>
              <select
                className="flex h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
                <Input placeholder="Area (e.g. Claremont)" value={tplArea} onChange={(e) => setTplArea(e.target.value)} />
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
        </section>
      ) : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">SEO & taxonomy</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pk">Primary keyword</Label>
            <Input
              id="pk"
              value={primaryKeyword}
              onChange={(e) => setPrimaryKeyword(e.target.value)}
              placeholder="e.g. cleaning claremont"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sk">Secondary keywords (one per line)</Label>
            <Textarea
              id="sk"
              value={secondaryKwText}
              onChange={(e) => setSecondaryKwText(e.target.value)}
              rows={3}
              placeholder={"house cleaning claremont\ncleaners near me"}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="intent">Search intent</Label>
            <select
              id="intent"
              className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
          <div className="space-y-2">
            <Label htmlFor="cat">Category</Label>
            <select
              id="cat"
              className="flex h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
          <div className="sm:col-span-2 space-y-2">
            <Label>Tags</Label>
            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
              {tags.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <label key={t.id} className="flex cursor-pointer items-center gap-1.5 text-xs">
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
          <label className="flex items-center gap-2 text-xs text-zinc-600 sm:col-span-2">
            <input type="checkbox" checked={seoGenSlug} onChange={(e) => setSeoGenSlug(e.target.checked)} />
            Generate slug from primary keyword on save (server)
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-600 sm:col-span-2">
            <input type="checkbox" checked={seoApplySuggestions} onChange={(e) => setSeoApplySuggestions(e.target.checked)} />
            Apply meta/H1 suggestions where empty (server)
          </label>
          <div className="sm:col-span-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">SEO score: {publishPreview.seoScore}/100</span>
            <span className="ml-2 text-zinc-600 dark:text-zinc-400">
              {publishPreview.wordCount} words · publishing requires passing all checks (≥800 words, FAQ, CTA, internal links).
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label>Add block</Label>
            <select
              className="flex h-10 min-w-[220px] rounded-md border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
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
          <Button
            type="button"
            variant="outline"
            onClick={() => setBlocks((b) => [...b, newBlock("image")])}
          >
            Insert image
          </Button>
        </div>

        <details className="rounded-lg border border-zinc-200 bg-zinc-50/80 lg:hidden dark:border-zinc-800">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Live preview
          </summary>
          <div className="max-h-[55vh] overflow-y-auto border-t border-zinc-200 px-3 py-4 dark:border-zinc-800">
            <BlogContentRenderer content={contentJson} />
          </div>
        </details>

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
          <div className="min-w-0 space-y-4">
            {blocks.map((block, i) => (
              <div
                key={block.id ?? `idx-${i}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {block.type} · #{i + 1}
                  </span>
                  <div className="flex gap-1">
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

          <div className="sticky top-6 mt-6 hidden max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-sm lg:mt-0 lg:block dark:border-zinc-800 dark:bg-zinc-950">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Live preview
            </p>
            <BlogContentRenderer content={contentJson} />
          </div>
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <Link href="/admin/blog">Cancel</Link>
        </Button>
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
        <div className="space-y-3">
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
            <div key={j} className="rounded border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950">
              <label className={lab}>Question</label>
              <Input
                className={inp}
                value={item.question}
                onChange={(e) => {
                  const items = [...block.items];
                  items[j] = { ...items[j], question: e.target.value };
                  onChange({ ...block, items });
                }}
              />
              <label className={cn(lab, "mt-2 block")}>Answer</label>
              <Textarea
                className={cn(inp, "min-h-[72px]")}
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
          <div className="flex flex-wrap gap-2">
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
          {block.rows.map((row, ri) => (
            <div key={ri} className="flex flex-wrap gap-2">
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
