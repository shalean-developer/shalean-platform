import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isZohoBooksWriteBlocked } from "../zohoWriteIsolation";

describe("CF-02 Zoho Books write isolation", () => {
  it.each([undefined, "", "staging", "stage", "development", "preview", "local", "test", "unexpected"])(
    "fails closed when SHALEAN_APP_ENV is %s",
    (env) => expect(isZohoBooksWriteBlocked(env)).toBe(true),
  );

  it("permits the existing explicitly identified production environment only", () => {
    expect(isZohoBooksWriteBlocked("production")).toBe(false);
  });

  it("checks the low-level shared client before any Zoho OAuth or Books request", () => {
    const client = readFileSync(join(process.cwd(), "lib/zoho/zohoBooksClient.ts"), "utf8");
    const start = client.indexOf("async function request<T>(");
    const guard = client.indexOf('if (method !== "GET" && isZohoBooksWriteBlocked(process.env.SHALEAN_APP_ENV))', start);
    const oauth = client.indexOf("const token = await getAccessToken();", start);
    const apiRequest = client.indexOf("const res = await fetch(url, init);", start);
    expect(start).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(start);
    expect(oauth).toBeGreaterThan(guard);
    expect(apiRequest).toBeGreaterThan(oauth);
    expect(client).toContain('post: <T>(path: string, body: unknown) => request<T>("POST", path, body)');
    expect(client).toContain('put: <T>(path: string, body: unknown) => request<T>("PUT", path, body)');
    expect(client).toContain('delete: <T>(path: string) => request<T>("DELETE", path)');
  });
});
