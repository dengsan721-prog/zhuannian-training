begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'cohorts', 'cohorts table exists');
select has_table('public', 'cohort_invites', 'cohort invites table exists');
select has_table('public', 'cohort_memberships', 'cohort memberships table exists');
select has_table('public', 'scenes', 'scenes table exists');
select has_table('public', 'scene_versions', 'scene versions table exists');
select has_table('public', 'training_sessions', 'training sessions table exists');
select has_table('public', 'training_completions', 'training completions table exists');
select has_table('public', 'follow_up_reviews', 'follow-up reviews table exists');
select has_table('public', 'saved_insights', 'saved insights table exists');
select has_table('public', 'user_badges', 'user badges table exists');

select enum_has_labels('public', 'app_role', array[
  'participant','coach','supervisor','content_author','professional_reviewer',
  'safety_reviewer','privacy_officer','auditor','system_admin'
], 'app roles are exact');
select enum_has_labels('public', 'content_status', array[
  'draft','in_review','changes_requested','approved','published','paused','blocked','emergency_withdrawn','retired'
], 'content statuses are exact');
select enum_has_labels('public', 'risk_level', array['standard','caution','stop'], 'risk levels are exact');

select has_column('public', 'scene_versions', 'payload', 'scene version contains payload');
select col_type_is('public', 'scene_versions', 'payload', 'jsonb', 'scene payload is jsonb');
select col_is_unique('public', 'scene_versions', array['scene_id','version'], 'scene versions are immutable numbered revisions');
select col_is_unique('public', 'training_sessions', array['user_id','idempotency_key'], 'session requests are idempotent per user');
select col_is_unique('public', 'training_completions', array['session_id'], 'one completion per session');
select col_is_unique('public', 'training_completions', array['user_id','idempotency_key'], 'completion requests are idempotent per user');
select col_is_unique('public', 'follow_up_reviews', array['completion_id'], 'one follow-up review per completion');
select fk_ok('public','training_completions',array['session_id'],'public','training_sessions',array['id'],'completion references its session');
select fk_ok('public','training_completions',array['scene_version_id'],'public','scene_versions',array['id'],'completion pins a scene version');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.cohorts'::regclass), 'cohorts uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.cohort_invites'::regclass), 'cohort_invites uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.cohort_memberships'::regclass), 'cohort_memberships uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.scenes'::regclass), 'scenes uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.scene_versions'::regclass), 'scene_versions uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.training_sessions'::regclass), 'training_sessions uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.training_completions'::regclass), 'training_completions uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.follow_up_reviews'::regclass), 'follow_up_reviews uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.saved_insights'::regclass), 'saved_insights uses RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.user_badges'::regclass), 'user_badges uses RLS');

select * from finish();
rollback;
