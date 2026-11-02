import { describe, expect, it } from "vitest";
import { readPagedRows } from "@/lib/analytics/readPagedRows";

const synthetic = (size: number) => Array.from({ length: size }, (_, id) => ({ id }));

function fakeQuery(rows: { id: number }[], pages: Array<[number, number]>, failAt?: number) {
  return () => ({
    range: async (from: number, to: number) => {
      pages.push([from, to]);
      return failAt === from
        ? { data: null, error: { message: "Synthetic query failure" } }
        : { data: rows.slice(from, to + 1), error: null };
    },
  });
}

describe("readPagedRows", () => {
  it.each([0, 1, 999, 1000, 1001, 1889, 2501])("returns all %i rows exactly once", async (n) => {
    const calls: Array<[number, number]> = [];
    const result = await readPagedRows(fakeQuery(synthetic(n), calls));
    expect(result.error).toBeNull();
    expect(result.data.map((r) => r.id)).toEqual(synthetic(n).map((r) => r.id));
    expect(calls).toEqual(Array.from({ length: Math.floor(n / 1000) + 1 }, (_, i) => [i * 1000, i * 1000 + 999]));
  });

  it("fails closed without returning partial data on a later-page failure", async () => {
    const result = await readPagedRows(fakeQuery(synthetic(1889), [], 1000));
    expect(result.data).toEqual([]);
    expect(result.error?.message).toMatch(/Synthetic query failure/);
  });

  it("fails closed when the row cap is exceeded", async () => {
    const result = await readPagedRows(fakeQuery(synthetic(2501), []), 1000, 2000);
    expect(result.data).toEqual([]);
    expect(result.error?.message).toMatch(/safety limit/);
  });

  it("permits exactly the row cap when the next probe is empty", async () => {
    const result = await readPagedRows(fakeQuery(synthetic(2000), []), 1000, 2000);
    expect(result.data).toHaveLength(2000);
    expect(result.error).toBeNull();
  });
});
