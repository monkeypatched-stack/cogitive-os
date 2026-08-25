-- PostgreSQL Row-Level Security Setup
-- Phase 2.3: Database-level tenant isolation
--
-- Enables RLS on all tenant-scoped tables to prevent cross-tenant queries
-- even if application logic has bugs.

-- ──────────────────────────────────────────────────────────────
-- ENABLE RLS ON ACTOR_STATE TABLE
-- ──────────────────────────────────────────────────────────────

-- Enable RLS
ALTER TABLE actor_state ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policy (SELECT, UPDATE, DELETE)
CREATE POLICY tenant_isolation_read ON actor_state
  AS PERMISSIVE
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_write ON actor_state
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_update ON actor_state
  AS PERMISSIVE
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant'::text))
  WITH CHECK (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_delete ON actor_state
  AS PERMISSIVE
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant'::text));

-- ──────────────────────────────────────────────────────────────
-- ENABLE RLS ON EPISODIC_MEMORY TABLE
-- ──────────────────────────────────────────────────────────────

ALTER TABLE episodic_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_read ON episodic_memory
  AS PERMISSIVE
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_write ON episodic_memory
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_update ON episodic_memory
  AS PERMISSIVE
  FOR UPDATE
  USING (tenant_id = current_setting('app.current_tenant'::text))
  WITH CHECK (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_delete ON episodic_memory
  AS PERMISSIVE
  FOR DELETE
  USING (tenant_id = current_setting('app.current_tenant'::text));

-- ──────────────────────────────────────────────────────────────
-- ENABLE RLS ON EVENT_LOG TABLE (IF EXISTS)
-- ──────────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_read ON event_log
  AS PERMISSIVE
  FOR SELECT
  USING (tenant_id = current_setting('app.current_tenant'::text));

CREATE POLICY tenant_isolation_write ON event_log
  AS PERMISSIVE
  FOR INSERT
  WITH CHECK (tenant_id = current_setting('app.current_tenant'::text));

-- ──────────────────────────────────────────────────────────────
-- ROLE SETUP FOR APPLICATION
-- ──────────────────────────────────────────────────────────────

-- Create application role (if not exists)
DO
$$BEGIN
  CREATE ROLE app_user WITH LOGIN PASSWORD 'changeme';
EXCEPTION WHEN duplicate_object THEN
  -- Role already exists, skip
END
$$;

-- Grant permissions to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON actor_state TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON episodic_memory TO app_user;
GRANT SELECT, INSERT ON event_log TO app_user;

-- ──────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES
-- ──────────────────────────────────────────────────────────────

-- Check if RLS is enabled
-- SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Test RLS with session variable
-- SET app.current_tenant = 'org_alpha';
-- SELECT * FROM actor_state;  -- Only returns org_alpha rows
--
-- SET app.current_tenant = 'org_beta';
-- SELECT * FROM actor_state;  -- Only returns org_beta rows
