alter table public.games
  add column if not exists admin_new_release_pinned boolean not null default false;

create index if not exists games_admin_new_release_pinned_idx
  on public.games (admin_new_release_pinned desc, release_date desc, created_at desc)
  where active = true and admin_hidden = false;

comment on column public.games.admin_new_release_pinned is
  'Administrator override that pins a visible active game into the home page new releases section.';
