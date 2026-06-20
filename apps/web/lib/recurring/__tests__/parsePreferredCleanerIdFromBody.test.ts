import { describe, expect, it, vi } from "vitest";
import { parsePreferredCleanerIdFromBody } from "@/lib/recurring/parsePreferredCleanerIdFromBody";

const VALID = "11111111-1111-4111-8111-111111111111";

describe("parsePreferredCleanerIdFromBody", () => {
  it("returns undefined when field omitted", async () => {
    expect(await parsePreferredCleanerIdFromBody(undefined)).toEqual({ ok: true, value: undefined });
    expect(await parsePreferredCleanerIdFromBody("")).toEqual({ ok: true, value: undefined });
  });

  it("returns null when explicitly cleared", async () => {
    expect(await parsePreferredCleanerIdFromBody(null)).toEqual({ ok: true, value: null });
  });

  it("returns null for invalid uuid without admin lookup", async () => {
    expect(await parsePreferredCleanerIdFromBody("not-a-uuid")).toEqual({ ok: true, value: null });
  });

  it("validates cleaner exists when admin client supplied", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { id: VALID }, error: null })),
          })),
        })),
      })),
    };
    const result = await parsePreferredCleanerIdFromBody(VALID, admin as never);
    expect(result).toEqual({ ok: true, value: VALID });
  });

  it("rejects unknown cleaner id", async () => {
    const admin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    };
    const result = await parsePreferredCleanerIdFromBody(VALID, admin as never);
    expect(result).toEqual({ ok: false, error: "Preferred cleaner not found." });
  });
});
