create table if not exists public.game_media (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  media_type text not null check (media_type in ('trailer', 'screenshot')),
  url text not null,
  thumbnail_url text,
  width integer,
  height integer,
  sort_order integer not null default 0,
  source text not null default 'meta_store',
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (game_id, url)
);

create index if not exists game_media_game_id_idx
  on public.game_media (game_id);

alter table public.game_media enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_media'
      and policyname = 'Public read access for active game media'
  ) then
    create policy "Public read access for active game media"
      on public.game_media
      for select
      to public
      using (active = true);
  end if;
end
$$;

grant all privileges on table public.game_media
  to anon, authenticated, service_role;
