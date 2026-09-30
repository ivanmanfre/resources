begin;

create table public.network_buyer_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  daily_limit integer not null default 20 check (daily_limit between 1 and 100),
  ip_daily_limit integer not null default 4 check (ip_daily_limit between 1 and 20),
  max_sessions integer not null default 50 check (max_sessions between 1 and 200)
);
insert into public.network_buyer_settings (id) values (true);

create table public.network_buyer_quota (
  id bigint generated always as identity primary key,
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  claimed_at timestamptz not null default now()
);
create index network_buyer_quota_claimed on public.network_buyer_quota (claimed_at);
create index network_buyer_quota_ip_claimed on public.network_buyer_quota (ip_hash, claimed_at);

create table public.network_buyer_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  profile_id text not null check (length(profile_id) between 1 and 200),
  brief jsonb not null,
  criteria jsonb not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create index network_buyer_sessions_expiry on public.network_buyer_sessions (expires_at);

alter table public.network_buyer_settings enable row level security;
alter table public.network_buyer_quota enable row level security;
alter table public.network_buyer_sessions enable row level security;
revoke all on public.network_buyer_settings, public.network_buyer_quota, public.network_buyer_sessions from public, anon, authenticated;
grant all on public.network_buyer_settings, public.network_buyer_quota, public.network_buyer_sessions to service_role;
grant usage, select on sequence public.network_buyer_quota_id_seq to service_role;

create function public.network_buyer_claim(p_ip_hash text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare cfg public.network_buyer_settings;
begin
  if p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_ip_hash'; end if;
  perform pg_advisory_xact_lock(hashtext('network_buyer_quota'));
  delete from public.network_buyer_sessions where expires_at <= now();
  delete from public.network_buyer_quota where claimed_at < now() - interval '2 days';
  select * into cfg from public.network_buyer_settings where id = true;
  if not found or not cfg.enabled then raise exception 'finder_closed'; end if;
  if (select count(*) from public.network_buyer_quota where claimed_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= cfg.daily_limit then
    raise exception 'daily_capacity';
  end if;
  if (select count(*) from public.network_buyer_quota where ip_hash = p_ip_hash and claimed_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') >= cfg.ip_daily_limit then
    raise exception 'rate_limited';
  end if;
  insert into public.network_buyer_quota(ip_hash) values (p_ip_hash);
end $$;

create function public.network_buyer_save(p_token_hash text, p_ip_hash text, p_profile_id text, p_brief jsonb, p_criteria jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare cfg public.network_buyer_settings;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_hash'; end if;
  if p_profile_id is null or length(p_profile_id) not between 1 and 200 then raise exception 'invalid_profile'; end if;
  perform pg_advisory_xact_lock(hashtext('network_buyer_sessions'));
  delete from public.network_buyer_sessions where expires_at <= now();
  select * into cfg from public.network_buyer_settings where id = true;
  if not found or not cfg.enabled then raise exception 'finder_closed'; end if;
  if (select count(*) from public.network_buyer_sessions) >= cfg.max_sessions then raise exception 'finder_busy'; end if;
  insert into public.network_buyer_sessions(token_hash, ip_hash, profile_id, brief, criteria)
  values (p_token_hash, p_ip_hash, p_profile_id, p_brief, p_criteria);
end $$;

create function public.network_buyer_consume(p_token_hash text, p_ip_hash text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  delete from public.network_buyer_sessions where expires_at <= now();
  if not exists (select 1 from public.network_buyer_settings where id = true and enabled) then
    delete from public.network_buyer_sessions where token_hash = p_token_hash and ip_hash = p_ip_hash;
    return null;
  end if;
  delete from public.network_buyer_sessions where token_hash = p_token_hash and ip_hash = p_ip_hash and expires_at > now()
  returning jsonb_build_object('profile_id', profile_id, 'brief', brief, 'criteria', criteria) into result;
  return result;
end $$;

revoke all on function public.network_buyer_claim(text), public.network_buyer_save(text,text,text,jsonb,jsonb), public.network_buyer_consume(text,text) from public, anon, authenticated;
grant execute on function public.network_buyer_claim(text), public.network_buyer_save(text,text,text,jsonb,jsonb), public.network_buyer_consume(text,text) to service_role;
commit;
