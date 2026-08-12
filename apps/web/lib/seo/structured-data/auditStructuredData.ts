import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarketingSitemapEntries } from "@/lib/seo/buildMarketingSitemapEntries";

export type StructuredDataAuditRow = {
  url: string;
  path: string;
  page_group: string;
  http_status: number | null;
  json_ld_count: number;
  schema_types: string[];
  required_types: string[];
  missing_types: string[];
  errors: string[];
  warnings: string[];
  status: "valid" | "warning" | "error" | "unknown";
  checked_at: string;
  raw_summary: Record<string, unknown>;
};

const AUDIT_FETCH_TIMEOUT_MS = 15_000;
const AUDIT_BATCH_SIZE = 5;

function pageGroup(path: string): string {
  if (path === "/") return "core";
  if (path.startsWith("/blog/")) return "blog";
  if (path === "/blog") return "blog";
  if (path.startsWith("/services/") || path === "/services" || path.includes("cleaning-services")) return "service";
  if (path.startsWith("/locations/") || path === "/locations") return "location";
  if (path.startsWith("/cleaner/")) return "recruitment";
  return "core";
}

function expectedTypes(path: string): string[] {
  if (path === "/") return ["LocalBusiness"];
  if (path.startsWith("/blog/")) return ["Article", "BreadcrumbList"];
  if (path.startsWith("/services/") || path.includes("cleaning-services")) return ["Service", "BreadcrumbList"];
  if (path.startsWith("/locations/")) return ["LocalBusiness", "Service", "BreadcrumbList"];
  return [];
}

function collectTypes(value: unknown, out: Set<string>): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectTypes(item, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  const type = obj["@type"];
  if (typeof type === "string") out.add(type);
  if (Array.isArray(type)) for (const item of type) if (typeof item === "string") out.add(item);
  if (Array.isArray(obj["@graph"])) for (const item of obj["@graph"] as unknown[]) collectTypes(item, out);
}

function validateKnownTypes(items: unknown[], types: Set<string>): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const flattened: Record<string, unknown>[] = [];
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(walk);
    const obj = value as Record<string, unknown>;
    flattened.push(obj);
    if (Array.isArray(obj["@graph"])) (obj["@graph"] as unknown[]).forEach(walk);
  };
  items.forEach(walk);

  for (const obj of flattened) {
    const raw = obj["@type"];
    const objTypes = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : typeof raw === "string" ? [raw] : [];
    if (objTypes.includes("Article") || objTypes.includes("BlogPosting")) {
      if (!obj.headline) errors.push("Article is missing headline");
      if (!obj.datePublished) warnings.push("Article is missing datePublished");
    }
    if (objTypes.includes("LocalBusiness") || objTypes.some((t) => t.endsWith("Business"))) {
      if (!obj.name) errors.push("LocalBusiness is missing name");
      if (!obj.address) warnings.push("LocalBusiness is missing address");
    }
    if (objTypes.includes("Service")) {
      if (!obj.name) errors.push("Service is missing name");
      if (!obj.provider) warnings.push("Service is missing provider");
    }
    if (objTypes.includes("BreadcrumbList") && !obj.itemListElement) errors.push("BreadcrumbList is missing itemListElement");
  }

  if (types.size === 0) warnings.push("No JSON-LD schema types found");
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

async function inspectUrl(url: string): Promise<StructuredDataAuditRow> {
  const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
  const required = expectedTypes(path);
  const checkedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUDIT_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "Shalean-SEO-StructuredData-Audit/1.0" } });
    const html = await response.text();
    const scriptRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const items: unknown[] = [];
    const parseErrors: string[] = [];
    for (const match of html.matchAll(scriptRe)) {
      try { items.push(JSON.parse(match[1])); }
      catch { parseErrors.push("Invalid JSON-LD JSON syntax"); }
    }
    const types = new Set<string>();
    items.forEach((item) => collectTypes(item, types));
    const missing = required.filter((type) => !types.has(type) && !(type === "Article" && types.has("BlogPosting")));
    const validation = validateKnownTypes(items, types);
    const errors = [...new Set([...parseErrors, ...validation.errors, ...missing.map((type) => `Missing expected ${type} schema`)])];
    const warnings = validation.warnings;
    const status: StructuredDataAuditRow["status"] = !response.ok || errors.length ? "error" : warnings.length ? "warning" : "valid";
    return {
      url, path, page_group: pageGroup(path), http_status: response.status, json_ld_count: items.length,
      schema_types: [...types].sort(), required_types: required, missing_types: missing, errors, warnings, status,
      checked_at: checkedAt,
      raw_summary: { finalUrl: response.url, contentType: response.headers.get("content-type"), googleRichResultEligibleTypes: [...types].filter((t) => ["Article","BlogPosting","BreadcrumbList","LocalBusiness","Organization"].includes(t)) },
    };
  } catch (error) {
    const isAbort = error instanceof Error && (error.name === "AbortError" || /aborted/i.test(error.message));
    const message = isAbort
      ? `Audit fetch timed out after ${AUDIT_FETCH_TIMEOUT_MS / 1000}s; schema was not evaluated`
      : error instanceof Error ? error.message : "Fetch failed";
    return {
      url,
      path,
      page_group: pageGroup(path),
      http_status: null,
      json_ld_count: 0,
      schema_types: [],
      required_types: required,
      missing_types: [],
      errors: [message],
      warnings: [],
      status: "unknown",
      checked_at: checkedAt,
      raw_summary: { fetchFailed: true, timedOut: isAbort },
    };
  } finally { clearTimeout(timer); }
}

export async function runStructuredDataAudit(admin: SupabaseClient, limit = 220): Promise<{ ok: boolean; scanned: number; valid: number; warning: number; error: number }> {
  const sitemap = await buildMarketingSitemapEntries();
  const urls = sitemap.slice(0, Math.max(1, Math.min(limit, 250))).map((entry) => entry.url);
  const rows: StructuredDataAuditRow[] = [];
  for (let i = 0; i < urls.length; i += AUDIT_BATCH_SIZE) {
    rows.push(...await Promise.all(urls.slice(i, i + AUDIT_BATCH_SIZE).map(inspectUrl)));
  }
  if (rows.length) {
    const { error } = await admin.from("seo_structured_data_audits").upsert(rows.map((row) => ({ ...row, updated_at: row.checked_at })), { onConflict: "url" });
    if (error) throw new Error(error.message);
  }
  return { ok: true, scanned: rows.length, valid: rows.filter((r) => r.status === "valid").length, warning: rows.filter((r) => r.status === "warning").length, error: rows.filter((r) => r.status === "error").length };
}
