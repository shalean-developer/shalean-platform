"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Extension } from "@tiptap/core";
import { isAllowedAuthoringBlogImageSrc } from "@/lib/blog/blog-image-validation";
import {
  Bold,
  ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { prompt } from "@/components/ui/notifications";
import { useBlogMediaUpload } from "./useBlogMediaUpload";
import "./rich-text-editor.css";
import "@/components/blog/blog-article-typography.css";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";

type Props = {
  html: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  variant?: "default" | "document" | "wordpress";
  /** Optional slug — scopes in-article uploads under `inline/{slug}`. */
  uploadSlug?: string;
};

export function RichTextBlockEditor(props: Props) {
  const sourceId = useId();
  // TipTap's core schema cannot round-trip these supported authored HTML nodes.
  // Preserve them verbatim rather than silently flattening a table or attribution.
  if (/<(?:table|thead|tbody|tr|th|td|footer)\b/i.test(props.html)) {
    return <div className="space-y-3">
      <BlogContentRenderer content={{ schema_version: 1, blocks: [{ type: "rich_text", html: props.html }] }} />
      <details><summary className="cursor-pointer text-xs text-zinc-500">Edit preserved HTML formatting</summary>
      <label htmlFor={sourceId} className="text-sm font-medium">Formatted block source</label>
      <p className="text-xs text-zinc-500">This block includes a table or attribution. Source editing preserves that formatting.</p>
      <textarea id={sourceId} aria-label="Formatted block source" value={props.html} disabled={props.disabled}
        onChange={event => props.onChange(event.target.value)} rows={12} className="w-full rounded border p-3 font-mono text-sm" />
      </details>
    </div>;
  }
  return <VisualRichTextBlockEditor {...props} />;
}

function VisualRichTextBlockEditor({ html, onChange, disabled, variant = "default", uploadSlug }: Props) {
  const isWordPress = variant === "wordpress";
  const isDocument = variant === "document" || isWordPress;
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, uploading: imageUploading, error: uploadError } = useBlogMediaUpload();
  const [localUploadError, setLocalUploadError] = useState<string | null>(null);

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      extensions: [
        Extension.create({ name: "blogAnchors", addGlobalAttributes() { return [{ types: ["heading", "paragraph", "blockquote"], attributes: { id: { default: null, parseHTML: element => element.getAttribute("id"), renderHTML: attrs => attrs.id ? { id: attrs.id } : {} } } }]; } }),
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: false,
          blockquote: {},
          code: false,
          codeBlock: false,
          horizontalRule: {},
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: "font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700",
          },
        }),
        Image.configure({
          allowBase64: false,
          HTMLAttributes: {
            class: "blog-inline-image rounded-lg max-w-full h-auto my-6",
          },
        }),
      ],
      content: html?.trim() ? html : "<p></p>",
      editable: !disabled,
      editorProps: {
        attributes: {
          "data-placeholder": "Start writing your article…",
          role: "textbox", "aria-label": "Article rich text", "aria-multiline": "true",
          class: "blog-article-typography min-h-[360px] py-4 focus:outline-none",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChangeRef.current(ed.getHTML());
      },
    },
    [],
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const cur = editor.getHTML();
    const next = html?.trim() ? html : "<p></p>";
    if (cur !== next) {
      editor.commands.setContent(next, { emitUpdate: false });
    }
  }, [html, editor]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (editor.isEditable !== !disabled) editor.setEditable(!disabled, false);
  }, [disabled, editor]);

  if (!editor) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        Loading editor…
      </div>
    );
  }

  const mark = (label: string, icon: ReactNode, onPress: () => void, pressed: boolean) => (
    <Button
      type="button"
      variant={pressed ? "secondary" : "ghost"}
      size="sm"
      className="h-8 px-2"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPress()}
      aria-label={label}
      aria-pressed={pressed}
    >
      {icon}
    </Button>
  );

  const setLink = async () => {
    const prevUrl = editor.getAttributes("link").href as string | undefined;
    const url = await prompt({ title: "Link URL", defaultValue: prevUrl ?? "https://" });
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const insertImageUrl = async (src: string, alt?: string) => {
    if (!src.trim()) return;
    if (!isAllowedAuthoringBlogImageSrc(src)) { setLocalUploadError("Unsupported image URL. Upload this image instead."); return; }
    editor.chain().focus().setImage({ src: src.trim(), alt: alt?.trim() || "" }).run();
  };

  const onImageFile = async (file: File | null) => {
    if (!file || !editor) return;
    setLocalUploadError(null);
    const folder = uploadSlug?.trim() ? `inline/${uploadSlug.trim().slice(0, 48)}` : "inline";
    const result = await uploadFile(file, { folder });
    if (!result) {
      setLocalUploadError("Could not upload image.");
      return;
    }
    const altDefault = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    const alt =
      (await prompt({ title: "Image alt text (accessibility)", defaultValue: altDefault })) ?? altDefault;
    await insertImageUrl(result.url, alt);
  };

  const addImageFromUrl = async () => {
    const url = await prompt({ title: "Image URL", defaultValue: "https://" });
    if (url === null || !url.trim()) return;
    const alt = await prompt({ title: "Image alt text (accessibility)", defaultValue: "" });
    if (alt === null) return;
    await insertImageUrl(url, alt);
  };

  const toolbarError = localUploadError ?? uploadError;

  return (
    <div
      className={cn(
        "rich-text-editor-root overflow-visible",
        isWordPress
          ? "border-0 bg-white dark:bg-zinc-950"
          : "bg-white dark:bg-zinc-950",
        isDocument && "variant-document",
        isWordPress && "variant-wordpress",
      )}
    >
      <div
        className={cn(
          "sticky top-[var(--blog-editor-toolbar-top,116px)] z-10 flex flex-wrap items-center gap-0.5 border-b border-zinc-200 bg-zinc-50/95 rounded-lg px-1 py-1 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95",
          isWordPress && "top-0",
        )}
        role="toolbar"
        aria-label="Rich text"
      >
        {mark("Undo", <Undo2 className="h-4 w-4" />, () => editor.chain().focus().undo().run(), false)}
        {mark("Redo", <Redo2 className="h-4 w-4" />, () => editor.chain().focus().redo().run(), false)}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        {mark(
          "Bold",
          <Bold className="h-4 w-4" />,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold"),
        )}
        {mark(
          "Italic",
          <Italic className="h-4 w-4" />,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic"),
        )}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        <select aria-label="Paragraph style" className="h-8 max-w-[130px] rounded border border-zinc-200 bg-white px-2 text-sm text-zinc-800" value={editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : editor.isActive("heading", { level: 4 }) ? "4" : "paragraph"} onChange={event => { const level = Number(event.target.value); if (level === 2 || level === 3 || level === 4) editor.chain().focus().setHeading({ level }).run(); else editor.chain().focus().setParagraph().run(); }}>
          <option value="paragraph">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option>
        </select>
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        {mark(
          "Bullet list",
          <List className="h-4 w-4" />,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList"),
        )}
        {mark(
          "Numbered list",
          <ListOrdered className="h-4 w-4" />,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList"),
        )}
        {mark(
          "Blockquote",
          <Quote className="h-4 w-4" />,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote"),
        )}
        {mark(
          "Horizontal rule",
          <Minus className="h-4 w-4" />,
          () => editor.chain().focus().setHorizontalRule().run(),
          false,
        )}
        <span className="mx-0.5 h-6 w-px bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void setLink()}
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
        >
          <Link2 className="h-4 w-4" />
        </Button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            void onImageFile(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          disabled={imageUploading}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
          aria-label="Upload image from computer"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void addImageFromUrl()}
          aria-label="Insert image from URL"
        >
          Image URL
        </Button>
      </div>
      {toolbarError ? (
        <p className="border-b border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {toolbarError}
        </p>
      ) : null}
      <EditorContent editor={editor} className={cn(disabled && "pointer-events-none opacity-60")} />
    </div>
  );
}
