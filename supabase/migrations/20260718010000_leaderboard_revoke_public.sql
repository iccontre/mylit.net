-- Follow-up to 20260718000000_leaderboard.sql: PostgreSQL grants EXECUTE on a new function to
-- PUBLIC by default unless explicitly revoked. The prior migration only ever added a GRANT to
-- `authenticated` and never revoked the implicit PUBLIC grant, so both new functions were also
-- callable by the `anon` role — confirmed live: an unauthenticated request using only the
-- project's public anon key successfully returned real get_leaderboard_top3() data (top-3 rows,
-- already-safe/anonymized fields) and reached update_my_leaderboard_settings()'s function body
-- (where its own internal `auth.uid() is null` check correctly blocked it from writing anything
-- — so that function was never actually exploitable, but it should still require authentication
-- to invoke at all, matching the stated intent that these are authenticated-only RPCs).
--
-- Idempotent: revoking a privilege that isn't held is a safe no-op, so this can be re-run.

revoke execute on function public.get_leaderboard_top3() from public;
revoke execute on function public.update_my_leaderboard_settings(boolean, text) from public;

-- Re-assert the intended grant explicitly (already present from the prior migration; harmless
-- to restate for clarity/idempotency).
grant execute on function public.get_leaderboard_top3() to authenticated;
grant execute on function public.update_my_leaderboard_settings(boolean, text) to authenticated;
