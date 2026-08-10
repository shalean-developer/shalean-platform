import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { priorityPermissionsForRequest } from "@/lib/admin/requireAdmin";

const webRoot = resolve(process.cwd());
const adminApiRoot = resolve(webRoot, "app/api/admin");

function routeFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    return statSync(path).isDirectory() ? routeFiles(path) : path.endsWith(`${sep}route.ts`) ? [path] : [];
  });
}

function routePath(file: string): string {
  return `/api/admin/${relative(adminApiRoot, file)}`
    .replaceAll(sep, "/")
    .replace(/\/route\.ts$/, "")
    .replaceAll(/\[[^\]]+\]/g, "test-id");
}

describe("P8 Admin RBAC governance closeout", () => {
  it("fails closed for unknown compatibility-helper routes", () => {
    expect(priorityPermissionsForRequest(new Request("https://example.test/api/admin/unclassified-module"))).toEqual([]);
  });

  it("classifies every route still using a compatibility helper", () => {
    const unclassified = routeFiles(adminApiRoot)
      .filter((file) => /requireAdmin(Api|Session)\s*\(/.test(readFileSync(file, "utf8")))
      .map(routePath)
      .filter((path) => priorityPermissionsForRequest(new Request(`https://example.test${path}`)).length === 0);

    expect(unclassified).toEqual([]);
  });

  it("records authenticated permission denials for production observation", () => {
    const source = readFileSync(resolve(webRoot, "lib/admin/requirePermission.ts"), "utf8");
    expect(source).toContain('event_type: "authorization_denied"');
    expect(source).toContain("required_any_permission: permissions");
    expect(source).toContain("Admin authorization denial audit failed");
  });
});
