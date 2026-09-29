begin;
create table public.icp_shortlist_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 auto_delivery boolean not null default false, max_daily integer not null default 30 check(max_daily between 1 and 200)
);
insert into public.icp_shortlist_settings(id) values(true);
create table public.icp_shortlist_requests (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 email text not null, agency_url text not null, client_url text not null, service text not null,
 ip_hash text not null, idempotency_key uuid not null unique, attribution jsonb not null default '{}',
 status text not null default 'queued' check(status in ('queued','researching','pending_review','complete','partial','needs_clarification','failed')),
 phase text not null default 'brief', state jsonb not null default '{}', report jsonb not null default '{}', counters jsonb not null default '{}',
 lease_id uuid, lease_until timestamptz, next_run_at timestamptz not null default now(), attempts integer not null default 0,
 error text, review_required boolean not null default true, is_test boolean not null default false,
 email_status text not null default 'pending', email_id text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz
);
create index icp_shortlist_due on public.icp_shortlist_requests(next_run_at) where status in ('queued','researching');
create index icp_shortlist_email on public.icp_shortlist_requests(email,created_at);
alter table public.icp_shortlist_settings enable row level security;
alter table public.icp_shortlist_requests enable row level security;
revoke all on public.icp_shortlist_requests,public.icp_shortlist_settings from anon,authenticated;
grant all on public.icp_shortlist_requests,public.icp_shortlist_settings to service_role;
create function public.icp_shortlist_submit(p_request jsonb) returns setof public.icp_shortlist_requests
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
  if exists(select 1 from icp_shortlist_requests where email=p_request->>'email' and created_at>now()-interval '24 hours' and not is_test) then raise exception 'duplicate_request'; end if;
 end if;
 return query insert into icp_shortlist_requests(id,token_hash,email,agency_url,client_url,service,ip_hash,idempotency_key,attribution,review_required,is_test)
 values((p_request->>'id')::uuid,p_request->>'token_hash',p_request->>'email',p_request->>'agency_url',p_request->>'client_url',p_request->>'service',p_request->>'ip_hash',(p_request->>'idempotency_key')::uuid,coalesce(p_request->'attribution','{}'),testing or not cfg.auto_delivery,testing) returning *;
end $$;
create function public.icp_shortlist_claim(p_id uuid default null) returns setof public.icp_shortlist_requests
language sql security definer set search_path=public as $$
 update icp_shortlist_requests set lease_id=gen_random_uuid(),lease_until=now()+interval '4 minutes',status='researching',attempts=attempts+1,updated_at=now()
 where id=(select id from icp_shortlist_requests where status in ('queued','researching') and next_run_at<=now() and (lease_until is null or lease_until<now()) and (p_id is null or id=p_id) order by next_run_at,created_at for update skip locked limit 1)
 returning *;
$$;
create function public.icp_shortlist_reserve(p_id uuid,p_lease uuid,p_kind text,p_amount integer default 1) returns boolean
language plpgsql security definer set search_path=public as $$
declare lim integer; touched integer;
begin
 lim:=case p_kind when 'search' then 18 when 'scrape' then 24 when 'llm' then 16 when 'verification' then 5 else 0 end;
 if p_amount<1 or p_amount>lim then return false; end if;
 update icp_shortlist_requests set counters=jsonb_set(counters,array[p_kind],to_jsonb(coalesce((counters->>p_kind)::int,0)+p_amount)),updated_at=now()
 where id=p_id and lease_id=p_lease and lease_until>now() and coalesce((counters->>p_kind)::int,0)+p_amount<=lim;
 get diagnostics touched=row_count;return touched=1;
end $$;
revoke all on function public.icp_shortlist_submit(jsonb),public.icp_shortlist_claim(uuid),public.icp_shortlist_reserve(uuid,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.icp_shortlist_submit(jsonb),public.icp_shortlist_claim(uuid),public.icp_shortlist_reserve(uuid,uuid,text,integer) to service_role;
commit;
