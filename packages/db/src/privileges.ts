import { sql } from "drizzle-orm";
import type { Database } from "./client.js";

/**
 * Why the connected role is too powerful for the running app, or an empty
 * list (review P1-02). Production refuses to start unless it's empty: the
 * app's role can read and write rows, and nothing more.
 */
export async function runtimePrivilegeProblems(db: Database): Promise<string[]> {
  const result = await db.execute<{ superuser: boolean; create_db: boolean; create_role: boolean; create_public: boolean; owns: number; audit_change: boolean }>(sql`
    select r.rolsuper as superuser,
           r.rolcreatedb as create_db,
           r.rolcreaterole as create_role,
           has_schema_privilege(current_user, 'public', 'CREATE') as create_public,
           (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and pg_has_role(current_user, c.relowner, 'USAGE')) as owns,
           (has_table_privilege(current_user, 'public.audit_log', 'UPDATE')
              or has_table_privilege(current_user, 'public.audit_log', 'DELETE')
              or has_table_privilege(current_user, 'public.audit_log', 'TRUNCATE')) as audit_change
    from pg_roles r where r.rolname = current_user`);
  const row = result.rows[0];
  if (!row) return ["the connected role wasn't found"];
  const problems: string[] = [];
  if (row.superuser) problems.push("it is a superuser");
  if (row.create_db) problems.push("it can create databases");
  if (row.create_role) problems.push("it can create roles");
  if (row.create_public) problems.push("it can create objects in the public schema");
  if (row.owns > 0) problems.push(`it owns ${row.owns} tables or other objects`);
  if (row.audit_change) problems.push("it can change or delete audit log rows");
  return problems;
}
