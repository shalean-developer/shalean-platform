import { describe, expect, it } from "vitest";
import { formatFacebookGraphError } from "@/lib/promotions/facebookPublish";

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
    expect(msg.toLowerCase()).toContain("facebook_page_access_token");
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
