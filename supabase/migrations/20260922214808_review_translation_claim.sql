alter table public.game_reviews add column if not exists translation_attempted_at timestamptz;

create or replace function public.claim_review_translations(p_game_id uuid)
returns setof public.game_reviews
language sql security invoker set search_path = public
as $$
  update public.game_reviews r set translation_attempted_at = now()
  where r.id in (
    select candidate.id from public.game_reviews candidate
    join public.games g on g.id = candidate.game_id
    where candidate.game_id = p_game_id and candidate.active and g.active and not g.admin_hidden
      and (candidate.translation_attempted_at is null or candidate.translation_attempted_at < now() - interval '24 hours')
      and ((nullif(btrim(candidate.title_original), '') is not null and nullif(btrim(candidate.title_ko), '') is null)
        or (nullif(btrim(candidate.body_original), '') is not null and nullif(btrim(candidate.body_ko), '') is null))
    order by candidate.helpful_count desc nulls last, candidate.reviewed_at desc nulls last, candidate.id
    limit 5 for update of candidate skip locked
  ) returning r.*;
$$;
revoke all on function public.claim_review_translations(uuid) from public, anon, authenticated;
grant execute on function public.claim_review_translations(uuid) to service_role;
