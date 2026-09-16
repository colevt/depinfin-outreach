-- 0006. The operator desk.
--
-- Adds the market side dimension, template targeting, per-prospect drafts,
-- saved searches, research notes, and the automation controls.
--
-- Four of these carry an invariant into the schema rather than leaving it to
-- application code, which is the standing rule in this repo:
--
--   drafts               cannot leave draft status while the linter is unclean
--                        (INV-2, for human-composed mail as well as templated)
--   drafts               corporate content only, same check as templates
--                        (INV-6)
--   digest_recipients    internal addresses only, so an internal digest full
--                        of prospect data can never be addressed to a prospect
--   automation_settings  cold outreach cannot be switched on without a
--                        recorded counsel sign-off (section 11)

-- Buy side is investors. Sell side is the infrastructure operators who raise
-- through the platform. Two pipelines, one system, different postures.
CREATE TYPE market_side AS ENUM ('buy', 'sell');

-- Sell-side prospects are not a firm_type. An operator running a telecom
-- network is a different kind of entity from a family office, and collapsing
-- them into one enum would make every downstream filter ambiguous.
CREATE TYPE operator_category AS ENUM (
  'telecom', 'compute', 'energy', 'sensing', 'mobility',
  'storage', 'protocol_foundation', 'hardware_oem', 'other'
);

CREATE TYPE template_stage AS ENUM ('first_touch', 'follow_up', 'reply', 'breakup');
CREATE TYPE draft_kind AS ENUM ('first_touch', 'follow_up', 'reply');
CREATE TYPE draft_status AS ENUM ('draft', 'approved', 'sent', 'discarded');
CREATE TYPE search_channel AS ENUM ('linkedin', 'web');

-- INV-8. A LinkedIn draft is written here and sent by a human from their own
-- account. There is no transport for it and there never will be. The channel
-- exists so the desk can show a copy button next to the profile link, which is
-- exactly what INV-8 describes and the whole of what it permits.
CREATE TYPE draft_channel AS ENUM ('email', 'linkedin');

ALTER TABLE firms
  ADD COLUMN side market_side NOT NULL DEFAULT 'buy',
  ADD COLUMN operator_category operator_category,
  -- Sell-side firms have an operator category and no investor firm_type.
  -- Not enforced as a hard constraint: an operator whose principals also
  -- invest is a real case, and this is a small internal system.
  ADD COLUMN sector_thesis text;

CREATE INDEX firms_side_idx ON firms (side, tier);

-- Template targeting. content_tier keeps its check constraint from 0002, so
-- every template added here is still corporate content (INV-6).
ALTER TABLE templates
  ADD COLUMN side market_side NOT NULL DEFAULT 'buy',
  ADD COLUMN stage template_stage NOT NULL DEFAULT 'first_touch',
  -- Empty means any prospect type on that side. A template that names types
  -- is offered only for those.
  ADD COLUMN audience_firm_types firm_type[] NOT NULL DEFAULT '{}',
  ADD COLUMN audience_operator_categories operator_category[] NOT NULL DEFAULT '{}',
  ADD COLUMN notes text;

CREATE INDEX templates_targeting_idx ON templates (side, stage);

-- Per-prospect composed mail. This is the Prospects tab's output: one message
-- for one person, written or assembled by an operator, not a sequence step.
CREATE TABLE drafts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES contacts (id) ON DELETE RESTRICT,
  -- Null when the operator wrote from scratch rather than from a template.
  template_id   uuid REFERENCES templates (id) ON DELETE RESTRICT,
  kind          draft_kind NOT NULL,
  channel       draft_channel NOT NULL DEFAULT 'email',
  -- Empty for a LinkedIn message, which has no subject line.
  subject       text NOT NULL DEFAULT '',
  body          text NOT NULL,
  status        draft_status NOT NULL DEFAULT 'draft',
  CONSTRAINT drafts_email_has_subject CHECK (
    channel <> 'email' OR btrim(subject) <> ''
  ),

  -- INV-6. Same check as templates. A draft is corporate content, and there is
  -- no column here that could reference offering_documents.
  content_tier  content_tier NOT NULL DEFAULT 'corporate'
                CONSTRAINT drafts_corporate_only CHECK (content_tier = 'corporate'),

  -- INV-2, at the schema level. The linter verdict is stored with the draft,
  -- and an unclean draft cannot be approved or sent. A human writing the mail
  -- by hand gets the same gate a templated send gets.
  lint_clean    boolean NOT NULL DEFAULT false,
  lint_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT drafts_unclean_stays_draft CHECK (
    status IN ('draft', 'discarded') OR lint_clean
  ),

  -- Set when status becomes sent. The transport that carried it, for INV-9
  -- traceability. A LinkedIn draft has no transport, because a human sent it
  -- from their own account (INV-8), so the attribution check exempts it.
  transport     transport_kind,
  thread_id     text,
  sent_at       timestamptz,
  CONSTRAINT drafts_sent_is_attributed CHECK (
    status <> 'sent'
    OR (sent_at IS NOT NULL AND (channel = 'linkedin' OR transport IS NOT NULL))
  ),
  CONSTRAINT drafts_linkedin_has_no_transport CHECK (
    channel <> 'linkedin' OR transport IS NULL
  ),

  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX drafts_contact_idx ON drafts (contact_id, created_at DESC);
CREATE INDEX drafts_open_idx ON drafts (status, updated_at DESC) WHERE status = 'draft';

-- INV-8. A saved search is criteria plus the query text and URL built from
-- them. The operator opens the URL in their own browser and runs the search
-- under their own account. Nothing in this system fetches it.
CREATE TABLE saved_searches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  side        market_side NOT NULL,
  channel     search_channel NOT NULL,
  criteria    jsonb NOT NULL,
  query_text  text NOT NULL,
  url         text NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  UNIQUE (name)
);

