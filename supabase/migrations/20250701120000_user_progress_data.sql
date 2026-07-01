-- Per-key progress blobs for cross-device MYLIT sync (local-first AsyncStorage mirror).

create table if not exists public.user_progress_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  storage_key text not null,
  payload text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, storage_key)
);

create index if not exists user_progress_data_user_updated_idx
  on public.user_progress_data (user_id, updated_at desc);

alter table public.user_progress_data enable row level security;

drop policy if exists "user_progress_data_select_own" on public.user_progress_data;
create policy "user_progress_data_select_own"
  on public.user_progress_data for select
  using (auth.uid() = user_id);

drop policy if exists "user_progress_data_insert_own" on public.user_progress_data;
create policy "user_progress_data_insert_own"
  on public.user_progress_data for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_progress_data_update_own" on public.user_progress_data;
create policy "user_progress_data_update_own"
  on public.user_progress_data for update
  using (auth.uid() = user_id);

drop policy if exists "user_progress_data_delete_own" on public.user_progress_data;
create policy "user_progress_data_delete_own"
  on public.user_progress_data for delete
  using (auth.uid() = user_id);

drop trigger if exists user_progress_data_set_updated_at on public.user_progress_data;
create trigger user_progress_data_set_updated_at
before update on public.user_progress_data
for each row execute function public.set_updated_at();
