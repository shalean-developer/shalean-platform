import { describe, expect, it } from "vitest";
import { ownedCustomerAvatarPath, providerAvatarUrl } from "../customerAvatar";

describe("customer avatar metadata", () => {
  it("rejects unsafe URLs and uses a supported provider photo", () => {
    expect(providerAvatarUrl({ avatar_url: "javascript:alert(1)", picture: "https://example.com/photo.jpg" })).toBe("https://example.com/photo.jpg");
    expect(providerAvatarUrl({ avatar_url: "https://name:secret@example.com/photo" })).toBeUndefined();
    expect(providerAvatarUrl({ avatar_url: "data:image/svg+xml,unsafe" })).toBeUndefined();
    expect(providerAvatarUrl({ avatar_url: "https://example.com/a", customer_avatar_removed: true })).toBeUndefined();
  });
  it("accepts only the owner's generated object path", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const path = `${id}/22222222-2222-4222-8222-222222222222.webp`;
    expect(ownedCustomerAvatarPath(id, path)).toBe(path);
    expect(ownedCustomerAvatarPath("other", path)).toBeNull();
    expect(ownedCustomerAvatarPath(id, `${id}/../other/photo.webp`)).toBeNull();
  });
});
