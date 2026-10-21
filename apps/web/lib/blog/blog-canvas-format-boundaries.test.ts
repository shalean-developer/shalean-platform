// @vitest-environment jsdom
import React from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlogAnchors, BlogDocumentBoundaries, blogDocumentNodes, blogDocumentHtml, blogDocumentBaseline, serializeBlogDocument, formatBlogSelection, blogFormattingTargets, insertBlogBlock } from "@/components/admin/blog/ArticleDocumentEditor";
import type { BlogContentBlock } from "./content-json";
import { blogContentJsonSchema } from "./content-json-schema";
vi.stubGlobal("React", React);
const mixed: BlogContentBlock[] = [
  { id: "text", type: "rich_text", html: "<p>Article text with meaning.</p>" },
  { id: "image", type: "image", url: "/images/one.jpg", alt: "Keep image", caption: "Keep caption" },
  { id: "faq", type: "faq", omit_section_heading: true, items: [{ question: "Keep question?", answer: "Keep answer." }] },
  { id: "tail", type: "rich_text", html: "<p>Final article paragraph.</p>" },
];
let editor: Editor | undefined;
afterEach(() => { editor?.destroy(); editor = undefined; });
function setup(blocks = mixed) {
  editor = new Editor({ extensions: [BlogAnchors, BlogDocumentBoundaries, ...blogDocumentNodes(index => blocks[index], () => null), StarterKit.configure({ trailingNode: false, heading: { levels: [2, 3, 4] } }), Image], content: blogDocumentHtml(blocks) });
  return { editor, baseline: blogDocumentBaseline(editor) };
}
describe("formatting preserves structured blog content", () => {
  it.each(["bulletList", "orderedList", "blockquote", "paragraph", 2, 3, 4] as const)("applies %s to prose across a mixed document without flattening its structured sections", format => {
    const { editor, baseline } = setup(); editor.commands.selectAll();
    expect(blogFormattingTargets(editor)).toHaveLength(2);
    expect(formatBlogSelection(editor, format)).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved.map(block => block.id)).toEqual(mixed.map(block => block.id));
    expect(saved.slice(1, 3)).toEqual(mixed.slice(1, 3));
    const tag = typeof format === "number" ? `h${format}` : format === "bulletList" ? "ul" : format === "orderedList" ? "ol" : format === "blockquote" ? "blockquote" : "p";
    expect(saved[0].type === "rich_text" && saved[0].html).toContain(`<${tag}>`);
    expect(saved[3].type === "rich_text" && saved[3].html).toContain(`<${tag}>`);
    expect(blogContentJsonSchema.safeParse({ schema_version: 1, blocks: saved }).success).toBe(true);
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it.each(["Mod-Shift-8", "Mod-Shift-7", "Mod-Shift-b", "Mod-Alt-2", "Mod-Alt-3", "Mod-Alt-4", "Mod-Alt-0"])("guards keyboard formatting %s as well as toolbar controls", shortcut => {
    const { editor, baseline } = setup(); editor.commands.selectAll();
    editor.commands.keyboardShortcut(shortcut);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved.map(block => block.id)).toEqual(mixed.map(block => block.id));
    expect(saved.slice(1, 3)).toEqual(mixed.slice(1, 3));
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("rejects a nested-source transaction even when a generic list command bypasses the toolbar", () => {
    const { editor, baseline } = setup(); editor.commands.selectAll();
    editor.commands.toggleBulletList();
    expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("formats selected prose while retaining the image and FAQ", () => {
    const { editor, baseline } = setup(); editor.commands.setTextSelection({ from: 2, to: 9 });
    expect(formatBlogSelection(editor, "bulletList")).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved[0]).toMatchObject({ id: "text", type: "rich_text" });
    expect(saved[0].type === "rich_text" && saved[0].html).toContain("<ul>");
    expect(saved.slice(1)).toEqual(mixed.slice(1));
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("lets Select All format an ordinary single prose section without losing its stable ID", () => {
    const { editor, baseline } = setup([mixed[0]]); editor.commands.selectAll();
    expect(formatBlogSelection(editor, "orderedList")).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved).toHaveLength(1); expect(saved[0]).toMatchObject({ id: "text", type: "rich_text" });
    expect(saved[0].type === "rich_text" && saved[0].html).toContain("<ol>");
  });
  it("keeps node-selected images out of text-formatting commands", () => {
    const { editor, baseline } = setup(); editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize);
    expect(blogFormattingTargets(editor)).toEqual([]);
    expect(formatBlogSelection(editor, 2)).toBe(false);
    expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });
  it("formats paragraphs on both sides of an inline image and undoes the whole operation once", () => {
    const source: BlogContentBlock[] = [{ id: "body", type: "rich_text", html: '<p>Before photo.</p><img src="/images/one.jpg" alt="Keep inline image"><p>After photo.</p>' }, mixed[2]];
    const { editor, baseline } = setup(source); editor.commands.selectAll();
    expect(formatBlogSelection(editor, "bulletList")).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved[0].type === "rich_text" && saved[0].html).toContain('src="/images/one.jpg"');
    expect(saved[0].type === "rich_text" && saved[0].html).toContain('alt="Keep inline image"');
    expect(saved[1]).toEqual(source[1]);
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(source);
  });
  it("inserts after the active paragraph, retains following prose and restores exact source with Undo", () => {
    const source: BlogContentBlock[] = [{ id: "body", type: "rich_text", html: "<p>First paragraph.</p><p>Second paragraph.</p>" }, mixed[1], mixed[2]];
    const added: BlogContentBlock = { id: "new-faq", type: "faq", items: [{ question: "New question?", answer: "New answer." }] };
    const { editor, baseline } = setup(source); editor.commands.setTextSelection(4);
    insertBlogBlock(editor, added);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved).toHaveLength(5);
    expect(saved[0]).toEqual({ id: "body", type: "rich_text", html: "<p>First paragraph.</p>" });
    expect(saved[1]).toEqual(added);
    expect(saved[2]).toMatchObject({ type: "rich_text", html: "<p>Second paragraph.</p>" });
    expect(saved[2].id).not.toBe("body");
    expect(saved.slice(3)).toEqual(source.slice(1));
    expect(blogContentJsonSchema.safeParse({ schema_version: 1, blocks: saved }).success).toBe(true);
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(source);
    editor.commands.redo(); expect(serializeBlogDocument(editor, baseline)).toEqual(saved);
  });
  it("inserts beside a selected FAQ without replacing the selection or its metadata", () => {
    const { editor, baseline } = setup();
    editor.commands.setNodeSelection(editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize);
    const added: BlogContentBlock = { id: "new-image", type: "image", url: "/images/new.jpg", alt: "New image", caption: "Keep new caption" };
    insertBlogBlock(editor, added);
    expect(serializeBlogDocument(editor, baseline)).toEqual([...mixed.slice(0, 3), added, mixed[3]]);
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(mixed);
  });

  it("applies one consistent list style to mixed already-formatted and plain sections", () => {
    const source: BlogContentBlock[] = [{ id: "listed", type: "rich_text", html: "<ul><li><p>Already listed.</p></li></ul>" }, mixed[1], mixed[2], mixed[3]];
    const { editor, baseline } = setup(source); editor.commands.selectAll();
    expect(formatBlogSelection(editor, "bulletList")).toBe(true);
    const saved = serializeBlogDocument(editor, baseline);
    expect(saved[0]).toEqual(source[0]);
    expect(saved[3].type === "rich_text" && saved[3].html).toContain("<ul>");
    expect(saved.slice(1, 3)).toEqual(source.slice(1, 3));
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(source);
  });
  it("changes a heading to a paragraph without lifting its source wrapper or losing its anchor", () => {
    const source: BlogContentBlock[] = [{ id: "heading", type: "rich_text", html: '<h2 id="original-anchor">Keep this heading text.</h2>' }, mixed[2]];
    const { editor, baseline } = setup(source); editor.commands.selectAll();
    expect(formatBlogSelection(editor, "paragraph")).toBe(true);
    expect(serializeBlogDocument(editor, baseline)[0]).toMatchObject({ id: "heading", type: "rich_text" });
    expect(serializeBlogDocument(editor, baseline)[0]).toMatchObject({ html: '<p id="original-anchor">Keep this heading text.</p>' });
    expect(serializeBlogDocument(editor, baseline)[1]).toEqual(source[1]);
    editor.commands.undo(); expect(serializeBlogDocument(editor, baseline)).toEqual(source);
  });

});
