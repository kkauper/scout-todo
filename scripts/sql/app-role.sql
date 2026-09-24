-- Least-privilege role for the running app (Hyperdrive). Migrations and scripts/user.ts keep using the owner role.
-- Run as the owner role. Replace the password first: openssl rand -base64 32
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scout_app') THEN
    CREATE ROLE scout_app LOGIN PASSWORD 'REPLACE_ME';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO scout_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scout_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO scout_app;

-- Supabase has RLS enabled on every table with no policies (Data API roles see nothing).
-- scout_app is not the table owner, so it needs an explicit policy per table.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','projects','tags','board_columns','tasks','task_tags','checklist_items','task_state_events','task_links','time_entries'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS scout_app_all ON public.%I', t);
    EXECUTE format('CREATE POLICY scout_app_all ON public.%I FOR ALL TO scout_app USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- Data API roles (Supabase only): remove table access entirely, not just via RLS.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
  END IF;
END $$;
