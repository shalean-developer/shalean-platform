import type { EditorialLinkIssue } from "@/lib/blog/editorialLinkValidation";
import { validateEditorialContentLinks } from "@/lib/blog/editorialLinkValidation";

export type EditorialLinkDiagnosticRow = {
  severity: "error" | "warning" | "info";
  code: EditorialLinkIssue["kind"];
  detail: string;
  raw?: string;
  suggestedCanonical?: string;
};

/**
 * Lightweight rows for admin/editor panels (CMS-agnostic).
 */
export function getEditorialLinkDiagnostics(input: {
  html?: string;
  markdown?: string;
  tiptapJson?: string;
}): EditorialLinkDiagnosticRow[] {
  const { issues } = validateEditorialContentLinks(input, {});
  const rows: EditorialLinkDiagnosticRow[] = [];
  for (const i of issues) {
    const severity: EditorialLinkDiagnosticRow["severity"] =
      i.kind === "redirect_alias" ? "error" : i.kind === "non_canonical_blog_href" ? "warning" : "info";
    rows.push({
      severity,
      code: i.kind,
      detail: i.message,
      raw: i.raw,
      suggestedCanonical: i.suggestedHref,
    });
  }
  return rows;
}
