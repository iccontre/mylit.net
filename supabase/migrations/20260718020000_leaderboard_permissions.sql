-- Follow-up to 20260718000000_leaderboard.sql (already applied to production; NOT modified by
-- this migration — see below). PostgreSQL grants EXECUTE on a newly created function to PUBLIC
-- by default unless explicitly revoked; that prior migration only ever added a
-- GRANT ... TO authenticated and never revoked the implicit PUBLIC grant. Confirmed live against
-- production: an unauthenticated request using only the project's public anon key successfully
-- called get_leaderboard_top3() and received real data (already-safe/anonymized fields, so
-- nothing private was exposed, but this bypassed the client's own "only fetch when signed in"
-- gate and didn't match the stated authenticated-only intent), and reached
-- update_my_leaderboard_settings()'s function body (its own internal `auth.uid() is null` check,
-- untouched by this migration, correctly blocked it from writing anything — so it was never
-- actually exploitable, but should still require authentication to invoke at all).
--
-- Targeted at the exact two function signatures below only — confirmed from the source of the
-- already-applied migration, not modified here:
--   public.get_leaderboard_top3()                        -- no arguments
--   public.update_my_leaderboard_settings(boolean, text)  -- p_visible boolean, p_display_name text
--
-- Deliberately does NOT use REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public (would touch
-- unrelated functions, e.g. sync_and_rank_my_steps, outside this fix's scope) and does NOT alter
-- either function's body/SECURITY DEFINER/search_path — both remain exactly as applied in
-- 20260718000000_leaderboard.sql. Idempotent: revoking a privilege that isn't held, or granting
-- one that already is, is a safe no-op, so this can be re-run.
--
-- No ALTER DEFAULT PRIVILEGES here: that would need to target the specific database role that
-- owns future MYLIT function creations (e.g. via ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN
-- SCHEMA public ...), and this migration has no live way to confirm which role that is without
-- direct database inspection (no Supabase CLI/DB session is available in this environment).
-- Guessing the owning role risks either a silent no-op (wrong role) or an overly broad change
-- (right role, wrong assumption about what else it owns) — per instruction, skipped rather than
-- applied speculatively. Recommend a human confirm the owning role (e.g.
-- `select proowner::regrole from pg_proc where proname in ('get_leaderboard_top3',
-- 'update_my_leaderboard_settings');`) and add a scoped ALTER DEFAULT PRIVILEGES in a follow-up
-- migration if desired.

revoke execute on function public.get_leaderboard_top3() from public;
revoke execute on function public.get_leaderboard_top3() from anon;
grant execute on function public.get_leaderboard_top3() to authenticated;

revoke execute on function public.update_my_leaderboard_settings(boolean, text) from public;
revoke execute on function public.update_my_leaderboard_settings(boolean, text) from anon;
grant execute on function public.update_my_leaderboard_settings(boolean, text) to authenticated;
