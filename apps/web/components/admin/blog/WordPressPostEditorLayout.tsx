"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  mode: "create" | "edit";
  postsListPath: string;
  saving: boolean;
  onSave: () => void;
  formError: string | null;
  fieldErrors: string[];
  title: string;
  onTitleChange: (v: string) => void;
  slug: string;
  onSlugChange: (v: string) => void;
  slugAuto: boolean;
  onSlugAutoChange: (v: boolean) => void;
  permalinkPreview: string;
  viewPostUrl?: string | null;
  viewPostLabel?: string;
  body: ReactNode;
  sidebar: ReactNode;
  createExtras?: ReactNode;
};

export function WordPressPostEditorLayout({
  mode,
  postsListPath,
  saving,
  onSave,
  formError,
  fieldErrors,
  title,
  onTitleChange,
  slug,
  onSlugChange,
  slugAuto,
  onSlugAutoChange,
  permalinkPreview,
  viewPostUrl,
  viewPostLabel = "View post",
  body,
  sidebar,
  createExtras,
}: Props) {
  return (
    <div className="w-full min-w-0 pb-28 md:pb-8">
      {(formError || fieldErrors.length > 0) && (
        <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
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

      <div className="sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-300 bg-zinc-100/95 px-1 py-2.5 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2" asChild>
            <Link href={postsListPath}>← Posts</Link>
          </Button>
          <h1 className="truncate text-base font-normal text-zinc-800 dark:text-zinc-100">
            {mode === "create" ? "Add New Post" : "Edit Post"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {viewPostUrl ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href={viewPostUrl} target="_blank" rel="noopener noreferrer">
                {viewPostLabel}
              </Link>
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Save draft" : "Update"}
          </Button>
        </div>
      </div>

      <div className="mb-5 lg:hidden">
        <details className="group overflow-hidden rounded-sm border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] font-semibold dark:border-zinc-700 dark:bg-zinc-900 [&::-webkit-details-marker]:hidden">
            <span>Post settings</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-3 p-3">{sidebar}</div>
        </details>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <main className="min-w-0 flex-1">
          <div className="rounded-sm border border-zinc-300 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-950">
            <label htmlFor="wp-post-title" className="sr-only">
              Title
            </label>
            <Input
              id="wp-post-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Add title"
              className="h-auto rounded-none border-0 border-b border-transparent bg-transparent px-4 py-4 text-2xl font-semibold shadow-none placeholder:text-zinc-400 focus-visible:border-zinc-200 focus-visible:ring-0 sm:text-3xl dark:focus-visible:border-zinc-700"
            />

            <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Permalink:{" "}
                {viewPostUrl ? (
                  <Link
                    href={viewPostUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {permalinkPreview}
                  </Link>
                ) : (
                  <span className="font-mono text-blue-600 dark:text-blue-400">{permalinkPreview}</span>
                )}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-blue-600 hover:underline dark:text-blue-400">
                  Edit permalink
                </summary>
                <div className="mt-2 space-y-2">
                  <Input
                    value={slug}
                    onChange={(e) => onSlugChange(e.target.value)}
                    className="h-9 font-mono text-sm"
                    placeholder="url-slug"
                    aria-label="Slug"
                  />
                  {mode === "create" ? (
                    <label className="flex items-center gap-2 text-xs text-zinc-500">
                      <input
                        type="checkbox"
                        checked={slugAuto}
                        onChange={(e) => onSlugAutoChange(e.target.checked)}
                      />
                      Auto-generate from title
                    </label>
                  ) : null}
                </div>
              </details>
            </div>

            <div className="wp-post-content-area">{body}</div>
          </div>

          {createExtras ? <div className="mt-4">{createExtras}</div> : null}
        </main>

        <aside className="hidden w-full shrink-0 space-y-3 lg:block lg:w-[280px]">{sidebar}</aside>
      </div>
    </div>
  );
}

export function WpLabeledField({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function WpTextareaField({
  label,
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <WpLabeledField label={label} htmlFor={id} hint={hint}>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="text-sm"
      />
    </WpLabeledField>
  );
}
