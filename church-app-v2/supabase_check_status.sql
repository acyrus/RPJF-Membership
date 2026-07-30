-- ============================================================
-- RPJF Membership — read-only status check
-- Paste into Supabase → SQL Editor → Run. Changes nothing.
-- Each row shows whether a migration's object exists yet. For any that come back
-- FALSE, run the matching migration file (see the mapping in chat / below).
-- ============================================================
select 'members.interaction_type  (member_info.sql)'            as item,
       exists(select 1 from information_schema.columns where table_name='members'  and column_name='interaction_type') as present
union all select 'profiles.require_2fa  (require_2fa.sql)',
       exists(select 1 from information_schema.columns where table_name='profiles' and column_name='require_2fa')
union all select 'profiles.tab_access  (tab_access.sql)',
       exists(select 1 from information_schema.columns where table_name='profiles' and column_name='tab_access')
union all select 'profiles.active_session  (single_session.sql)',
       exists(select 1 from information_schema.columns where table_name='profiles' and column_name='active_session')
union all select 'user_profiles_with_login.email  (user_email.sql)',
       exists(select 1 from information_schema.columns where table_name='user_profiles_with_login' and column_name='email')
union all select 'function import_members  (import_members.sql)',
       exists(select 1 from pg_proc where proname='import_members')
union all select 'function admin_clear_mfa  (admin_mfa.sql)',
       exists(select 1 from pg_proc where proname='admin_clear_mfa')
union all select 'function claim_session  (single_session.sql)',
       exists(select 1 from pg_proc where proname='claim_session')
union all select 'function approve_photo_submission  (usher_photos.sql)',
       exists(select 1 from pg_proc where proname='approve_photo_submission')
union all select 'table uncaptured_lists  (uncaptured_lists.sql)',
       exists(select 1 from information_schema.tables where table_name='uncaptured_lists')
union all select 'table uncaptured_assignments  (uncaptured_assignments.sql)',
       exists(select 1 from information_schema.tables where table_name='uncaptured_assignments')
order by item;
