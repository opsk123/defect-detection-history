-- Server-only migration. Replace __ACCESS_SHA256__ during deployment, never with a password.
create table if not exists public.accc_dashboard_access (
  name text primary key,
  password_hash bytea not null,
  enabled boolean not null default true
);
alter table public.accc_dashboard_access enable row level security;
revoke all on public.accc_dashboard_access from public, anon, authenticated;
grant select,insert,update on public.accc_dashboard_access to service_role;
insert into public.accc_dashboard_access(name,password_hash)
values ('pages_viewer',decode('__ACCESS_SHA256__','hex'))
on conflict(name) do update set password_hash=excluded.password_hash,enabled=true;

create or replace function public.accc_pages_results(
  p_password text,
  p_after bigint default 0,
  p_limit integer default 500,
  p_from timestamptz default now()-interval '30 days',
  p_to timestamptz default now(),
  p_ceiling bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ceiling bigint; rows jsonb; cursor_value bigint; more boolean;
begin
  if p_password is null or length(p_password)>256 or not exists (
    select 1 from public.accc_dashboard_access where name='pages_viewer' and enabled
    and password_hash=sha256(convert_to(p_password,'UTF8'))
  ) then raise exception 'Invalid dashboard password' using errcode='28000'; end if;
  if p_limit is null or p_limit<1 or p_limit>500 or p_after is null or p_after<0
      or p_from is null or p_to is null or p_from>=p_to then
    raise exception 'Invalid query range' using errcode='22023';
  end if;
  select coalesce(max(server_sequence),0) into ceiling from public.accc_dashboard;
  ceiling=least(ceiling,coalesce(p_ceiling,ceiling));
  select coalesce(jsonb_agg(item order by seq),'[]'::jsonb),coalesce(max(seq),p_after)
    into rows,cursor_value from (
      select server_sequence as seq,jsonb_build_object(
        'seq',server_sequence,'id',event_id,'run',run_id,'line',coalesce(line_name,line_id::text),
        'time',occurred_at,'mode',execution_mode,'status',decision->>'status',
        'class',classifier->>'predicted_key','scores',classifier->'scores_by_key',
        'classifier_status',classifier->>'status','detector_status',detector->>'status',
        'boxes',coalesce(detector->'detections','[]'::jsonb),
        'reasons',decision->'reason_codes','roi_status',observation->>'roi_status'
      ) as item from public.accc_dashboard
      where server_sequence>p_after and server_sequence<=ceiling
        and occurred_at>=p_from and occurred_at<p_to
      order by server_sequence limit p_limit
    ) page;
  select exists(select 1 from public.accc_dashboard where server_sequence>cursor_value
    and server_sequence<=ceiling and occurred_at>=p_from and occurred_at<p_to) into more;
  return jsonb_build_object('rows',rows,'next_cursor',cursor_value,'ceiling',ceiling,'has_more',more);
end;
$$;
revoke all on function public.accc_pages_results(text,bigint,integer,timestamptz,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.accc_pages_results(text,bigint,integer,timestamptz,timestamptz,bigint) to anon,authenticated;
notify pgrst,'reload schema';
