-- MYLIT beta schema: profiles, progress sync, analytics, feedback

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age_range text,
  onboarding_complete boolean not null default false,
  path_focus text,
  beta_invite_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- daily_snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.daily_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  energy_score int,
  mode text,
  sleep_hours numeric,
  mood_score int,
  stress_score int,
  total_steps int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- quest_events
-- ---------------------------------------------------------------------------
create table if not exists public.quest_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  source text,
  title text not null,
  kind text,
  steps int not null default 0,
  duration_minutes int,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  missed_at timestamptz,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  unique (user_id, local_id)
);

-- ---------------------------------------------------------------------------
-- scheduled_items
-- ---------------------------------------------------------------------------
create table if not exists public.scheduled_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text,
  title text not null,
  source text,
  kind text,
  steps int not null default 0,
  duration_minutes int,
  scheduled_for date,
  scheduled_time text,
  weekdays text[],
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

-- ---------------------------------------------------------------------------
-- app_events
-- ---------------------------------------------------------------------------
create table if not exists public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  event_name text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  page text,
  rating int,
  message text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists scheduled_items_set_updated_at on public.scheduled_items;
create trigger scheduled_items_set_updated_at
before update on public.scheduled_items
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.daily_snapshots enable row level security;
alter table public.quest_events enable row level security;
alter table public.scheduled_items enable row level security;
alter table public.app_events enable row level security;
alter table public.feedback enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- daily_snapshots
drop policy if exists "daily_snapshots_select_own" on public.daily_snapshots;
create policy "daily_snapshots_select_own"
  on public.daily_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "daily_snapshots_insert_own" on public.daily_snapshots;
create policy "daily_snapshots_insert_own"
  on public.daily_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "daily_snapshots_update_own" on public.daily_snapshots;
create policy "daily_snapshots_update_own"
  on public.daily_snapshots for update
  using (auth.uid() = user_id);

drop policy if exists "daily_snapshots_delete_own" on public.daily_snapshots;
create policy "daily_snapshots_delete_own"
  on public.daily_snapshots for delete
  using (auth.uid() = user_id);

-- quest_events
drop policy if exists "quest_events_select_own" on public.quest_events;
create policy "quest_events_select_own"
  on public.quest_events for select
  using (auth.uid() = user_id);

drop policy if exists "quest_events_insert_own" on public.quest_events;
create policy "quest_events_insert_own"
  on public.quest_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "quest_events_update_own" on public.quest_events;
create policy "quest_events_update_own"
  on public.quest_events for update
  using (auth.uid() = user_id);

drop policy if exists "quest_events_delete_own" on public.quest_events;
create policy "quest_events_delete_own"
  on public.quest_events for delete
  using (auth.uid() = user_id);

-- scheduled_items
drop policy if exists "scheduled_items_select_own" on public.scheduled_items;
create policy "scheduled_items_select_own"
  on public.scheduled_items for select
  using (auth.uid() = user_id);

drop policy if exists "scheduled_items_insert_own" on public.scheduled_items;
create policy "scheduled_items_insert_own"
  on public.scheduled_items for insert
  with check (auth.uid() = user_id);

drop policy if exists "scheduled_items_update_own" on public.scheduled_items;
create policy "scheduled_items_update_own"
  on public.scheduled_items for update
  using (auth.uid() = user_id);

drop policy if exists "scheduled_items_delete_own" on public.scheduled_items;
create policy "scheduled_items_delete_own"
  on public.scheduled_items for delete
  using (auth.uid() = user_id);

-- app_events (insert only for authenticated users on own rows)
drop policy if exists "app_events_insert_own" on public.app_events;
create policy "app_events_insert_own"
  on public.app_events for insert
  with check (auth.uid() = user_id);

-- feedback (insert only for authenticated users on own rows)
drop policy if exists "feedback_insert_own" on public.feedback;
create policy "feedback_insert_own"
  on public.feedback for insert
  with check (auth.uid() = user_id);
