-- 0001. Extensions and roles.
--
-- Run every migration as the owner role, never as the application role.
-- The application role must not own these tables: ownership would let it
-- bypass the grants in 0003, and INV-5 depends on those grants holding.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'depinfin_app') THEN
    CREATE ROLE depinfin_app LOGIN;
  END IF;
END
$$;
