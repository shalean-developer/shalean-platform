import { describe, expect, it } from "vitest";
import {
  formatFacebookGraphError,
  isValidFacebookExternalPostId,
} from "@/lib/promotions/facebookPublish";

describe("formatFacebookGraphError", () => {
  it("maps deprecated publish_actions to Page-token guidance", () => {
    const msg = formatFacebookGraphError(
      {
        code: 200,
        message:
          "(#200) The permission(s) publish_actions are not available. It has been deprecated. If you want to provide a way for your app users to share content to Facebook, we encourage you to use our Sharing products instead.",
      },
      403,
    );
    expect(msg).toContain("Page access token");
    expect(msg).toContain("pages_manage_posts");
    expect(msg).toContain("/me/accounts");
  });

  it("passes through other Graph messages with auth guidance on 401", () => {
    const msg = formatFacebookGraphError({ message: "Invalid OAuth access token." }, 401);
    expect(msg).toContain("Invalid OAuth access token.");
    expect(msg.toLowerCase()).toContain("reconnect facebook");
  });

  it("maps rate limits", () => {
    const msg = formatFacebookGraphError({ message: "Application request limit reached", code: 4 }, 429);
    expect(msg.toLowerCase()).toContain("wait a minute");
  });

  it("maps provider outages", () => {
    const msg = formatFacebookGraphError(undefined, 503);
    expect(msg).toContain("503");
    expect(msg.toLowerCase()).toContain("retry");
  });
});

describe("MKT-001K.1 Facebook post id integrity", () => {
  const pageId = "102815532315418";

  it("accepts canonical Page_post ids", () => {
    expect(isValidFacebookExternalPostId(`${pageId}_1074436751809475`, pageId)).toBe(true);
  });

  it("rejects unknown placeholder ids", () => {
    expect(isValidFacebookExternalPostId("unknown", pageId)).toBe(false);
    expect(isValidFacebookExternalPostId("", pageId)).toBe(false);
  });

  it("rejects ids for a different Page", () => {
    expect(isValidFacebookExternalPostId("999999999999_123", pageId)).toBe(false);
  });
});
