"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Settings2, Eye, Pencil, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import "./blog-editor-shell.css";

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
  notice?: ReactNode;
  body: ReactNode;
  sidebar: ReactNode;
  createExtras?: ReactNode;
};

export function WordPressPostEditorLayout({ mode, postsListPath, saving, saveState = "Unsaved", disabled = false, status, onSave, formError, fieldErrors, title, onTitleChange, slug, onSlugChange, slugAuto, onSlugAutoChange, permalinkPreview, viewPostUrl, body, preview, headlineNotice, notice, sidebar, createExtras }: Props) {
  const [actionHeight, setActionHeight] = useState(60);
  const shellRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"write" | "preview">("write");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDocked, setSettingsDocked] = useState(false);
  const settingsId = useId();
  const settingsHeadingId = useId();
  const permalinkId = useId();
  const settingsButton = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const closeSettings = () => { setSettingsOpen(false); settingsButton.current?.focus(); };
  function showPreview() { setSettingsOpen(false); setView("preview"); }
  useEffect(() => {
    const action = actionRef.current;
    const shell = shellRef.current;
    if (!action || !shell || typeof ResizeObserver === "undefined") return;
    const update = () => { setActionHeight(action.getBoundingClientRect().height); setSettingsDocked(shell.getBoundingClientRect().width >= 1120); };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(action); observer.observe(shell);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const resizeTitle = () => { const element = titleRef.current; if (element) { element.style.height = "auto"; element.style.height = `${element.scrollHeight}px`; } };
    resizeTitle();
    window.addEventListener("resize", resizeTitle);
    return () => window.removeEventListener("resize", resizeTitle);
  }, [title, settingsOpen, settingsDocked, view]);
  useEffect(() => { if (settingsOpen) closeButton.current?.focus(); }, [settingsOpen]);
  useEffect(() => { if (formError || fieldErrors.length) errorRef.current?.focus(); }, [formError, fieldErrors]);
  const modalOpen = settingsOpen && !settingsDocked;
  return <div ref={shellRef} style={{ "--blog-editor-toolbar-top": `${64 + actionHeight}px` } as CSSProperties} className="blog-editor-shell">
    <div ref={actionRef} className="blog-editor-topbar">
      <div className="blog-editor-topbar-start"><Link className="blog-editor-back" href={postsListPath}>← Posts</Link><h1>{mode === "create" ? "New post" : "Edit post"}</h1></div>
      <div className="blog-editor-topbar-actions">
        <span role="status" aria-live="polite" className="blog-editor-save-state">{saveState}</span>
        {preview ? <div className="blog-editor-view-switch" aria-label="Editor view">
          <button type="button" aria-pressed={view === "write"} onClick={() => setView("write")}><Pencil aria-hidden />Write</button>
          <button type="button" aria-pressed={view === "preview"} onClick={showPreview}><Eye aria-hidden />Preview</button>
        </div> : null}
        <button ref={settingsButton} type="button" className="blog-editor-settings-toggle" aria-controls={settingsId} aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Settings2 aria-hidden /><span>Settings</span></button>
        <button type="button" className="blog-editor-save" onClick={onSave} disabled={saving || disabled}>{saving ? "Saving…" : status === "scheduled" ? "Schedule post" : status === "published" ? (mode === "create" ? "Publish post" : "Update published post") : "Save draft"}</button>
      </div>
    </div>
    {(formError || fieldErrors.length > 0) ? <div ref={errorRef} role="alert" tabIndex={-1} className="blog-editor-error">{formError ? <p>{formError}</p> : null}{fieldErrors.length ? <ul>{fieldErrors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul> : null}</div> : null}
    <div className={`blog-editor-workspace${settingsOpen && settingsDocked ? " has-settings" : ""}`}>
      <div ref={bodyRef} className="blog-editor-paper" inert={modalOpen}>
        {notice ? <div className="blog-editor-notice-area">{notice}</div> : null}
        <fieldset disabled={saving || disabled} className="blog-editor-fieldset">
          <div hidden={view !== "write"}>
            <label htmlFor="wp-post-title" className="sr-only">Title</label>
            <textarea ref={titleRef} id="wp-post-title" rows={1} value={title} onChange={event => onTitleChange(event.target.value.replace(/[\r\n]+/g, " "))} placeholder="Add title" className="blog-editor-title" aria-describedby={permalinkId} onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); bodyRef.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(); } }} />
            {headlineNotice}
            <details className="blog-editor-permalink"><summary id={permalinkId}>{permalinkPreview} <span>Edit URL</span></summary><div><label className="sr-only" htmlFor={`${permalinkId}-slug`}>Slug</label><Input id={`${permalinkId}-slug`} value={slug} onChange={event => onSlugChange(event.target.value)} aria-label="Slug" />{mode === "create" ? <label><input type="checkbox" checked={slugAuto} onChange={event => onSlugAutoChange(event.target.checked)} /> Auto-generate from title</label> : null}</div></details>
            {body}
            {createExtras ? <div className="blog-editor-template-options">{createExtras}</div> : null}
          </div>
        </fieldset>
        {view === "preview" ? preview : null}
      </div>
      {modalOpen ? <button type="button" tabIndex={-1} className="blog-settings-backdrop" aria-label="Close post settings" onClick={closeSettings} /> : null}
      <aside ref={panelRef} id={settingsId} hidden={!settingsOpen} role={settingsDocked ? undefined : "dialog"} aria-modal={modalOpen ? true : undefined} aria-label="Post settings" aria-labelledby={settingsHeadingId} className={`blog-settings-panel${settingsDocked ? " is-docked" : " is-modal"}`} onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); closeSettings(); }
        if (event.key === "Tab" && modalOpen) {
          const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
          const first = items[0]; const last = items[items.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
        <div className="blog-settings-heading"><h2 id={settingsHeadingId}>Post settings</h2><button ref={closeButton} type="button" aria-label="Close settings" onClick={closeSettings}><X aria-hidden /></button></div>
        <fieldset disabled={saving || disabled} className="blog-editor-fieldset blog-settings-fields">{sidebar}</fieldset>
        {viewPostUrl ? <Link href={viewPostUrl} target="_blank" rel="noopener noreferrer" className="blog-editor-saved-link">Open saved version in new tab</Link> : null}
        {preview ? <button type="button" className="blog-settings-preview" onClick={showPreview}>Preview article</button> : null}
      </aside>
    </div>
  </div>;
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
