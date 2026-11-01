import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loading: true }));
vi.mock("@/app/cleaner/login/CleanerLoginPageClient", () => ({
  CleanerLoginPageClient: () => {
    if (state.loading) throw new Promise(() => {});
    return createElement("h1", null, "Cleaner sign in");
  },
}));
import CleanerLoginPage from "@/app/cleaner/login/page";

describe("SEO-META-07 cleaner sign-in heading", () => {
  it("provides one heading in the server loading fallback", () => {
    state.loading = true;
    const html = renderToStaticMarkup(createElement(CleanerLoginPage));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Cleaner sign in");
  });
  it("does not duplicate the heading when the form is ready", () => {
    state.loading = false;
    const html = renderToStaticMarkup(createElement(CleanerLoginPage));
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain("Cleaner sign in");
  });
});
