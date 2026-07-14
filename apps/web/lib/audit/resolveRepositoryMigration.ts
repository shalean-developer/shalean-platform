import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deterministic migration-path resolver for audit / governance / content-guard tests.
 *
 * Searches only approved repository locations:
 *   - `supabase/migrations/`          (active — used by production deploy tooling)
 *   - `supabase/migrations-legacy/`    (archive — archaeology only; not replayed)
 *
 * Active matches always win over legacy. Duplicate exact filenames across both
 * locations, or multiple matches for the same version stamp within one location,
 * fail closed. Path traversal and malformed filenames are rejected.
 *
 * Production tooling must continue to use only `supabase/migrations/`.
 */

export type RepositoryMigrationKind = "active" | "legacy";

export type ResolvedRepositoryMigration = {
  filename: string;
  absolutePath: string;
  /** Repo-relative POSIX path, e.g. `supabase/migrations-legacy/….sql`. */
  relativePath: string;
  kind: RepositoryMigrationKind;
};

const MIGRATION_FILENAME_RE = /^(\d{8,})[a-z0-9_]*\.sql$/i;

const APPROVED_LOCATION_REL: ReadonlyArray<{
  kind: RepositoryMigrationKind;
  segments: readonly string[];
}> = [
  { kind: "active", segments: ["supabase", "migrations"] },
  { kind: "legacy", segments: ["supabase", "migrations-legacy"] },
];

export function defaultRepoRootFromModuleUrl(moduleUrl: string): string {
  // apps/web/lib/audit/<this file> → repo root is five levels up.
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..", "..", "..", "..");
}

export function defaultRepoRoot(): string {
  return defaultRepoRootFromModuleUrl(import.meta.url);
}

function assertSafeMigrationFilename(filename: string): void {
  const trimmed = filename.trim();
  if (!trimmed) {
    throw new Error("Migration filename must be a non-empty string.");
  }
  if (trimmed !== path.basename(trimmed)) {
    throw new Error(`Migration filename must not include a directory path: ${filename}`);
  }
  if (trimmed.includes("\0") || trimmed.includes("..")) {
    throw new Error(`Migration filename rejects path traversal: ${filename}`);
  }
  if (!MIGRATION_FILENAME_RE.test(trimmed)) {
    throw new Error(
      `Malformed migration filename (expected <digits>_<name>.sql): ${filename}`,
    );
  }
}

function versionStamp(filename: string): string {
  const m = filename.match(/^(\d+)/);
  if (!m) {
    throw new Error(`Malformed migration filename (missing version stamp): ${filename}`);
  }
  return m[1];
}

function listSqlInDir(absDir: string): string[] {
  if (!existsSync(absDir) || !statSync(absDir).isDirectory()) return [];
  return readdirSync(absDir).filter(
    (name) => name.endsWith(".sql") && MIGRATION_FILENAME_RE.test(name),
  );
}

function toPosixRelative(repoRoot: string, absPath: string): string {
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

/**
 * Resolve a single migration SQL file by exact basename.
 *
 * Prefer active over legacy when the same basename exists in exactly one of each
 * location? Policy: exact basename must appear in at most one approved location;
 * if it appears in both, fail as ambiguous (history must not double-host content).
 * Within a single location, the basename must appear once (filesystem uniqueness).
 */
export function resolveRepositoryMigration(
  filename: string,
  options?: { repoRoot?: string },
): ResolvedRepositoryMigration {
  assertSafeMigrationFilename(filename);
  const base = path.basename(filename.trim());
  const stamp = versionStamp(base);
  const repoRoot = options?.repoRoot ?? defaultRepoRoot();

  const hits: ResolvedRepositoryMigration[] = [];
  for (const loc of APPROVED_LOCATION_REL) {
    const absDir = path.join(repoRoot, ...loc.segments);
    const names = listSqlInDir(absDir);
    const sameStamp = names.filter((n) => versionStamp(n) === stamp);
    if (sameStamp.length > 1) {
      throw new Error(
        `Duplicate migration version ${stamp} under ${loc.segments.join("/")}: ${sameStamp.join(", ")}`,
      );
    }
    if (!names.includes(base)) continue;
    const absolutePath = path.join(absDir, base);
    hits.push({
      filename: base,
      absolutePath,
      relativePath: toPosixRelative(repoRoot, absolutePath),
      kind: loc.kind,
    });
  }

  if (hits.length === 0) {
    throw new Error(
      `Required migration not found in approved locations (active or legacy): ${base}`,
    );
  }
  if (hits.length > 1) {
    throw new Error(
      `Ambiguous migration ${base} found in multiple approved locations: ${hits
        .map((h) => h.relativePath)
        .join(", ")}`,
    );
  }
  return hits[0]!;
}

/** Read UTF-8 contents of a migration resolved via {@link resolveRepositoryMigration}. */
export function readRepositoryMigration(
  filename: string,
  options?: { repoRoot?: string },
): { sql: string; resolved: ResolvedRepositoryMigration } {
  const resolved = resolveRepositoryMigration(filename, options);
  return { sql: readFileSync(resolved.absolutePath, "utf8"), resolved };
}

/**
 * List SQL basenames under the active migrations directory only.
 * Used by governance scanners that must ignore the legacy archive.
 */
export function listActiveMigrationFilenames(options?: { repoRoot?: string }): string[] {
  const repoRoot = options?.repoRoot ?? defaultRepoRoot();
  const absDir = path.join(repoRoot, "supabase", "migrations");
  return listSqlInDir(absDir).sort();
}
