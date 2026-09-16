-- 0005. INV-7 default exclusion set, and the corporate templates that ship
-- with the repo. Both are idempotent.

INSERT INTO excluded_jurisdictions (jurisdiction, reason) VALUES
  ('eu',  'GDPR lawful basis for third-party contact data is unresolved. Gated on counsel, CLAUDE.md section 11.'),
  ('uk',  'UK GDPR, same posture as EU. Gated on counsel, CLAUDE.md section 11.'),
  ('eea', 'EEA follows the GDPR posture. Gated on counsel, CLAUDE.md section 11.')
ON CONFLICT (jurisdiction) DO NOTHING;

-- Tier 1 corporate content only. Section 13 copy conventions apply: no
-- return-implying language, no percentages, no em dashes, the SPV is the
-- issuer of record, and DePINfin is a software and administrative tooling
-- provider. These pass the INV-2 linter as written. Any edit has to pass it too.
INSERT INTO templates (key, subject, body) VALUES
(
  'corporate_intro_1',
  '{{first_name}}, a note on DePIN infrastructure',
  E'Hi {{first_name}},\n\n'
  'I am reaching out because {{personal_reason}}.\n\n'
  'DePINfin builds non-custodial software and administrative tooling for '
  'decentralized physical infrastructure. Web3 token ownership is not legal '
  'asset ownership, and closing that gap is what we work on.\n\n'
  'If the category is interesting to {{firm_name}}, I am glad to walk through '
  'how we think about it. No materials attached, just a conversation.\n\n'
  'Cole'
),
(
  'corporate_followup_2',
  'Following up: DePIN infrastructure',
  E'Hi {{first_name}},\n\n'
  'Following up on my earlier note. The short version is that we provide the '
  'software layer for cash-flow-producing physical infrastructure, and the SPV '
  'is the issuer of record rather than the operator.\n\n'
  'Happy to send over how the model works at a corporate level if that is '
  'useful to you.\n\n'
  'Cole'
)
ON CONFLICT (key) DO NOTHING;
