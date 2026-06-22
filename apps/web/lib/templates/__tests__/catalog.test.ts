import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_TEMPLATE_CATALOG,
  NOTIFICATION_TEMPLATE_CATALOG_COUNT,
  RUNTIME_WIRED_TEMPLATE_COUNT,
} from "@/lib/templates/catalog";

describe("NOTIFICATION_TEMPLATE_CATALOG", () => {
  it("lists the full expected catalog size", () => {
    expect(NOTIFICATION_TEMPLATE_CATALOG_COUNT).toBe(35);
    expect(RUNTIME_WIRED_TEMPLATE_COUNT).toBe(14);
  });

  it("has unique key+channel pairs", () => {
    const keys = NOTIFICATION_TEMPLATE_CATALOG.map((t) => `${t.key}:${t.channel}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
