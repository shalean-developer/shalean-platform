// @vitest-environment jsdom
import React from "react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blogDocumentHtml, blogDocumentNodes, blogDocumentBaseline, serializeBlogDocument } from "@/components/admin/blog/ArticleDocumentEditor";
import type { BlogContentBlock } from "./content-json";
import { blogContentJsonSchema } from "./content-json-schema";
vi.stubGlobal("React", React);
const blocks: BlogContentBlock[] = [
  { id: "intro", type: "rich_text", html: '<p>First paragraph with <strong>authored formatting</strong>.</p>' },
  { id: "photo", type: "image", url: "/images/one.jpg", alt: "Original photograph", caption: "Original caption" },
  { id: "section", type: "section", title: "Keep this section", heading_level: 3, content: "Original section text." },
  { id: "table", type: "rich_text", html: '<table id="prices"><tbody><tr><td>Original cell</td></tr></tbody></table>' },
  { id: "faq", type: "faq", omit_section_heading: true, items: [{ question: "Original question?", answer: "Original answer." }] },
];
let editor: Editor | undefined;
afterEach(() => { editor?.destroy(); editor = undefined; });
function setup(source = blocks) {
  editor = new Editor({ extensions: [...blogDocumentNodes(index => source[index], () => null), StarterKit.configure({ trailingNode: false }), Image], content: blogDocumentHtml(source) });
  return { editor, baseline: blogDocumentBaseline(editor) };
}
describe("continuous blog document preserves stored blocks", () => {
  it("round trips untouched mixed content byte for byte, without flattening tables, images or FAQ metadata", () => {
    const { editor, baseline } = setup();
    expect(serializeBlogDocument(editor, baseline)).toEqual(blocks);
    expect(editor.state.doc.childCount).toBe(5);
  });
  it("preserves distinct source blocks even when their stored IDs are duplicated", () => {
    const source: BlogContentBlock[] = [
      { id: "duplicate", type: "section", title: "First legacy section", content: "First source text.", heading_level: 2 },
      { id: "duplicate", type: "section", title: "Second legacy section", content: "Second source text.", heading_level: 3 },
      { id: "edit-me", type: "rich_text", html: "<p>Edit this paragraph.</p>" },
    ];
    const { editor, baseline } = setup(source);
    expect(serializeBlogDocument(editor, baseline)).toEqual(source);
    const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 2;
    editor.commands.insertContentAt(position, "Changed ");
    expect(serializeBlogDocument(editor, baseline).slice(0, 2)).toEqual(source.slice(0, 2));
  });
  it("changes only the prose block being typed in", () => {
    const { editor, baseline } = setup();
    editor.commands.insertContentAt(3, "New text ");
    const next = serializeBlogDocument(editor, baseline);
    expect(next[0]).toMatchObject({ id: "intro", type: "rich_text" });
    expect(next[0].type === "rich_text" && next[0].html).toContain("New text");
    expect(next.slice(1)).toEqual(blocks.slice(1));
  });
  it("keeps a structured section as its original type when its content is unchanged", () => {
    const { editor, baseline } = setup();
    editor.commands.insertContentAt(3, "Edited ");
    expect(serializeBlogDocument(editor, baseline)[2]).toEqual(blocks[2]);
  });
  it("edits a legacy section into schema-valid rich text with its heading and stable ID intact", () => {
    const { editor, baseline } = setup();
    const position = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize + 2;
    editor.commands.insertContentAt(position, "Updated ");
    const next = serializeBlogDocument(editor, baseline);
    expect(next[2]).toMatchObject({ id: "section", type: "rich_text" });
    expect(next[2].type === "rich_text" && next[2].html).toContain("<h3>Updated");
    expect(blogContentJsonSchema.safeParse({ schema_version: 1, blocks: next }).success).toBe(true);
    expect(next[0]).toEqual(blocks[0]);
    expect(next.slice(3)).toEqual(blocks.slice(3));
  });
  it("supports moving and undoing a structured image without dropping its caption", () => {
    const { editor, baseline } = setup();
    const pos = editor.state.doc.child(0).nodeSize;
    const image = editor.state.doc.child(1);
    editor.view.dispatch(editor.state.tr.delete(pos, pos + image.nodeSize).insert(0, image));
    expect(serializeBlogDocument(editor, baseline).map(block => block.id)).toEqual(["photo", "intro", "section", "table", "faq"]);
    editor.commands.undo();
    expect(serializeBlogDocument(editor, baseline)).toEqual(blocks);
  });
  it("updates and undoes FAQ edits as part of the same document history", () => {
    const { editor, baseline } = setup();
    let pos = 0; for (let i = 0; i < 4; i++) pos += editor.state.doc.child(i).nodeSize;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { original: { ...blocks[4], items: [{ question: "New question?", answer: "New answer." }] } }));
    expect(serializeBlogDocument(editor, baseline)[4]).toMatchObject({ id: "faq", omit_section_heading: true, items: [{ question: "New question?", answer: "New answer." }] });
    editor.commands.undo();
    expect(serializeBlogDocument(editor, baseline)).toEqual(blocks);
  });
  it("restores exact original HTML when typing is undone", () => {
    const { editor, baseline } = setup();
    editor.commands.insertContentAt(3, "Temporary text ");
    editor.commands.undo();
    expect(serializeBlogDocument(editor, baseline)).toEqual(blocks);
  });
  it("does not accept pasted source wrappers with unknown block IDs", () => {
    const { editor, baseline } = setup();
    editor.commands.insertContentAt(editor.state.doc.content.size, '<div data-blog-text="999"><p>Pasted text</p></div>');
    const next = serializeBlogDocument(editor, baseline);
    expect(next.slice(0, 5)).toEqual(blocks);
    expect(next[5]).toMatchObject({ type: "rich_text" });
    expect(next[5].type === "rich_text" && next[5].html).toContain("Pasted text");
  });
});
