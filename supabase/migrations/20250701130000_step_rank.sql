-- Cross-player step ranking: stores each user's total earned steps and
-- exposes only a computed rank via a SECURITY DEFINER function, so a user
-- can compare their standing against every other player without gaining
-- row-level SELECT access to anyone else's data (consistent with the rest
-- of this schema's "select own only" RLS policies).

create table if not exists public.user_step_totals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  total_steps int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_step_totals enable row level security;

drop policy if exists "user_step_totals_select_own" on public.user_step_totals;
create policy "user_step_totals_select_own"
  on public.user_step_totals for select
  using (auth.uid() = user_id);

drop policy if exists "user_step_totals_insert_own" on public.user_step_totals;
create policy "user_step_totals_insert_own"
  on public.user_step_totals for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_step_totals_update_own" on public.user_step_totals;
create policy "user_step_totals_update_own"
  on public.user_step_totals for update
  using (auth.uid() = user_id);

drop trigger if exists user_step_totals_set_updated_at on public.user_step_totals;
create trigger user_step_totals_set_updated_at
before update on public.user_step_totals
for each row execute function public.set_updated_at();

-- Upserts the caller's total steps, then returns their 1-based rank among all
-- players (most steps = rank 1; ties share the same rank) plus how many
-- players currently have a synced total. security definer lets this compare
-- against every row while RLS above still blocks direct cross-user reads.
create or replace function public.sync_and_rank_my_steps(p_total_steps int)
returns table(rank int, total_players int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sync_and_rank_my_steps requires an authenticated user';
  end if;

  insert into public.user_step_totals (user_id, total_steps)
  values (auth.uid(), greatest(p_total_steps, 0))
  on conflict (user_id) do update
    set total_steps = greatest(excluded.total_steps, 0), updated_at = now();

  return query
    select
      (select count(*)::int + 1
         from public.user_step_totals u
        where u.total_steps > mine.total_steps) as rank,
      (select count(*)::int from public.user_step_totals) as total_players
    from public.user_step_totals mine
    where mine.user_id = auth.uid();
end;
$$;

grant execute on function public.sync_and_rank_my_steps(int) to authenticated;
