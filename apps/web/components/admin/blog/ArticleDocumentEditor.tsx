"use client";

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Extension, Node, type Editor } from "@tiptap/core";
import { DOMParser, DOMSerializer, type Node as ProseNode } from "@tiptap/pm/model";
import { closeHistory } from "@tiptap/pm/history";
import { EditorContent, NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor, type NodeViewProps } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Bold, Italic, List, ListOrdered, Undo2, Redo2, Link2, ImageIcon, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { BlogContentBlock } from "@/lib/blog/content-json";
import { sanitizeBlogRichHtml } from "@/lib/blog/sanitize-blog-html";
import { legacyParagraphToRichHtml } from "@/lib/blog/legacy-paragraph-to-rich-html";
import { isAllowedAuthoringBlogImageSrc } from "@/lib/blog/blog-image-validation";
import { BlogContentRenderer } from "@/components/blog/BlogContentRenderer";
import { Button } from "@/components/ui/button";
import { prompt } from "@/components/ui/notifications";
import { useBlogMediaUpload } from "./useBlogMediaUpload";
import "./rich-text-editor.css";
import "@/components/blog/blog-article-typography.css";

type AddType = "rich_text" | "image" | "faq" | "internal_links" | "comparison_table" | "section";
type Props = {
  blocks: BlogContentBlock[];
  onBlocksChange: (blocks: BlogContentBlock[]) => void;
  renderBlock: (block: BlogContentBlock, index: number, change: (block: BlogContentBlock) => void) => ReactNode;
  newBlock: (type: AddType) => BlogContentBlock;
  uploadSlug?: string;
  disabled?: boolean;
  wordCount?: number;
};
const names: Record<string, string> = { rich_text: "Article text", section: "Section", image: "Image", faq: "Questions and answers", internal_links: "Related links", comparison_table: "Comparison table" };
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function proseHtml(block: BlogContentBlock): string | null {
  if (block.type === "rich_text") return /<(?:table|footer)\b/i.test(block.html) ? null : sanitizeBlogRichHtml(block.html);
  if (block.type === "section") return `<h${block.heading_level ?? 2}>${escape(block.title)}</h${block.heading_level ?? 2}>${legacyParagraphToRichHtml(block.content)}`;
  if (block.type === "heading") return `<h${Math.max(2, block.level)}>${escape(block.content)}</h${Math.max(2, block.level)}>`;
  if (block.type === "paragraph" || block.type === "intro" || block.type === "quick_answer") return legacyParagraphToRichHtml(block.content);
  return null;
}
export function blogDocumentHtml(blocks: BlogContentBlock[]): string {
  return blocks.map((block, index) => {
    const html = proseHtml(block);
    return html === null ? `<div data-blog-atomic="${index}"></div>` : `<div data-blog-text="${index}">${html || "<p></p>"}</div>`;
  }).join("");
}
function fragmentHtml(node: ProseNode, editor: Editor): string {
  const element = document.createElement("div");
  element.append(DOMSerializer.fromSchema(editor.schema).serializeFragment(node.content));
  return element.innerHTML;
}
function moveNode(props: NodeViewProps, direction: -1 | 1) {
  const position = props.getPos();
  if (typeof position !== "number") return;
  const siblings: { node: ProseNode; pos: number }[] = [];
  props.editor.state.doc.forEach((node, pos) => siblings.push({ node, pos }));
  const index = siblings.findIndex(item => item.pos === position);
  const target = siblings[index + direction];
  if (!target) return;
  const transaction = closeHistory(props.editor.state.tr).delete(position, position + props.node.nodeSize);
  transaction.insert(direction < 0 ? target.pos : position + target.node.nodeSize, props.node);
  props.editor.view.dispatch(transaction);
}
function BlockActions(props: NodeViewProps) {
  const block = props.node.attrs.original as BlogContentBlock;
  return <div contentEditable={false} className="blog-node-controls mb-1 flex justify-end gap-1 text-xs" aria-label={`${names[block.type] ?? block.type} controls`}>
    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Move ${names[block.type] ?? block.type} up`} onClick={() => moveNode(props, -1)}><ArrowUp className="size-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Move ${names[block.type] ?? block.type} down`} onClick={() => moveNode(props, 1)}><ArrowDown className="size-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={`Remove ${names[block.type] ?? block.type}`} onClick={() => { const pos = props.getPos(); if (typeof pos === "number") props.editor.view.dispatch(closeHistory(props.editor.state.tr).delete(pos, pos + props.node.nodeSize)); }}><Trash2 className="size-3.5" /></Button>
  </div>;
}
function TextBlockView(props: NodeViewProps) {
  return <NodeViewWrapper className="blog-text-node relative"><BlockActions {...props} /><NodeViewContent /></NodeViewWrapper>;
}
function StructuredBlockView(props: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const block = props.node.attrs.original as BlogContentBlock;
  const render = props.extension.options.renderBlock as Props["renderBlock"];
  return <NodeViewWrapper contentEditable={false} className="my-6 border-y border-zinc-100 py-4">
    <BlockActions {...props} />
    <div className="mb-3 flex items-center justify-between gap-2"><span className="text-xs font-medium text-zinc-500">{names[block.type] ?? block.type.replaceAll("_", " ")}</span><Button type="button" size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? "Done editing" : `Edit ${names[block.type] ?? "section"}`}</Button></div>
    {editing ? render(block, 0, next => props.updateAttributes({ original: next })) : <BlogContentRenderer content={{ schema_version: 1, blocks: [block] }} />}
  </NodeViewWrapper>;
}

