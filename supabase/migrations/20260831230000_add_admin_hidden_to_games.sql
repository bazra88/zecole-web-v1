alter table public.games
  add column if not exists admin_hidden boolean not null default false;

create index if not exists games_admin_visible_created_idx
  on public.games (created_at desc)
  where active = true and admin_hidden = false;

comment on column public.games.admin_hidden is
  'Reversible administrator hide flag. Hidden games remain stored but are excluded from public pages.';
