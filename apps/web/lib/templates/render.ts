import type { TemplateRow } from "@/lib/templates/types";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Parses `variables` JSON from DB into an allowlist of placeholder keys. */
export function parseTemplateVariableAllowlist(variables: unknown): string[] {
  if (!Array.isArray(variables)) return [];
  const out: string[] = [];
  for (const v of variables) {
    if (typeof v === "string" && /^[a-zA-Z0-9_]+$/.test(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

export function getVariableAllowlistFromRow(row: TemplateRow): string[] {
  return parseTemplateVariableAllowlist(row.variables);
}

export type RenderTemplateOptions = {
  /** When set, only keys in this list are substituted; other `{{tokens}}` become empty strings. */
  allowedKeys?: string[];
  /** Escape substituted values as HTML (use for email body/subject from untrusted booking data). */
  escapeHtmlValues?: boolean;
  /** Strip angle brackets from substituted values (plain-text channels). */
  stripAngleBrackets?: boolean;
};

function formatValue(raw: unknown, opts: RenderTemplateOptions): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw);
  let v = s;
  if (opts.stripAngleBrackets) v = v.replace(/[<>]/g, "");
  if (opts.escapeHtmlValues) return escapeHtml(v);
  return v;
}

/**
 * Renders `{{key}}` placeholders. When `allowedKeys` is provided, unknown tokens resolve to empty strings
 * so arbitrary placeholders cannot pull arbitrary object keys from `data`.
 */
export function renderTemplate(
  content: string,
  data: Record<string, unknown>,
  options: RenderTemplateOptions = {},
): string {
  const allow = options.allowedKeys;
  return content.replace(PLACEHOLDER_RE, (_, rawKey: string) => {
    const key = rawKey.trim();
    if (allow && allow.length && !allow.includes(key)) return "";
    const value = data[key];
    return formatValue(value, options);
  });
}