export function blogDocumentNodes(source: ((index: number) => BlogContentBlock) | MutableRefObject<BlogContentBlock[]>, fieldRenderer: Props["renderBlock"] | MutableRefObject<Props["renderBlock"]>) {
  const getOriginal = (index: number) => typeof source === "function" ? source(index) : source.current[index];
  const renderBlock: Props["renderBlock"] = (block, index, change) => typeof fieldRenderer === "function" ? fieldRenderer(block, index, change) : fieldRenderer.current(block, index, change);
  return [
      Node.create({ name: "blogText", group: "block", content: "block+", defining: true,
        addAttributes: () => ({ original: { default: null, rendered: false } }),
        parseHTML: () => [{ tag: "div[data-blog-text]", getAttrs: element => { const index = element.getAttribute("data-blog-text") ?? ""; const original = /^\d+$/.test(index) ? getOriginal(Number(index)) : undefined; return original ? { original } : false; } }],
        renderHTML: () => ["div", { "data-blog-text": "" }, 0],
        addNodeView: () => ReactNodeViewRenderer(TextBlockView),
      }),
      Node.create({ name: "blogAtomic", group: "block", atom: true,
        addOptions: () => ({ renderBlock: (block: BlogContentBlock, index: number, update: (block: BlogContentBlock) => void) => renderBlock(block, index, update) }),
        addAttributes: () => ({ original: { default: null, rendered: false } }),
        parseHTML: () => [{ tag: "div[data-blog-atomic]", getAttrs: element => { const index = element.getAttribute("data-blog-atomic") ?? ""; const original = /^\d+$/.test(index) ? getOriginal(Number(index)) : undefined; return original ? { original } : false; } }],
        renderHTML: () => ["div", { "data-blog-atomic": "" }],
        addNodeView: () => ReactNodeViewRenderer(StructuredBlockView),
      }),
  ];
}

export function blogDocumentBaseline(editor: Editor): Map<string, string> {
  const baseline = new Map<string, string>();
  editor.state.doc.forEach(node => { if (node.type.name === "blogText") baseline.set(node.attrs.original?.id ?? JSON.stringify(node.attrs.original), fragmentHtml(node, editor)); });
  return baseline;
}

export function serializeBlogDocument(current: Editor, baseline: ReadonlyMap<string, string>, bareIds = new Map<number, string>()): BlogContentBlock[] {
  const next: BlogContentBlock[] = [];
  current.state.doc.forEach((node, _offset, index) => {
    const original = node.attrs.original as BlogContentBlock | undefined;
    if (node.type.name === "blogAtomic" && original) { next.push(original); return; }
    if (node.type.name === "blogText" && original) {
      const html = fragmentHtml(node, current);
      let originalHtml = baseline.get(original.id ?? JSON.stringify(original));
      if (originalHtml === undefined) {
        const element = document.createElement("div"); element.innerHTML = proseHtml(original) || "<p></p>";
        const parsed = DOMParser.fromSchema(current.schema).parse(element);
        originalHtml = fragmentHtml(parsed, current);
      }
      if (html === originalHtml) next.push(original);
      else next.push({ ...(original.type === "rich_text" ? original : { id: original.id }), type: "rich_text", html });
      return;
    }
    const element = document.createElement("div"); element.append(DOMSerializer.fromSchema(current.schema).serializeNode(node));
    if (!bareIds.has(index)) bareIds.set(index, crypto.randomUUID());
    next.push({ id: bareIds.get(index), type: "rich_text", html: element.innerHTML });
  });
  return next;
}

