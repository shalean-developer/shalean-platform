"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Props = {
  mode: "create" | "edit";
  postsListPath: string;
  saving: boolean;
  saveState?: string;
  disabled?: boolean;
  status: "draft" | "published" | "scheduled";
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
  preview?: ReactNode;
  headlineNotice?: ReactNode;
  body: ReactNode;
  sidebar: ReactNode;
  createExtras?: ReactNode;
};

export function WordPressPostEditorLayout({
  mode,
  postsListPath,
  saving,
  saveState = "Unsaved",
  disabled = false,
  status,
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
  body,
  preview,
  headlineNotice,
  sidebar,
  createExtras,
}: Props) {
  const [actionHeight, setActionHeight] = useState(52);
  const actionRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"write" | "preview">("write");
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const element = actionRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setActionHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const settingsId = useId();
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (settingsOpen) closeButton.current?.focus(); }, [settingsOpen]);
  const closeSettings = () => { setSettingsOpen(false); settingsButton.current?.focus(); };
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (formError || fieldErrors.length) errorRef.current?.focus(); }, [formError, fieldErrors]);
  return (
    <div style={{ "--blog-editor-toolbar-top": `${64 + actionHeight}px` } as CSSProperties} className="w-full min-w-0 pb-28 md:pb-8">
      {(formError || fieldErrors.length > 0) && (
        <div ref={errorRef} role="alert" tabIndex={-1} className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
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

      <div ref={actionRef} className="sticky top-16 z-20 -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-1 py-2.5 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2" asChild>
            <Link href={postsListPath}>← Posts</Link>
          </Button>
          <h1 className="truncate text-base font-normal text-zinc-800 dark:text-zinc-100">
            {mode === "create" ? "Add New Post" : "Edit Post"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" aria-live="polite" className="mr-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{saveState}</span>
          {preview ? <div className="flex items-center gap-1" aria-label="Editor view">
            <Button type="button" size="sm" variant={view === "write" ? "secondary" : "ghost"} aria-pressed={view === "write"} onClick={() => setView("write")}>Write</Button>
            <Button type="button" size="sm" variant={view === "preview" ? "secondary" : "ghost"} aria-pressed={view === "preview"} onClick={() => setView("preview")}>Preview</Button>
          </div> : null}
          <Button ref={settingsButton} type="button" size="sm" variant="outline" aria-controls={settingsId} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>Settings</Button>
          <Button type="button" size="sm" onClick={onSave} disabled={saving || disabled}>
            {saving ? "Saving…" : status === "scheduled" ? "Schedule post" : status === "published" ? (mode === "create" ? "Publish post" : "Update published post") : "Save draft"}
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[800px]">
        <fieldset disabled={saving || disabled} className="min-w-0 border-0 p-0">
        <div hidden={view !== "write"} className="min-w-0">
          <div className="bg-white dark:bg-zinc-950">
            <label htmlFor="wp-post-title" className="sr-only">
              Title
            </label>
            <Input
              id="wp-post-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Add title"
              className="mx-auto block h-auto max-w-[720px] rounded-none border-0 bg-transparent px-4 py-4 text-3xl font-bold shadow-none placeholder:text-zinc-400 focus-visible:ring-0 sm:px-0 sm:text-4xl"
            />

            {headlineNotice}
            <div className="mx-auto max-w-[720px] px-4 py-2.5 sm:px-0">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Permalink:{" "}
                <span className="font-mono">{permalinkPreview}</span>
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

          {createExtras ? <div className="mx-4 mt-8 border-t pt-6">{createExtras}</div> : null}
        </div>

        </fieldset>
        {view === "preview" ? preview : null}
        <aside id={settingsId} hidden={!settingsOpen} aria-label="Post settings" onKeyDown={event => { if (event.key === "Escape") closeSettings(); }} className="fixed bottom-4 right-4 top-[var(--blog-editor-toolbar-top)] z-40 w-[min(360px,calc(100vw-2rem))] space-y-3 overflow-y-auto rounded-xl border bg-white p-4 shadow-xl dark:bg-zinc-950">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Post settings</h2><Button ref={closeButton} type="button" size="sm" variant="ghost" onClick={closeSettings}>Close settings</Button></div>
          <fieldset disabled={saving || disabled} className="min-w-0 space-y-3 border-0 p-0">{sidebar}</fieldset>
          {viewPostUrl ? <Link href={viewPostUrl} target="_blank" rel="noopener noreferrer" className="block pt-4 text-sm text-blue-700 underline">Open saved version in new tab</Link> : null}
        </aside>
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
