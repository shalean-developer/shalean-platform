import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isZohoBooksWriteBlocked } from "../zohoWriteIsolation";

describe("CF-02 Zoho Books write isolation", () => {
  it.each([undefined, "", "staging", "stage", "development", "preview", "local", "test", "unexpected"])(
    "fails closed when SHALEAN_APP_ENV is %s",
    (env) => expect(isZohoBooksWriteBlocked(env)).toBe(true),
  );

  it("permits explicitly identified production environments only", () => {
    expect(isZohoBooksWriteBlocked("production")).toBe(false);
    expect(isZohoBooksWriteBlocked("prod")).toBe(false);
  });

  it("checks the shared API client before OAuth and external requests", () => {
    const client = readFileSync(join(process.cwd(), "lib/zoho/zohoBooksClient.ts"), "utf8");
    const start = client.indexOf("async function request<T>(");
    const guard = client.indexOf('if (method !== "GET" && isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV))', start);
    const oauth = client.indexOf("const token = await getAccessToken();", start);
    const apiRequest = client.indexOf("const res = await fetch(url, init);", start);
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(start);
    expect(oauth).toBeGreaterThan(guard);
    expect(apiRequest).toBeGreaterThan(oauth);
  });
});
