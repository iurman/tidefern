-- Custom SQL migration file, put your code below! --

-- The application role. Created by SQL so it never joins neon_superuser
-- (which carries BYPASSRLS); NOINHERIT so membership grants it nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'tidefern_app') THEN
    CREATE ROLE tidefern_app NOLOGIN NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
-- The role running migrations (PGlite's superuser, Neon's owner role) needs
-- SET on tidefern_app so withActor() can SET LOCAL ROLE to it. A superuser
-- can already switch roles, and a Neon console role may lack the option to
-- grant it, so a failure here is reported and does not stop the migration.
DO $$
BEGIN
  GRANT tidefern_app TO CURRENT_USER WITH SET TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'could not grant tidefern_app to %: % (task B10 checks SET ROLE on each Neon branch)', current_user, SQLERRM;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO tidefern_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tidefern_app;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO tidefern_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tidefern_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO tidefern_app;
