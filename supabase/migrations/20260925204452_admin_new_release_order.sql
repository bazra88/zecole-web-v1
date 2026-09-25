alter table public.games add column admin_new_release_order integer
  check (admin_new_release_order is null or admin_new_release_order >= 0);

create or replace function public.save_new_release_order(p_ids uuid[], p_expected jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare current_snapshot jsonb;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 10000
    or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id)
    or p_expected is null then
    raise exception 'Invalid order';
  end if;
  -- Serialize order saves; lock pinned rows so pin removal cannot race the save.
  perform pg_catalog.pg_advisory_xact_lock(831725091);
  perform id from public.games where admin_new_release_pinned is true order by id for update;
  select coalesce(jsonb_object_agg(id::text, jsonb_build_object(
    'rank', admin_new_release_order, 'active', active, 'hidden', admin_hidden)), '{}'::jsonb)
    into current_snapshot from public.games where admin_new_release_pinned is true;
  if current_snapshot <> p_expected or
    (select array_agg(k order by k) from jsonb_object_keys(current_snapshot) k) is distinct from
    (select array_agg(id::text order by id::text) from unnest(p_ids) id) then
    raise exception 'Pinned games changed; reload before saving';
  end if;
  update public.games g set admin_new_release_order = o.position::integer - 1,
    updated_at = now()
    from unnest(p_ids) with ordinality as o(id, position) where g.id = o.id;
end;
$$;
revoke all on function public.save_new_release_order(uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.save_new_release_order(uuid[], jsonb) to service_role;
