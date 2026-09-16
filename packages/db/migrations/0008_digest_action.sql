-- 0008. A log action for the internal digest.
--
-- In its own file because a new enum value cannot be used in the transaction
-- that adds it.
--
-- The digest needs its own action rather than reusing 'sent'. Gate 12 counts
-- the day's sends from activity_log WHERE action = 'sent', so a digest logged
-- as a send would eat into the daily cap on prospect mail, and one internal
-- mail a day would silently reduce what the dispatcher is allowed to do.
ALTER TYPE activity_action ADD VALUE IF NOT EXISTS 'digest';