-- Research output, with its sources. Market figures are investor-material
-- claims (section 13), so a claim without a source URL and a fetch time is not
-- usable in copy, and this table is what makes that checkable.
CREATE TABLE research_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id    uuid REFERENCES firms (id) ON DELETE RESTRICT,
  contact_id uuid REFERENCES contacts (id) ON DELETE RESTRICT,
  headline   text NOT NULL,
  body       text NOT NULL,
  -- [{ "url": ..., "title": ..., "fetched_at": ... }]
  sources    jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider   text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT research_notes_has_subject CHECK (firm_id IS NOT NULL OR contact_id IS NOT NULL)
);
CREATE INDEX research_notes_firm_idx ON research_notes (firm_id, created_at DESC);
CREATE INDEX research_notes_contact_idx ON research_notes (contact_id, created_at DESC);

-- Section 11. Counsel sign-off is a record, not a config flag someone sets
-- because a launch is due. The trigger below reads this table.
CREATE TABLE counsel_signoffs (
  item        text PRIMARY KEY,
  signed_off  boolean NOT NULL DEFAULT false,
  counsel     text NOT NULL,
  reference   text,
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- One row. The boolean primary key is the idiom for a singleton settings table.
CREATE TABLE automation_settings (
  id                    boolean PRIMARY KEY DEFAULT true CHECK (id),

  -- The master switch for warm sequence dispatch.
  sequences_enabled     boolean NOT NULL DEFAULT false,
  daily_send_cap        integer NOT NULL DEFAULT 40 CHECK (daily_send_cap >= 0),
  -- Local to send_timezone. Dispatch outside the window does nothing.
  send_window_start     time NOT NULL DEFAULT '08:00',
  send_window_end       time NOT NULL DEFAULT '17:00',
  -- ISO weekday numbers, 1 Monday through 7 Sunday.
  send_days             integer[] NOT NULL DEFAULT '{1,2,3,4,5}',
  send_timezone         text NOT NULL DEFAULT 'America/New_York',

  -- Section 11, gated on Lowenstein Sandler. Defaults off, and the trigger
  -- below refuses to switch it on without a recorded sign-off.
  cold_outreach_enabled boolean NOT NULL DEFAULT false,

  digest_enabled        boolean NOT NULL DEFAULT true,
  digest_hour           integer NOT NULL DEFAULT 7 CHECK (digest_hour BETWEEN 0 AND 23),
  digest_timezone       text NOT NULL DEFAULT 'America/New_York',

  updated_by            text NOT NULL DEFAULT 'system',
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_settings_window_ordered CHECK (send_window_start < send_window_end)
);

CREATE OR REPLACE FUNCTION automation_settings_cold_needs_signoff() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.cold_outreach_enabled AND NOT COALESCE(OLD.cold_outreach_enabled, false) THEN
    IF NOT EXISTS (
      SELECT 1 FROM counsel_signoffs
      WHERE item = 'rule_506c_cold_outreach' AND signed_off
    ) THEN
      RAISE EXCEPTION
        'Section 11: cold outreach is gated on written outside counsel sign-off. '
        'Record it in counsel_signoffs first.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER automation_settings_cold_needs_signoff
  BEFORE INSERT OR UPDATE ON automation_settings
  FOR EACH ROW EXECUTE FUNCTION automation_settings_cold_needs_signoff();

INSERT INTO automation_settings (id) VALUES (true);

-- The digest carries prospect data to an internal reader. It is not outreach,
-- it does not run the send pipeline, and its recipients are constrained here
-- so that it can never be pointed at a prospect by a typo or a bad update.
CREATE TABLE internal_domains (
  domain     citext PRIMARY KEY,
  added_by   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO internal_domains (domain, added_by) VALUES ('depinfin.com', 'migration:0006');

CREATE TABLE digest_recipients (
  address    citext PRIMARY KEY,
  label      text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  added_by   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION digest_recipients_internal_only() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  -- Not named `domain`: plpgsql would not know whether that meant the variable
  -- or internal_domains.domain, and would refuse to compile the function.
  recipient_domain citext;
BEGIN
  recipient_domain := split_part(NEW.address::text, '@', 2)::citext;
  IF recipient_domain = ''
     OR NOT EXISTS (SELECT 1 FROM internal_domains d WHERE d.domain = recipient_domain) THEN
    RAISE EXCEPTION
      'The daily digest carries prospect data and goes to internal addresses only. % is not on an internal domain.',
      NEW.address
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER digest_recipients_internal_only
  BEFORE INSERT OR UPDATE ON digest_recipients
  FOR EACH ROW EXECUTE FUNCTION digest_recipients_internal_only();

INSERT INTO digest_recipients (address, label, added_by)
VALUES ('cole@depinfin.com', 'Cole Bartlett', 'migration:0006');

-- Grants. Same posture as 0003: the application role gets what it needs and
-- nothing more, and anything append-only stays append-only.
GRANT SELECT, INSERT, UPDATE ON drafts TO depinfin_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_searches TO depinfin_app;
GRANT SELECT, INSERT ON research_notes TO depinfin_app;
GRANT SELECT, UPDATE ON automation_settings TO depinfin_app;
GRANT SELECT, INSERT, UPDATE ON digest_recipients TO depinfin_app;
GRANT SELECT ON internal_domains TO depinfin_app;
-- Read only. A sign-off is recorded by a person with database access, out of
-- band from the application, which is the point of it being a gate.
GRANT SELECT ON counsel_signoffs TO depinfin_app;
