import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  defaultRepoRoot,
  listActiveMigrationFilenames,
  readRepositoryMigration,
  resolveRepositoryMigration,
} from "@/lib/audit/resolveRepositoryMigration";

describe("resolveRepositoryMigration", () => {
  const temps: string[] = [];

  afterEach(() => {
    while (temps.length > 0) {
      const dir = temps.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  function makeRepo(layout: {
    active?: string[];
    legacy?: string[];
  }): string {
    const root = mkdtempSync(path.join(tmpdir(), "mig-resolve-"));
    temps.push(root);
    const activeDir = path.join(root, "supabase", "migrations");
    const legacyDir = path.join(root, "supabase", "migrations-legacy");
    mkdirSync(activeDir, { recursive: true });
    mkdirSync(legacyDir, { recursive: true });
    for (const name of layout.active ?? []) {
      writeFileSync(path.join(activeDir, name), `-- active ${name}\n`);
    }
    for (const name of layout.legacy ?? []) {
      writeFileSync(path.join(legacyDir, name), `-- legacy ${name}\n`);
    }
    return root;
  }

  it("resolves an active migration", () => {
    const root = makeRepo({
      active: ["20260714140000_bookings_r0_paid_amount_constraint.sql"],
      legacy: ["20260936_bookings_payment_method_chk_add_eft_card.sql"],
    });
    const resolved = resolveRepositoryMigration(
      "20260714140000_bookings_r0_paid_amount_constraint.sql",
      { repoRoot: root },
    );
    expect(resolved.kind).toBe("active");
    expect(resolved.filename).toBe("20260714140000_bookings_r0_paid_amount_constraint.sql");
    expect(resolved.relativePath).toBe(
      "supabase/migrations/20260714140000_bookings_r0_paid_amount_constraint.sql",
    );
    expect(resolved.absolutePath).toContain(`${path.sep}migrations${path.sep}`);
  });

  it("resolves a legacy migration when it is archive-only", () => {
    const root = makeRepo({
      active: ["20260714010000_production_baseline.sql"],
      legacy: ["20260936_bookings_payment_method_chk_add_eft_card.sql"],
    });
    const resolved = resolveRepositoryMigration(
      "20260936_bookings_payment_method_chk_add_eft_card.sql",
      { repoRoot: root },
    );
    expect(resolved.kind).toBe("legacy");
    expect(resolved.relativePath).toBe(
      "supabase/migrations-legacy/20260936_bookings_payment_method_chk_add_eft_card.sql",
    );
    const { sql } = readRepositoryMigration(
      "20260936_bookings_payment_method_chk_add_eft_card.sql",
      { repoRoot: root },
    );
    expect(sql).toContain("legacy");
  });

  it("fails when a required migration is missing", () => {
    const root = makeRepo({ active: ["20260714010000_production_baseline.sql"] });
    expect(() =>
      resolveRepositoryMigration("20260999_does_not_exist.sql", { repoRoot: root }),
    ).toThrow(/Required migration not found/);
  });

  it("fails on duplicate version stamps within one location", () => {
    const root = makeRepo({
      legacy: [
        "20260936_bookings_payment_method_chk_add_eft_card.sql",
        "20260936_bookings_payment_method_chk_duplicate.sql",
      ],
    });
    expect(() =>
      resolveRepositoryMigration("20260936_bookings_payment_method_chk_add_eft_card.sql", {
        repoRoot: root,
      }),
    ).toThrow(/Duplicate migration version 20260936/);
  });

  it("fails when the same filename exists in active and legacy", () => {
    const root = makeRepo({
      active: ["20260936_bookings_payment_method_chk_add_eft_card.sql"],
      legacy: ["20260936_bookings_payment_method_chk_add_eft_card.sql"],
    });
    expect(() =>
      resolveRepositoryMigration("20260936_bookings_payment_method_chk_add_eft_card.sql", {
        repoRoot: root,
      }),
    ).toThrow(/Ambiguous migration/);
  });

  it("rejects malformed filenames", () => {
    const root = makeRepo({ active: [] });
    expect(() => resolveRepositoryMigration("not-a-migration.sql", { repoRoot: root })).toThrow(
      /Malformed migration filename/,
    );
    expect(() => resolveRepositoryMigration("", { repoRoot: root })).toThrow(/non-empty/);
  });

  it("rejects wrong migration name that does not match any exact file even when stamp exists", () => {
    const root = makeRepo({
      legacy: ["20260936_bookings_payment_method_chk_add_eft_card.sql"],
    });
    expect(() =>
      resolveRepositoryMigration("20260936_wrong_migration_name.sql", { repoRoot: root }),
    ).toThrow(/Required migration not found/);
  });

  it("rejects path traversal and directory-qualified names", () => {
    const root = makeRepo({
      legacy: ["20260936_bookings_payment_method_chk_add_eft_card.sql"],
    });
    expect(() =>
      resolveRepositoryMigration("../migrations-legacy/20260936_bookings_payment_method_chk_add_eft_card.sql", {
        repoRoot: root,
      }),
    ).toThrow(/directory path|path traversal/);
    expect(() =>
      resolveRepositoryMigration("..\\20260936_bookings_payment_method_chk_add_eft_card.sql", {
        repoRoot: root,
      }),
    ).toThrow(/directory path|path traversal/);
  });

  it("lists only active migration filenames from the real repository", () => {
    const names = listActiveMigrationFilenames({ repoRoot: defaultRepoRoot() });
    expect(names).toContain("20260714010000_production_baseline.sql");
    expect(names).toContain("20260714140000_bookings_r0_paid_amount_constraint.sql");
    expect(names.every((n) => n.endsWith(".sql"))).toBe(true);
    // Legacy archaeology must not appear in the active list.
    expect(names).not.toContain("20260936_bookings_payment_method_chk_add_eft_card.sql");
  });
});
