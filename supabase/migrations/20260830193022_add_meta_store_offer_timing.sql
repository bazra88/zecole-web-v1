alter table public.games
  add column if not exists meta_store_original_price numeric,
  add column if not exists meta_store_offer_ends_at timestamptz,
  add column if not exists meta_store_show_timer boolean not null default false;

comment on column public.games.meta_store_original_price is
  'Original Meta Store price before an active store discount.';
comment on column public.games.meta_store_offer_ends_at is
  'End timestamp for the active Meta Store offer.';
comment on column public.games.meta_store_show_timer is
  'Whether Meta Store marks the active offer as countdown eligible.';
