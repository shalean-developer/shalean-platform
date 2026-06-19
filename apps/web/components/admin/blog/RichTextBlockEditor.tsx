"use client";

import { useEffect, type ReactNode } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Italic,
  Link2,
  List,
  ListOrdered,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./rich-text-editor.css";

type Props = {
  html: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  variant?: "default" | "document" | "wordpress";
};

export function RichTextBlockEditor({ html, onChange, disabled, variant = "default" }: Props) {
  const isWordPress = variant === "wordpress";
  const isDocument = variant === "document" || isWordPress;

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          blockquote: false,
          code: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class:
              "font-medium text-blue-600 underline underline-offset-4 hover:text-blue-700",
          },
        }),
      ],
      content: html?.trim() ? html : "<p></p>",
      editable: !disabled,
      editorProps: {
        attributes: {
          class:
            isWordPress
              ? "px-4 py-4 text-[1.0625rem] leading-[1.75] text-zinc-800 focus:outline-none min-h-[520px] dark:text-zinc-100"
              : variant === "document"
              ? "px-5 py-5 text-[1.0625rem] leading-[1.75] text-zinc-800 focus:outline-none min-h-[480px] dark:text-zinc-100"
              : "px-4 py-4 text-[1.0625rem] leading-[1.7] text-zinc-800 focus:outline-none min-h-[220px] dark:text-zinc-100",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getHTML());
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
    editor.setEditable(!disabled);
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

  const setLink = () => {
    const prevUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prevUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div
      className={cn(
        "rich-text-editor-root overflow-hidden",
        isWordPress
          ? "border-0 bg-white dark:bg-zinc-950"
          : "rounded-xl border border-zinc-200/90 bg-zinc-50/30 dark:border-zinc-700 dark:bg-zinc-950/80",
        isDocument && "variant-document",
        isWordPress && "variant-wordpress",
      )}
    >
      <div
        className={cn(
          "sticky top-[52px] z-10 flex flex-wrap items-center gap-0.5 border-b border-zinc-200 bg-zinc-50/95 px-1 py-1 backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95",
          isWordPress && "top-0",
        )}
        role="toolbar"
        aria-label="Rich text"
      >
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
        {mark(
          "Heading 1",
          <Heading1 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
          editor.isActive("heading", { level: 1 }),
        )}
        {mark(
          "Heading 2",
          <Heading2 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          editor.isActive("heading", { level: 2 }),
        )}
        {mark(
          "Heading 3",
          <Heading3 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
          editor.isActive("heading", { level: 3 }),
        )}
        {mark(
          "Heading 4",
          <Heading4 className="h-4 w-4" />,
          () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
          editor.isActive("heading", { level: 4 }),
        )}
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
        <Button
          type="button"
          variant={editor.isActive("link") ? "secondary" : "ghost"}
          size="sm"
          className="h-8 px-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={setLink}
          aria-label="Link"
          aria-pressed={editor.isActive("link")}
        >
          <Link2 className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} className={cn(disabled && "pointer-events-none opacity-60")} />
    </div>
  );
}
