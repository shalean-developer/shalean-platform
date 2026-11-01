// Emits one bounded, atomic data-migration application. No network or credentials.
// The reviewed forward-migration bytes and their ledger receipt commit together.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const version = '20261020150111';
export const name = 'cms_kitchen_grease_canonical_references';
export const migrationUrl = new URL(`../../supabase/migrations/${version}_${name}.sql`, import.meta.url);

export function buildApplySql(sql) {
  if (sql.includes('$cms_grease_source$')) throw new Error('Reserved SQL delimiter in migration');
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $cms_grease_apply$
DECLARE
  v_sql text := $cms_grease_source$${sql}$cms_grease_source$;
  v_name text;
  v_statements text[];
BEGIN
  -- Serialize this new version only. Never repair or rewrite historical receipts.
  PERFORM pg_advisory_xact_lock(hashtextextended('shalean:migration:${version}', 0));
  SELECT name, statements INTO v_name, v_statements
  FROM supabase_migrations.schema_migrations WHERE version = '${version}' FOR UPDATE;
  IF FOUND THEN
    IF v_name IS DISTINCT FROM '${name}' OR v_statements IS DISTINCT FROM ARRAY[v_sql] THEN
      RAISE EXCEPTION 'CMS grease migration receipt differs; stop for review';
    END IF;
    RETURN;
  END IF;
  EXECUTE v_sql;
  INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
  VALUES ('${version}', '${name}', ARRAY[v_sql]);
END;
$cms_grease_apply$;
COMMIT;
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(buildApplySql(await readFile(migrationUrl, 'utf8')));
}
