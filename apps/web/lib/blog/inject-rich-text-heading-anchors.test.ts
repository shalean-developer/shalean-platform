import { describe, expect, it } from "vitest";
import { injectRichTextHeadingAnchors } from "./inject-rich-text-heading-anchors";

describe("injectRichTextHeadingAnchors", () => {
  it("assigns deterministic ids and returns matching TOC entries", () => {
    const html = `<p>x</p><h2>First topic</h2><p>a</p><h3>Nested</h3>`;
    const { html: out, entries } = injectRichTextHeadingAnchors(html, "my-block");
    expect(entries).toEqual([
      { id: "blog-rich-my-block-0", label: "First topic", level: 2 },
      { id: "blog-rich-my-block-1", label: "Nested", level: 3 },
    ]);
    expect(out).toContain('id="blog-rich-my-block-0"');
    expect(out).toContain('id="blog-rich-my-block-1"');
  });

  it("preserves existing id and still lists in TOC", () => {
    const html = `<h2 id="keep-me">Title</h2>`;
    const { entries } = injectRichTextHeadingAnchors(html, "scope");
    expect(entries).toEqual([{ id: "keep-me", label: "Title", level: 2 }]);
  });

  it("inserts a space before id when the heading has no other attributes", () => {
    const html = `<h2>Quick answer</h2>`;
    const { html: out } = injectRichTextHeadingAnchors(html, "scope");
    expect(out).toBe('<h2 id="blog-rich-scope-0">Quick answer</h2>');
    expect(out).not.toContain("<h2id=");
  });

  it("assigns ids to h4 without adding TOC entries", () => {
    const html = `<h4>Detail</h4>`;
    const { html: out, entries } = injectRichTextHeadingAnchors(html, "scope");
    expect(out).toBe('<h4 id="blog-rich-scope-0">Detail</h4>');
    expect(entries).toEqual([]);
  });
});
