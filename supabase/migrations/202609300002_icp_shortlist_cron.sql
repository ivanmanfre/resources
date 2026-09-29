begin;
create function public.icp_shortlist_tick() returns void
language plpgsql security definer set search_path=public as $$
declare secret text;
begin
 if not exists(select 1 from icp_shortlist_requests where status in ('queued','researching') and next_run_at<=now() and (lease_until is null or lease_until<now())) then return; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='ICP_SHORTLIST_SECRET' limit 1;
 if secret is null then raise exception 'missing_worker_secret'; end if;
 perform net.http_post(url:='https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/icp-shortlist-worker',headers:=jsonb_build_object('Authorization','Bearer '||secret,'Content-Type','application/json'),body:='{}'::jsonb,timeout_milliseconds:=180000);
end $$;
revoke all on function public.icp_shortlist_tick() from public,anon,authenticated;
grant execute on function public.icp_shortlist_tick() to service_role;
select cron.schedule('icp-shortlist-worker','* * * * *','select public.icp_shortlist_tick();');
commit;
