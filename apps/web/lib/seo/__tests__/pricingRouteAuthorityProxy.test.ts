import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../../proxy";

describe("pricing route authority proxy", () => {
  it("passes the evergreen Cape Town pricing route through with HTTP 200", async () => {
    const response = await proxy(
      new NextRequest("http://localhost/cleaning-prices-cape-town"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("preserves the separate /pricing redirect to the dated supporting guide", async () => {
    const response = await proxy(new NextRequest("http://localhost/pricing"));

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "http://localhost/blog/how-much-does-cleaning-cost-cape-town-2026",
    );
  });
});
