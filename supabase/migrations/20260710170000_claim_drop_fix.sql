-- Fix claim_drop: the original RETURNS TABLE(claimed_count, allocation, status, position)
-- declared OUT variables whose names collide with premium_drops' own columns, so the
-- unqualified refs in the UPDATE ("claimed_count = claimed_count + 1", the CASE on status
-- / allocation) were ambiguous and raised at claim time. Return jsonb instead (no colliding
-- output vars) and fully qualify every column reference in the UPDATE.
-- Must DROP first: create-or-replace cannot change a function's return type (TABLE -> jsonb).

drop function if exists public.claim_drop(uuid);

create or replace function public.claim_drop(p_drop_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d     public.premium_drops;
  v_uid uuid := auth.uid();
  v_pos int;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into d from public.premium_drops where id = p_drop_id for update;
  if not found then raise exception 'DROP_NOT_FOUND'; end if;

  if now() < d.drop_at then raise exception 'DROP_NOT_LIVE'; end if;
  if d.ends_at is not null and now() > d.ends_at then raise exception 'DROP_ENDED'; end if;
  if d.status in ('sold_out','ended') or d.claimed_count >= d.allocation then
    raise exception 'DROP_SOLD_OUT';
  end if;

  -- Idempotent: a repeat tap returns the user's existing position, no double-count.
  begin
    insert into public.drop_claims (drop_id, user_id) values (p_drop_id, v_uid);
  exception when unique_violation then
    select count(*) into v_pos from public.drop_claims c
      where c.drop_id = p_drop_id
        and c.created_at <= (select created_at from public.drop_claims
                             where drop_id = p_drop_id and user_id = v_uid);
    return jsonb_build_object('claimed_count', d.claimed_count, 'allocation', d.allocation,
                              'status', d.status, 'position', v_pos);
  end;

  update public.premium_drops
     set claimed_count = premium_drops.claimed_count + 1,
         status = case when premium_drops.claimed_count + 1 >= premium_drops.allocation then 'sold_out'
                       when premium_drops.status = 'teaser'                            then 'live'
                       else premium_drops.status end,
         sold_out_at = case when premium_drops.claimed_count + 1 >= premium_drops.allocation
                             and premium_drops.sold_out_at is null then now()
                            else premium_drops.sold_out_at end
   where premium_drops.id = p_drop_id
   returning premium_drops.claimed_count, premium_drops.status into d.claimed_count, d.status;

  return jsonb_build_object('claimed_count', d.claimed_count, 'allocation', d.allocation,
                            'status', d.status, 'position', d.claimed_count);
end $$;

grant execute on function public.claim_drop(uuid) to authenticated;
