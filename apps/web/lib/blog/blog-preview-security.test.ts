import { afterEach, describe, expect, it, vi } from "vitest";
const permission = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/requirePermission", () => ({ adminUserHasPermission: permission }));
import { createBlogPreviewQuery, isBlogDraftPreviewAllowed, verifyBlogPreviewToken } from "./blog-draft-preview";

afterEach(() => { vi.unstubAllEnvs(); permission.mockReset(); });
describe("scoped blog preview", () => {
  it("expires, rejects tampering, and cannot be reused for another post", () => {
    vi.stubEnv("BLOG_DRAFT_PREVIEW_TOKEN", "test-only-signing-key");
    const now = Date.now();
    const query = createBlogPreviewQuery("private-post", "author", now)!;
    const token = query.slice("?preview=".length);
    expect(verifyBlogPreviewToken(token,"private-post",now)).toBe("author");
    expect(verifyBlogPreviewToken(token,"another-post",now)).toBeNull();
    expect(verifyBlogPreviewToken(token,"private-post",now+600_001)).toBeNull();
    expect(verifyBlogPreviewToken(`${token}x`,"private-post",now)).toBeNull();
    expect(verifyBlogPreviewToken("test-only-signing-key","private-post",now)).toBeNull();
    expect(verifyBlogPreviewToken("true","private-post",now)).toBeNull();
    expect(query).not.toContain("test-only-signing-key");
  });
  it("rechecks current content permission so revocation invalidates a signed link", async () => {
    vi.stubEnv("BLOG_DRAFT_PREVIEW_TOKEN", "test-only-signing-key");
    const token = createBlogPreviewQuery("private-post","author")!.slice(9);
    permission.mockResolvedValue(false);
    expect(await isBlogDraftPreviewAllowed(token,"private-post")).toBe(false);
    permission.mockResolvedValue(true);
    expect(await isBlogDraftPreviewAllowed(token,"private-post")).toBe(true);
  });
});
