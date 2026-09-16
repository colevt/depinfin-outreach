-- 0007. Templates per prospect type, and a channel that cannot be crossed.
--
-- The desk needs LinkedIn message templates as well as email templates, and
-- they live in the same table so targeting and the content_tier check apply to
-- both. That creates a hazard worth closing in the schema rather than in a
-- code review: a LinkedIn template attached to a sequence step would be
-- emailed by the dispatcher, subject line and all.
--
-- The composite foreign key below makes that impossible. A sequence step
-- carries the channel it requires, that channel is checked to be 'email', and
-- the step references (template_id, channel) rather than template_id alone.
-- A LinkedIn template has no matching row to reference.

ALTER TABLE templates
  ADD COLUMN channel draft_channel NOT NULL DEFAULT 'email',
  -- An email template needs a subject. A LinkedIn message has none.
  ADD CONSTRAINT templates_email_has_subject CHECK (
    channel <> 'email' OR btrim(subject) <> ''
  );

ALTER TABLE templates ADD CONSTRAINT templates_id_channel_key UNIQUE (id, channel);

ALTER TABLE sequence_steps
  ADD COLUMN template_channel draft_channel NOT NULL DEFAULT 'email'
    CONSTRAINT sequence_steps_email_only CHECK (template_channel = 'email'),
  ADD CONSTRAINT sequence_steps_template_channel_fkey
    FOREIGN KEY (template_id, template_channel) REFERENCES templates (id, channel);

-- Corporate content, section 13 conventions, and each one passes the INV-2
-- linter as written. An edit has to pass it too. No percentages, no
-- return-implying language, no em dashes, the SPV is the issuer of record,
-- and DePINfin is a software and administrative tooling provider.
--
-- None of these contains an opt-out phrase. Opt-out detection reads the whole
-- inbound body including quoted history, so a phrase in our own copy comes
-- back on every ordinary reply and reads as an opt-out.

