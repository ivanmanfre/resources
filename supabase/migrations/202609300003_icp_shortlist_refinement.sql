-- Allow a corrected brief after failed/empty research, within the existing IP and daily caps.
begin;
create or replace function public.icp_shortlist_submit(p_request jsonb) returns setof public.icp_shortlist_requests
language plpgsql security definer set search_path=public as $$
declare existing public.icp_shortlist_requests; cfg public.icp_shortlist_settings; testing boolean:=coalesce((p_request->>'is_test')::boolean,false);
begin
 perform pg_advisory_xact_lock(hashtext('icp_shortlist_intake'));
 select * into cfg from icp_shortlist_settings where id=true;
 if not cfg.enabled and not testing then raise exception 'intake_closed'; end if;
 select * into existing from icp_shortlist_requests where idempotency_key=(p_request->>'idempotency_key')::uuid;
 if found then
  if existing.email<>p_request->>'email' or existing.agency_url<>p_request->>'agency_url' or existing.client_url<>p_request->>'client_url' or existing.service<>p_request->>'service' then raise exception 'idempotency_conflict'; end if;
  return next existing; return;
 end if;
 if not testing then
  if (select count(*) from icp_shortlist_requests where created_at>now()-interval '24 hours' and not is_test)>=cfg.max_daily then raise exception 'daily_capacity'; end if;
  if (select count(*) from icp_shortlist_requests where ip_hash=p_request->>'ip_hash' and created_at>now()-interval '24 hours' and not is_test)>=3 then raise exception 'rate_limited'; end if;
  if exists(select 1 from icp_shortlist_requests where email=p_request->>'email' and created_at>now()-interval '24 hours' and not is_test and status not in ('failed','needs_clarification')) then raise exception 'duplicate_request'; end if;
 end if;
 return query insert into icp_shortlist_requests(id,token_hash,email,agency_url,client_url,service,ip_hash,idempotency_key,attribution,review_required,is_test)
 values((p_request->>'id')::uuid,p_request->>'token_hash',p_request->>'email',p_request->>'agency_url',p_request->>'client_url',p_request->>'service',p_request->>'ip_hash',(p_request->>'idempotency_key')::uuid,coalesce(p_request->'attribution','{}'),testing or not cfg.auto_delivery,testing) returning *;
end $$;
commit;
