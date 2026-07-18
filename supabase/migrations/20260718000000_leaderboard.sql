-- Privacy-safe Top 3 leaderboard, built on top of the existing user_step_totals table (see
-- 20250701130000_step_rank.sql). Adds opt-out visibility and an optional leaderboard-specific
-- display name, then exposes only the top 3 rows via a SECURITY DEFINER function so the client
-- never downloads or queries other users' raw rows directly (RLS above still blocks that).

alter table public.user_step_totals
  add column if not exists leaderboard_visible boolean not null default true,
  add column if not exists leaderboard_display_name text;

-- Updates only the caller's own privacy settings — never touches total_steps, so opening the
-- Rank page's leaderboard settings can never affect anyone's step total.
create or replace function public.update_my_leaderboard_settings(
  p_visible boolean,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'update_my_leaderboard_settings requires an authenticated user';
  end if;

  insert into public.user_step_totals (user_id, total_steps, leaderboard_visible, leaderboard_display_name)
  values (auth.uid(), 0, p_visible, nullif(trim(coalesce(p_display_name, '')), ''))
  on conflict (user_id) do update
    set leaderboard_visible = p_visible,
        leaderboard_display_name = nullif(trim(coalesce(p_display_name, '')), ''),
        updated_at = now();
end;
$$;

grant execute on function public.update_my_leaderboard_settings(boolean, text) to authenticated;

-- Returns exactly the top 3 opted-in players by authoritative total_steps. Deterministic tie
-- handling: higher total wins; ties broken by whoever reached that total earlier (updated_at
-- ascending, since total_steps only ever increases via sync_and_rank_my_steps' greatest()
-- ratchet, updated_at only moves forward when the total actually changed); final fallback is
-- stable user_id ordering. A row with no total_steps > 0 is excluded (nothing meaningful to
-- rank), which also keeps a freshly-created zero-total row from ever appearing as "top 3".
-- Anonymized fallback name is a deterministic 4-digit suffix derived from the user's own id, so
-- it never changes between calls for the same user.
create or replace function public.get_leaderboard_top3()
returns table(
  user_id uuid,
  display_name text,
  total_steps int,
  rank int,
  is_current_user boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select
      t.user_id,
      coalesce(
        nullif(trim(t.leaderboard_display_name), ''),
        'Explorer ' || (1000 + (('x' || substr(md5(t.user_id::text), 1, 6))::bit(24)::int % 9000))::text
      ) as display_name,
      t.total_steps,
      row_number() over (order by t.total_steps desc, t.updated_at asc, t.user_id asc)::int as rank,
      (t.user_id = auth.uid()) as is_current_user,
      t.updated_at
    from public.user_step_totals t
    where t.leaderboard_visible = true
      and t.total_steps > 0
    order by t.total_steps desc, t.updated_at asc, t.user_id asc
    limit 3;
end;
$$;

grant execute on function public.get_leaderboard_top3() to authenticated;