INSERT INTO templates (key, side, stage, channel, audience_firm_types, subject, body, notes) VALUES
(
  'buy_crypto_native_intro',
  'buy', 'first_touch', 'email',
  ARRAY['crypto_fund', 'rwa_fund', 'ecosystem_principal']::firm_type[],
  '{{first_name}}, the gap between the token and the hardware',
  E'Hi {{first_name}},\n\n'
  'I am reaching out because {{personal_reason}}.\n\n'
  'You already know what these networks are, so I will skip the explainer. The part '
  'we work on is narrower: a network token is an entry in that network''s own ledger, '
  'and it gives its holder nothing enforceable against the machines or the contracts '
  'underneath. DePINfin builds the non-custodial software and administrative tooling '
  'that puts those assets in an entity where a claim actually attaches. The SPV is the '
  'issuer of record, not the operator and not us.\n\n'
  'Worth a conversation with {{firm_name}}? No materials, just how we think about it.\n\n'
  'Cole',
  'For people who need no introduction to the category. Leads with the ownership gap.'
),
(
  'buy_family_office_intro',
  'buy', 'first_touch', 'email',
  ARRAY['single_family_office', 'multi_family_office', 'individual_hnw']::firm_type[],
  '{{first_name}}, infrastructure with a counterparty',
  E'Hi {{first_name}},\n\n'
  'I am reaching out because {{personal_reason}}.\n\n'
  'We build software and administrative tooling for financing physical infrastructure: '
  'wireless networks, compute, and energy hardware that is already deployed and already '
  'producing contracted revenue. Each financing sits in its own SPV, which is the issuer '
  'of record, so there is a defined legal counterparty rather than a protocol.\n\n'
  'If that shape is familiar to {{firm_name}}, I would value twenty minutes.\n\n'
  'Cole',
  'Leads with the asset and the counterparty. Avoids category jargon entirely.'
),
(
  'buy_adviser_intro',
  'buy', 'first_touch', 'email',
  ARRAY['ria', 'ocio']::firm_type[],
  '{{first_name}}, a question about your alternatives sleeve',
  E'Hi {{first_name}},\n\n'
  'I am reaching out because {{personal_reason}}.\n\n'
  'DePINfin is a non-custodial software and administrative tooling provider for financing '
  'physical infrastructure. What usually matters to an adviser is the operational side: '
  'each offering is a separate SPV that is the issuer of record, with its own '
  'documentation and its own administration, handled by the operator''s counsel.\n\n'
  'If it is useful, I can walk {{firm_name}} through how the process actually runs.\n\n'
  'Cole',
  'Their constraint is operational, not thematic. Leads with documentation and process.'
),
(
  'buy_infra_fund_intro',
  'buy', 'first_touch', 'email',
  ARRAY['infra_fund']::firm_type[],
  '{{first_name}}, a new origination channel for deployed assets',
  E'Hi {{first_name}},\n\n'
  'I am reaching out because {{personal_reason}}.\n\n'
  'You underwrite physical infrastructure already. What is new here is the origination '
  'channel: these networks publish uptime, utilization, and settlement history before any '
  'capital is raised, which is unusual for assets this early. DePINfin provides the '
  'software and administrative tooling, and each financing is issued by its own SPV.\n\n'
  'Happy to show {{firm_name}} what the asset-level data looks like.\n\n'
  'Cole',
  'They will diligence like an infra fund. Leads with operating data and asset economics.'
),
(
  'buy_followup_structure',
  'buy', 'follow_up', 'email',
  ARRAY[]::firm_type[],
  'Following up, {{first_name}}',
  E'Hi {{first_name}},\n\n'
  'Following up on my earlier note. The one line version: we are the software and '
  'administrative layer for financing infrastructure that is already deployed and already '
  'producing contracted revenue, and the SPV is the issuer of record rather than the '
  'operator.\n\n'
  'If the timing is wrong, say so and I will leave it there. If it is not, I am glad to '
  'find twenty minutes.\n\n'
  'Cole',
  'General second touch. Restates the model in one line and offers an easy exit.'
),
(
  'buy_reply_thanks',
  'buy', 'reply', 'email',
  ARRAY[]::firm_type[],
  'Re: {{first_name}}',
  E'Hi {{first_name}},\n\n'
  'Thanks for coming back to me.\n\n'
  '[Answer their actual question here before anything else. Delete this line.]\n\n'
  'Cole',
  'A skeleton, not a script. A reply that ignores what they asked is worse than no reply.'
),
(
  'sell_operator_intro',
  'sell', 'first_touch', 'email',
  ARRAY[]::firm_type[],
  '{{first_name}}, financing the hardware at {{firm_name}}',
  E'Hi {{first_name}},\n\n'
  'I am reaching out because {{personal_reason}}.\n\n'
  'DePINfin builds software and administrative tooling for operators who need to finance '
  'hardware without selling more of the network. The structure is an SPV that is the '
  'issuer of record, with the legal work done by your counsel, and we are non-custodial '
  'throughout.\n\n'
  'If capital for hardware is on your list this year, I would like to understand how you '
  'fund it today.\n\n'
  'Cole',
  'Sell side. Tracked but not a focus. Leads with the operator''s own constraint.'
)
ON CONFLICT (key) DO NOTHING;

-- LinkedIn message templates. Shorter, no subject, and structurally incapable
-- of being attached to a sequence step. A human sends these (INV-8).
INSERT INTO templates (key, side, stage, channel, audience_firm_types, subject, body, notes) VALUES
(
  'li_buy_crypto_native',
  'buy', 'first_touch', 'linkedin',
  ARRAY['crypto_fund', 'rwa_fund', 'ecosystem_principal']::firm_type[],
  '',
  E'{{first_name}}, {{personal_reason}}. I work on the gap between holding a network token '
  'and having an enforceable claim on the hardware underneath it. Curious whether that is '
  'something {{firm_name}} has looked at.',
  'Two sentences. Anything longer gets skimmed.'
),
(
  'li_buy_generalist',
  'buy', 'first_touch', 'linkedin',
  ARRAY[]::firm_type[],
  '',
  E'{{first_name}}, {{personal_reason}}. We build software for financing physical '
  'infrastructure that is already deployed and producing contracted revenue. Worth a short '
  'conversation?',
  'Default LinkedIn opener when there is no type-specific one.'
)
ON CONFLICT (key) DO NOTHING;
