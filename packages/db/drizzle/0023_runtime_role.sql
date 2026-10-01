-- The running app gets table rows only (TECH-06 §3, review P1-02). Migrations
-- run as the schema owner; the api and worker log in as a role that is a
-- member of holypearls_runtime, which can read and write rows but can't
-- create, alter or drop anything, and can't change the audit log.
--
-- Roles belong to the whole server, so another database (a parallel test
-- database, or another Neon branch's history) may already have made it. These
-- steps then change nothing: writing the shared role catalogs would make
-- parallel migrations queue behind each other.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'holypearls_runtime') THEN
    CREATE ROLE holypearls_runtime NOLOGIN;
  END IF;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL;
END;
$$;
--> statement-breakpoint
-- The owner is a member of the runtime role: it can hand over the job queue's
-- schema below, and keeps using what the app creates there (locally, where
-- one login does both, and in later migrations).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_auth_members m
    WHERE m.roleid = 'holypearls_runtime'::regrole AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user) AND m.inherit_option AND m.set_option
  ) AND NOT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) THEN
    EXECUTE format('GRANT holypearls_runtime TO %I WITH INHERIT TRUE, SET TRUE', current_user);
  END IF;
EXCEPTION WHEN duplicate_object OR insufficient_privilege OR invalid_grant_operation THEN
  NULL;
END;
$$;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO holypearls_runtime;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO holypearls_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO holypearls_runtime;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO holypearls_runtime;
--> statement-breakpoint
-- Tables that later migrations create get the same rights.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO holypearls_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO holypearls_runtime;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO holypearls_runtime;
--> statement-breakpoint
-- The audit log is insert-only: the trigger refuses changes for everyone, and the app isn't even granted them.
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM holypearls_runtime;
--> statement-breakpoint
-- pg-boss keeps its queue tables in its own schema and upgrades them itself
-- at start, so the runtime role owns that schema (and nothing else).
CREATE SCHEMA IF NOT EXISTS pgboss;
--> statement-breakpoint
DO $$
DECLARE item record;
BEGIN
  ALTER SCHEMA pgboss OWNER TO holypearls_runtime;
  FOR item IN SELECT c.oid::regclass AS name, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'pgboss' AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      -- A sequence that belongs to a column moves with its table.
      AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')))
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO holypearls_runtime', CASE item.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, item.name);
  END LOOP;
  FOR item IN SELECT p.oid::regprocedure AS name FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'pgboss' LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO holypearls_runtime', item.name);
  END LOOP;
  FOR item IN SELECT t.oid::regtype AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'pgboss' AND t.typtype IN ('e', 'd', 'c') AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
  LOOP
    EXECUTE format('ALTER TYPE %s OWNER TO holypearls_runtime', item.name);
  END LOOP;
END;
$$;
