-- Run with psql as the migration owner against a disposable database. Every write rolls back.
begin;
do $$
declare h text := repeat('a',64); t text := repeat('b',64); payload jsonb;
begin
  begin
    perform public.network_buyer_claim(h);
    raise exception 'disabled setting did not block claim';
  exception when raise_exception then
    if sqlerrm <> 'finder_closed' then raise; end if;
  end;
  update public.network_buyer_settings set enabled=true, daily_limit=20, ip_daily_limit=4, max_sessions=50 where id=true;
  perform public.network_buyer_claim(h);
  perform public.network_buyer_save(t,h,'seller-1','{"name":"Seller","url":"https://www.linkedin.com/in/seller"}'::jsonb,'{"roles":["owner"],"businesses":["agency"],"exclusions":[],"locations":[],"summary":"Agency owners","evidence":["Agency owners"]}'::jsonb);
  update public.network_buyer_settings set enabled=false where id=true;
  if public.network_buyer_consume(t,h) is not null then raise exception 'disabled finder returned prepared session'; end if;
  update public.network_buyer_settings set enabled=true where id=true;
  if public.network_buyer_consume(t,h) is not null then raise exception 'disabled scan token revived'; end if;
  perform public.network_buyer_save(t,h,'seller-1','{"name":"Seller","url":"https://www.linkedin.com/in/seller"}'::jsonb,'{"roles":["owner"],"businesses":["agency"],"exclusions":[],"locations":[],"summary":"Agency owners","evidence":["Agency owners"]}'::jsonb);
  if public.network_buyer_consume(t,repeat('c',64)) is not null then raise exception 'IP mismatch consumed session'; end if;
  payload := public.network_buyer_consume(t,h);
  if payload->>'profile_id' is distinct from 'seller-1' then raise exception 'session payload missing'; end if;
  if public.network_buyer_consume(t,h) is not null then raise exception 'session replay worked'; end if;
  perform public.network_buyer_claim(h); perform public.network_buyer_claim(h); perform public.network_buyer_claim(h);
  begin
    perform public.network_buyer_claim(h);
    raise exception 'per-IP cap failed';
  exception when raise_exception then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
  if (select count(*) from public.network_buyer_quota where ip_hash=h) <> 4 then raise exception 'quota count wrong'; end if;
end $$;
rollback;
