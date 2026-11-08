// @vitest-environment jsdom
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailDraftPreview } from "@/components/email/EmailDraftPreview";

describe("untrusted email draft previews", () => {
  it("confines markup to an opaque frame with scripts and remote content blocked", () => {
    const html = '<script>parent.location="https://example.com"</script><img src="https://example.com/pixel"><p>Draft</p>';
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(EmailDraftPreview, { html, text: "Fallback" })), "text/html");
    const frame = doc.querySelector("iframe")!;
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(doc.querySelector("script, img")).toBeNull();
    const preview = new DOMParser().parseFromString(frame.getAttribute("srcdoc")!, "text/html");
    const policy = preview.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute("content")!;
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("img-src data:");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(policy).not.toContain("unsafe-eval");
    expect(doc.querySelector("details")!.hasAttribute("open")).toBe(false);
    expect(doc.querySelector("pre")!.textContent).toBe(html);
  });

  it("escapes plain text instead of treating it as HTML when no HTML draft exists", () => {
    const text = '<img src=x onerror=alert(1)>';
    const doc = new DOMParser().parseFromString(renderToStaticMarkup(createElement(EmailDraftPreview, { html: null, text })), "text/html");
    expect(doc.querySelector("iframe, img, script")).toBeNull();
    expect(doc.querySelector("pre")!.textContent).toBe(text);
  });
});
