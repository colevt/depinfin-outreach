-- 0003. INV-5, the audit log is append-only. INV-4, suppressions are permanent.
--
-- Two layers, deliberately redundant:
--   1. Grants. The application role is never given UPDATE or DELETE on
--      activity_log, or DELETE on suppressions. This is the mandated control.
--   2. Triggers. These also bind the table owner and any superuser session
--      that is not deliberately disabling triggers, so an ad-hoc psql session
--      cannot quietly rewrite the evidentiary record either.
--
-- Rule 17Ad-9 recordkeeping. If the offering is ever examined, this is the
-- record that gets produced.

CREATE OR REPLACE FUNCTION refuse_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'INV-5: % on % is not permitted, this record is append-only',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER activity_log_no_update
  BEFORE UPDATE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION refuse_mutation();

CREATE TRIGGER activity_log_no_delete
  BEFORE DELETE ON activity_log
  FOR EACH ROW EXECUTE FUNCTION refuse_mutation();

CREATE TRIGGER activity_log_no_truncate
  BEFORE TRUNCATE ON activity_log
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_mutation();

CREATE TRIGGER suppressions_no_delete
  BEFORE DELETE ON suppressions
  FOR EACH ROW EXECUTE FUNCTION refuse_mutation();

CREATE TRIGGER suppressions_no_truncate
  BEFORE TRUNCATE ON suppressions
  FOR EACH STATEMENT EXECUTE FUNCTION refuse_mutation();

-- INV-4. A suppression is marked inactive with a reason and an actor. It is
-- never edited into something else, and it never comes back as a different
-- address.
CREATE OR REPLACE FUNCTION suppressions_deactivate_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value
     OR NEW.match_type IS DISTINCT FROM OLD.match_type
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.actor IS DISTINCT FROM OLD.actor
     OR NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION
      'INV-4: a suppression entry is permanent, only its active flag may change'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.active = false AND NEW.active = true THEN
    RAISE EXCEPTION
      'INV-4: a suppression cannot be reactivated by edit, insert a new entry'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.active = false AND OLD.active = true THEN
    NEW.deactivated_at := now();
    IF NEW.deactivated_by IS NULL OR NEW.deactivation_reason IS NULL THEN
      RAISE EXCEPTION
        'INV-4: deactivating a suppression requires an actor and a reason'
        USING ERRCODE = 'not_null_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER suppressions_deactivate_only
  BEFORE UPDATE ON suppressions
  FOR EACH ROW EXECUTE FUNCTION suppressions_deactivate_only();

-- Grants. Least privilege for the application role.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM depinfin_app;
GRANT USAGE ON SCHEMA public TO depinfin_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON firms, contacts TO depinfin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sequences, sequence_steps, enrollments TO depinfin_app;
GRANT SELECT, INSERT, UPDATE ON templates TO depinfin_app;
GRANT SELECT ON offering_documents TO depinfin_app;
GRANT SELECT ON excluded_jurisdictions TO depinfin_app;

-- INV-4. Insert and deactivate. Never delete.
GRANT SELECT, INSERT, UPDATE ON suppressions TO depinfin_app;

-- INV-5. Insert and read. Never update, never delete.
GRANT SELECT, INSERT ON activity_log TO depinfin_app;
GRANT USAGE, SELECT ON SEQUENCE activity_log_id_seq TO depinfin_app;

-- Anything added later starts with no privileges rather than inheriting some.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM depinfin_app;
