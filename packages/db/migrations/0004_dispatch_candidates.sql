-- 0004. INV-1, INV-4, INV-7 at the query layer.
--
-- The dispatcher selects from this view and from nothing else. A Tier 1
-- contact, a manual_only enrollment, a suppressed address, a suppressed
-- domain, a do-not-contact flag, and an excluded jurisdiction are not filtered
-- out after the fact, they are never in the result set. There is no code path
-- that reaches them because there is no row to reach.
--
-- packages/compliance re-checks every one of these. That redundancy is the
-- point: the view protects the scheduled dispatcher, the gates protect any
-- hand-built call.

CREATE VIEW dispatch_candidates AS
SELECT
  e.id                AS enrollment_id,
  e.status            AS enrollment_status,
  e.current_step,
  e.last_sent_at,
  e.next_due_at,
  e.thread_id,
  s.id                AS sequence_id,
  s.name              AS sequence_name,
  s.transport         AS sequence_transport,
  s.max_steps,
  st.id               AS step_id,
  st.step_number,
  st.delay_days,
  st.reply_in_thread,
  t.id                AS template_id,
  t.key               AS template_key,
  t.subject           AS template_subject,
  t.body              AS template_body,
  t.content_tier      AS template_content_tier,
  c.id                AS contact_id,
  c.email,
  c.first_name,
  c.last_name,
  c.title,
  c.personal_reason,
  c.do_not_contact,
  f.id                AS firm_id,
  f.name              AS firm_name,
  f.tier,
  f.jurisdiction
FROM enrollments e
JOIN sequences s  ON s.id = e.sequence_id AND s.active
JOIN sequence_steps st
                  ON st.sequence_id = s.id
                 AND st.step_number = e.current_step + 1
JOIN templates t  ON t.id = st.template_id
JOIN contacts c   ON c.id = e.contact_id
JOIN firms f      ON f.id = c.firm_id
WHERE
  -- Section 5. Only an active sequence dispatches. replied and stopped are
  -- terminal, paused and not_started wait on an operator.
  e.status = 'active'

  -- INV-1. Tier 1 and manual_only are structurally ineligible.
  AND e.status <> 'manual_only'
  AND (f.tier IS NULL OR f.tier <> 1)

  -- INV-4. do_not_contact, plus suppression on the full address and on the
  -- bare domain, evaluated here rather than in application code.
  AND c.do_not_contact = false
  AND c.email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM suppressions sup
    WHERE sup.active
      AND (
        (sup.match_type = 'email'  AND sup.value = c.email)
        OR (sup.match_type = 'domain' AND sup.value = split_part(c.email::text, '@', 2)::citext)
      )
  )

  -- INV-7. Excluded jurisdictions, warm human contact only.
  AND NOT EXISTS (
    SELECT 1 FROM excluded_jurisdictions ex WHERE ex.jurisdiction = f.jurisdiction
  )

  -- INV-6. Corporate content only. Redundant with the check constraint on
  -- templates, and kept because redundancy here is free.
  AND t.content_tier = 'corporate'

  -- Section 6 gate 7. Steps remaining.
  AND e.current_step < s.max_steps;

GRANT SELECT ON dispatch_candidates TO depinfin_app;

COMMENT ON VIEW dispatch_candidates IS
  'INV-1, INV-4, INV-7. The only source of rows for automated dispatch. Do not '
  'assemble candidates from the base tables. Section 6 gate 6 (step due) and '
  'gate 12 (daily cap) are applied by the dispatcher, everything else is here.';
