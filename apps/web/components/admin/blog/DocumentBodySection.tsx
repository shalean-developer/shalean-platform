"use client";

import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { BlogContentBlock } from "@/lib/blog/content-json";
import { Button } from "@/components/ui/button";
import { RichTextBlockEditor } from "@/components/admin/blog/RichTextBlockEditor";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";
import { BlogContent } from "@/components/blog/engine/BlogContent";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION, type BlogContentJson } from "@/lib/blog/content-json";
import { mergeDocumentModeToBlocks } from "@/lib/blog/blogDocumentMode";

type Props = {
  documentHtml: string;
  onDocumentHtmlChange: (html: string) => void;
  advancedBlocks: BlogContentBlock[];
  onAdvancedBlocksChange: (blocks: BlogContentBlock[]) => void;
  renderAdvancedBlock: (block: BlogContentBlock, index: number, onChange: (next: BlogContentBlock) => void) => ReactNode;
  newAdvancedBlock: (type: "faq" | "cta") => BlogContentBlock;
  variant?: "default" | "wordpress";
};

export function DocumentBodySection({
  documentHtml,
  onDocumentHtmlChange,
  advancedBlocks,
  onAdvancedBlocksChange,
  renderAdvancedBlock,
  newAdvancedBlock,
  variant = "default",
}: Props) {
  const previewContent: BlogContentJson = {
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks: mergeDocumentModeToBlocks(documentHtml, advancedBlocks),
  };

  function updateAdvancedBlock(index: number, next: BlogContentBlock) {
    onAdvancedBlocksChange(advancedBlocks.map((b, i) => (i === index ? next : b)));
  }

  function removeAdvancedBlock(index: number) {
    onAdvancedBlocksChange(advancedBlocks.filter((_, i) => i !== index));
  }

  const isWordPress = variant === "wordpress";

  return (
    <section className={isWordPress ? "space-y-0" : "space-y-6"}>
      {!isWordPress ? (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Article body</h2>
          <p className="mt-1 text-sm text-slate-500">
            Write the full post in one editor — headings, lists, links, and formatting use the toolbar.
          </p>
        </div>
      ) : null}

      <RichTextBlockEditor
        html={documentHtml}
        onChange={onDocumentHtmlChange}
        variant={isWordPress ? "wordpress" : "document"}
      />

      <details
        className={
          isWordPress
            ? "group border-t border-zinc-200 dark:border-zinc-800"
            : "group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
        }
      >
        <summary
          className={
            isWordPress
              ? "flex cursor-pointer list-none items-center justify-between gap-2 bg-zinc-50/80 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-300 [&::-webkit-details-marker]:hidden"
              : "flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden"
          }
        >
          <span>FAQ & call-to-action {advancedBlocks.length > 0 ? `(${advancedBlocks.length})` : ""}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className={isWordPress ? "space-y-4 px-4 py-4" : "space-y-4 border-t border-slate-100 px-5 py-5"}>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onAdvancedBlocksChange([...advancedBlocks, newAdvancedBlock("faq")])}
            >
              Add FAQ block
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onAdvancedBlocksChange([...advancedBlocks, newAdvancedBlock("cta")])}
            >
              Add CTA block
            </Button>
          </div>
          {advancedBlocks.length === 0 ? (
            <p className="text-sm text-slate-500">Optional structured blocks appended after the article body.</p>
          ) : (
            <div className="space-y-4">
              {advancedBlocks.map((block, index) => (
                <div key={block.id ?? `adv-${index}`} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{block.type}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => removeAdvancedBlock(index)}>
                      Remove
                    </Button>
                  </div>
                  {renderAdvancedBlock(block, index, (next) => updateAdvancedBlock(index, next))}
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {!isWordPress ? (
      <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
          <span>Reading preview</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="article-reading-preview max-h-[min(70vh,640px)] overflow-y-auto border-t border-slate-100 px-5 py-6">
          <BlogContent prose>
            <BlogContentRenderer content={previewContent} />
          </BlogContent>
        </div>
      </details>
      ) : null}
    </section>
  );
}
