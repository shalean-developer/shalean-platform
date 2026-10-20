// Bounded migration runner: prints reviewed SQL + exact immutable ledger receipt.
// No network, credentials or production data writes are performed by this script.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
export const migrations = [
  '20261020155014_blog_cms_permission_boundary',
  '20261020155213_blog_atomic_editor_save',
  '20261020155854_blog_schedule_publication',
  '20261020162025_blog_editor_security_advisor_followup',
  '20261020190530_blog_scheduler_isolated_vault_target',
];
export function buildApplySql(id, sql) {
  if (!migrations.includes(id) || sql.includes('$blog_editor_source$')) throw new Error('Unreviewed migration');
  const [version, ...parts] = id.split('_'); const name = parts.join('_');
  return `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
DO $blog_editor_apply$
DECLARE
  v_sql text := $blog_editor_source$${sql}$blog_editor_source$;
  v_name text; v_statements text[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('shalean:migration:${version}', 0));
  SELECT name, statements INTO v_name, v_statements
    FROM supabase_migrations.schema_migrations WHERE version='${version}' FOR UPDATE;
  IF FOUND THEN
    IF v_name IS DISTINCT FROM '${name}' OR v_statements IS DISTINCT FROM ARRAY[v_sql] THEN
      RAISE EXCEPTION 'Blog migration receipt differs; stop for review';
    END IF;
    RETURN;
  END IF;
  EXECUTE v_sql;
  INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
    VALUES ('${version}','${name}',ARRAY[v_sql]);
END;
$blog_editor_apply$;
COMMIT;
`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (!migrations.includes(id)) throw new Error('Choose a reviewed blog migration ID');
  process.stdout.write(buildApplySql(id,await readFile(new URL(`../../supabase/migrations/${id}.sql`,import.meta.url),'utf8')));
}
