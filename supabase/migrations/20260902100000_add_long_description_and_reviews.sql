alter table public.games
  add column if not exists description_long text,
  add column if not exists description_long_ko text;

create table if not exists public.game_reviews (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  meta_review_id text not null,
  reviewer_label text not null,
  rating smallint check (rating is null or (rating >= 1 and rating <= 5)),
  title_original text,
  body_original text,
  title_ko text,
  body_ko text,
  helpful_count integer,
  reviewed_at timestamptz,
  source text not null default 'meta_store',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, meta_review_id)
);

create index if not exists game_reviews_game_id_idx
  on public.game_reviews (game_id);

alter table public.game_reviews enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'game_reviews'
      and policyname = 'Public read access for active game reviews'
  ) then
    create policy "Public read access for active game reviews"
      on public.game_reviews
      for select
      to public
      using (active = true);
  end if;
end
$$;

grant all privileges on table public.game_reviews
  to anon, authenticated, service_role;
