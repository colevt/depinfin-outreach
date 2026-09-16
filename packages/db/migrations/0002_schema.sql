-- 0002. Schema. Section 4 of CLAUDE.md.

CREATE TYPE firm_type AS ENUM (
  'single_family_office', 'multi_family_office', 'ria', 'ocio',
  'crypto_fund', 'rwa_fund', 'infra_fund', 'individual_hnw', 'ecosystem_principal'
);
CREATE TYPE aum_band AS ENUM ('under_100m', '100m_500m', '500m_1b', 'over_1b');
CREATE TYPE jurisdiction AS ENUM ('us', 'non_us', 'eu', 'uk', 'eea');
CREATE TYPE decision_speed AS ENUM ('fast', 'medium', 'slow');
CREATE TYPE depin_familiarity AS ENUM ('high', 'medium', 'none');
CREATE TYPE email_status AS ENUM ('unverified', 'valid', 'invalid', 'bounced');
CREATE TYPE decision_role AS ENUM ('principal', 'cio', 'analyst', 'gatekeeper');
CREATE TYPE transport_kind AS ENUM ('warm', 'cold');
CREATE TYPE enrollment_status AS ENUM (
  'not_started', 'active', 'paused', 'replied', 'stopped', 'completed', 'manual_only'
);
CREATE TYPE suppression_match_type AS ENUM ('email', 'domain');
CREATE TYPE activity_action AS ENUM (
  'sent', 'skipped', 'blocked', 'error', 'reply', 'opt_out',
  'stage_change', 'enrolled', 'unenrolled', 'rescored'
);

-- INV-6. Two content tiers, and they never meet.
CREATE TYPE content_tier AS ENUM ('corporate', 'offering');

CREATE TABLE firms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  type               firm_type,
  aum_band           aum_band,
  domicile_country   text,
  domicile_region    text,
  jurisdiction       jurisdiction NOT NULL,
  mandate_tags       text[] NOT NULL DEFAULT '{}',
  typical_ticket_usd numeric,
  decision_speed     decision_speed,
  depin_familiarity  depin_familiarity,
  source             text,
  score              integer,
  tier               integer CHECK (tier IN (1, 2, 3)),
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id           uuid NOT NULL REFERENCES firms (id) ON DELETE RESTRICT,
  first_name        text NOT NULL,
  last_name         text,
  title             text,
  email             citext UNIQUE,
  email_status      email_status NOT NULL DEFAULT 'unverified',
  linkedin_url      text,
  decision_role     decision_role,
  -- INV-3 gate. A record without a specific, verifiable reason for contact
  -- is a name, not a prospect.
  personal_reason   text,
  warm_path_contact text,
  do_not_contact    boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_firm_id_idx ON contacts (firm_id);

-- INV-6. Corporate content only. The check constraint is the hard stop; the
-- default exists so a forgotten column cannot quietly become offering content.
CREATE TABLE templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text NOT NULL UNIQUE,
  subject      text NOT NULL,
  body         text NOT NULL,
  content_tier content_tier NOT NULL DEFAULT 'corporate'
               CONSTRAINT templates_corporate_only CHECK (content_tier = 'corporate'),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- INV-6. Offering material. No foreign key to sequence_steps, no foreign key
-- from sequence_steps to here, and no join table. There is no valid join.
-- Access is gated on a verified accredited investor record, which is out of
-- scope for v1 (section 10), so nothing in this repo reads this table.
CREATE TABLE offering_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  storage_ref  text NOT NULL,
  content_tier content_tier NOT NULL DEFAULT 'offering'
               CONSTRAINT offering_documents_offering_only CHECK (content_tier = 'offering'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sequences (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL,
  -- INV-9. The campaign carries its transport, and the adapter must match.
  transport transport_kind NOT NULL,
  max_steps integer NOT NULL DEFAULT 5 CHECK (max_steps > 0),
  active    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sequence_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     uuid NOT NULL REFERENCES sequences (id) ON DELETE CASCADE,
  step_number     integer NOT NULL CHECK (step_number > 0),
  delay_days      integer NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  -- INV-6. templates is the only table a step can reference for content.
  template_id     uuid NOT NULL REFERENCES templates (id) ON DELETE RESTRICT,
  reply_in_thread boolean NOT NULL DEFAULT true,
  UNIQUE (sequence_id, step_number)
);

CREATE TABLE enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   uuid NOT NULL REFERENCES contacts (id) ON DELETE RESTRICT,
  sequence_id  uuid NOT NULL REFERENCES sequences (id) ON DELETE RESTRICT,
  status       enrollment_status NOT NULL DEFAULT 'not_started',
  current_step integer NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  last_sent_at timestamptz,
  next_due_at  timestamptz,
  thread_id    text,
  replied_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, sequence_id)
);
CREATE INDEX enrollments_due_idx ON enrollments (status, next_due_at);

CREATE TABLE suppressions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value              citext NOT NULL,
  match_type         suppression_match_type NOT NULL,
  reason             text NOT NULL,
  actor              text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  active             boolean NOT NULL DEFAULT true,
  deactivated_at     timestamptz,
  deactivated_by     text,
  deactivation_reason text,
  UNIQUE (value, match_type),
  CONSTRAINT suppressions_deactivation_attributed CHECK (
    active OR (deactivated_by IS NOT NULL AND deactivation_reason IS NOT NULL)
  )
);
CREATE INDEX suppressions_active_idx ON suppressions (match_type, value) WHERE active;

CREATE TABLE activity_log (
  id           bigserial PRIMARY KEY,
  occurred_at  timestamptz NOT NULL DEFAULT now(),
  actor        text NOT NULL,
  contact_id   uuid REFERENCES contacts (id) ON DELETE RESTRICT,
  enrollment_id uuid REFERENCES enrollments (id) ON DELETE RESTRICT,
  action       activity_action NOT NULL,
  template_key text,
  detail       jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX activity_log_contact_idx ON activity_log (contact_id, occurred_at DESC);
CREATE INDEX activity_log_action_idx ON activity_log (action, occurred_at DESC);
-- Gate 12 counts the day's sends from this index, never from memory.
CREATE INDEX activity_log_sent_day_idx ON activity_log (occurred_at) WHERE action = 'sent';

-- INV-7. Configurable, but still enforced at the query layer: the candidate
-- view joins against this table. packages/compliance exports the same default
-- set and a test asserts the two stay in step.
CREATE TABLE excluded_jurisdictions (
  jurisdiction jurisdiction PRIMARY KEY,
  reason       text NOT NULL,
  added_at     timestamptz NOT NULL DEFAULT now()
);