/** One editable document. Source objects are retained for every untouched block. */
export function ArticleDocumentEditor({ blocks, onBlocksChange, renderBlock, newBlock, uploadSlug, disabled = false, wordCount = 0 }: Props) {
  const [blank] = useState(() => newBlock("rich_text"));
  const [seed] = useState(() => blocks.length ? blocks : [blank]);
  const initial = useRef(seed);
  const [initialHtml] = useState(() => blogDocumentHtml(seed));
  const change = useRef(onBlocksChange);
  const fields = useRef(renderBlock);
  const emitted = useRef(JSON.stringify(blocks));
  const baseline = useRef(new Map<string, string>());
  const bareIds = useRef(new Map<number, string>());
  const input = useRef<HTMLInputElement>(null);
  const [addType, setAddType] = useState<AddType>("rich_text");
  const { uploadFile, uploading, error } = useBlogMediaUpload();
  const [imageError, setImageError] = useState("");
  useEffect(() => { change.current = onBlocksChange; fields.current = renderBlock; }, [onBlocksChange, renderBlock]);
  const [documentNodes] = useState(() => blogDocumentNodes(initial, fields));
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      ...documentNodes,
      Extension.create({ name: "blogAnchors", addGlobalAttributes() { return [{ types: ["heading", "paragraph", "blockquote"], attributes: { id: { default: null, parseHTML: element => element.getAttribute("id"), renderHTML: attrs => attrs.id ? { id: attrs.id } : {} } } }]; } }),
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, trailingNode: false, link: false, code: false, codeBlock: false }),
      Link.configure({ openOnClick: false }), Image.configure({ allowBase64: false }),
    ],
    content: initialHtml,
    editable: !disabled,
    editorProps: { attributes: { role: "textbox", "aria-label": "Article rich text", "aria-multiline": "true", class: "blog-article-typography min-h-[360px] py-4 focus:outline-none" } },
    onCreate: ({ editor: created }) => {
      baseline.current = blogDocumentBaseline(created);
    },
    onUpdate: ({ editor: current }) => {
      const next = serializeBlogDocument(current, baseline.current, bareIds.current);
      emitted.current = JSON.stringify(next);
      change.current(next);
    },
  }, []);
  useEffect(() => {
    if (!editor || editor.isDestroyed || JSON.stringify(blocks) === emitted.current) return;
    initial.current = blocks.length ? blocks : [blank];
    editor.commands.setContent(blogDocumentHtml(initial.current), { emitUpdate: false });
    baseline.current = blogDocumentBaseline(editor);
    emitted.current = JSON.stringify(blocks);
  }, [blocks, blank, editor]);
  useEffect(() => { if (editor && editor.isEditable !== !disabled) editor.setEditable(!disabled, false); }, [disabled, editor]);
  const openUpload = () => input.current?.click();
  function addSection() {
    if (!editor) return;
    const block = newBlock(addType);
    const index = initial.current.length;
    initial.current = [...initial.current, block];
    const html = blogDocumentHtml([block]).replace(/data-blog-(text|atomic)="0"/, `data-blog-$1="${index}"`);
    editor.chain().focus().insertContentAt(editor.state.doc.content.size, html).run();
  }
  async function uploadImage(file: File) {
    const result = await uploadFile(file, { folder: uploadSlug ? `inline/${uploadSlug.slice(0, 48)}` : "inline" });
    if (!result || !editor) return;
    const alt = await prompt({ title: "Image alt text", defaultValue: file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") });
    if (alt !== null) editor.chain().focus().setImage({ src: result.url, alt }).run();
  }
  async function setLink() {
    if (!editor) return;
    const href = await prompt({ title: "Link URL", defaultValue: editor.getAttributes("link").href || "https://" });
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }
  async function insertImage() {
    const src = await prompt({ title: "Image URL", defaultValue: "https://" });
    if (!src || !editor) return;
    if (!isAllowedAuthoringBlogImageSrc(src)) { setImageError("Upload this image or choose a supported image URL."); return; }
    const alt = await prompt({ title: "Image alt text", defaultValue: "" });
    if (alt !== null) { editor.chain().focus().setImage({ src, alt }).run(); setImageError(""); }
  }
  if (!editor) return <p className="p-4 text-sm text-zinc-500">Opening writing canvas…</p>;
  const button = (label: string, icon: ReactNode, action: () => void, pressed = false) => <Button key={label} type="button" size="sm" variant={pressed ? "secondary" : "ghost"} aria-label={label} title={label} aria-pressed={pressed} onMouseDown={event => event.preventDefault()} onClick={action} className="h-9 w-9 p-0">{icon}</Button>;
  return <section aria-label="Article body" className="rich-text-editor-root mx-auto max-w-[720px] px-4 sm:px-0">
    <div role="toolbar" aria-label="Rich text" className="sticky top-[var(--blog-editor-toolbar-top,116px)] z-20 flex flex-wrap items-center gap-1 rounded-lg border-y bg-white/95 py-2 backdrop-blur-sm dark:bg-zinc-950/95">
      <select aria-label="Paragraph style" value={editor.isActive("heading", { level: 2 }) ? "2" : editor.isActive("heading", { level: 3 }) ? "3" : editor.isActive("heading", { level: 4 }) ? "4" : "paragraph"} className="h-9 rounded border bg-transparent px-2 text-sm" onChange={event => { const level = Number(event.target.value); if (level === 2 || level === 3 || level === 4) editor.chain().focus().setHeading({ level }).run(); else editor.chain().focus().setParagraph().run(); }}><option value="paragraph">Paragraph</option><option value="2">Heading 2</option><option value="3">Heading 3</option><option value="4">Heading 4</option></select>
      {button("Undo", <Undo2 className="size-4" />, () => { editor.chain().focus().undo().run(); })}
      {button("Redo", <Redo2 className="size-4" />, () => { editor.chain().focus().redo().run(); })}
      {button("Bold", <Bold className="size-4" />, () => { editor.chain().focus().toggleBold().run(); }, editor.isActive("bold"))}
      {button("Italic", <Italic className="size-4" />, () => { editor.chain().focus().toggleItalic().run(); }, editor.isActive("italic"))}
      {button("Bullet list", <List className="size-4" />, () => { editor.chain().focus().toggleBulletList().run(); }, editor.isActive("bulletList"))}
      {button("Numbered list", <ListOrdered className="size-4" />, () => { editor.chain().focus().toggleOrderedList().run(); }, editor.isActive("orderedList"))}
      {button("Link", <Link2 className="size-4" />, () => { void setLink(); }, editor.isActive("link"))}
      <Button type="button" size="sm" variant="ghost" title="Upload image from computer" aria-label="Upload image from computer" onClick={openUpload} className="h-9 w-9 p-0"><ImageIcon className="size-4" /></Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => void insertImage()}>Image URL</Button>
    </div>
    <input ref={input} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif" aria-label="Inline image file" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = ""; }} />
    {error || imageError || uploading ? <p role="status" className="py-2 text-sm text-zinc-600">{uploading ? "Uploading image…" : error || imageError}</p> : null}
    <EditorContent editor={editor} />
    <div className="mt-4 flex flex-wrap gap-2 border-t pt-4"><select aria-label="New block type" className="rounded border bg-transparent px-2 text-sm" value={addType} onChange={event => setAddType(event.target.value as AddType)}>{(["rich_text", "image", "faq", "internal_links", "comparison_table", "section"] as const).map(type => <option key={type} value={type}>{names[type]}</option>)}</select><Button type="button" size="sm" variant="outline" onClick={addSection}>Add section</Button><span className="ml-auto self-center text-xs text-zinc-500" aria-label="Word count">{wordCount.toLocaleString()} words</span></div>
  </section>;
}
