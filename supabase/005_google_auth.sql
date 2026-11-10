-- Run after 003 and 004. No administrator is assigned automatically.
begin;
create table if not exists public.accc_web_admin (
 singleton boolean primary key default true check(singleton),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 github_owner text not null check(github_owner='opsk123')
);
alter table public.accc_web_admin enable row level security;
revoke all on public.accc_web_admin from public,anon,authenticated;

create or replace function public.accc_google_user() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and coalesce(auth.jwt()->'app_metadata'->>'provider','')='google'
 and exists(select 1 from auth.identities where user_id=auth.uid() and provider='google');
$$;
revoke all on function public.accc_google_user() from public,anon,authenticated;
grant execute on function public.accc_google_user() to authenticated;

create or replace function public.accc_web_role() returns text
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.accc_google_user() then raise exception 'Google login required' using errcode='42501'; end if;
 if exists(select 1 from public.accc_web_admin where user_id=auth.uid()) then return 'admin'; end if;
 return 'viewer';
end; $$;
revoke all on function public.accc_web_role() from public,anon,authenticated;
grant execute on function public.accc_web_role() to authenticated;

create or replace function public.accc_google_results(
 p_after bigint default 0,p_limit integer default 500,
 p_from timestamptz default now()-interval '30 days',p_to timestamptz default now(),p_ceiling bigint default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare ceiling bigint; rows jsonb; cursor_value bigint; more boolean;
begin
 if not public.accc_google_user() then raise exception 'Google login required' using errcode='42501'; end if;
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

revoke all on function public.accc_google_results(bigint,integer,timestamptz,timestamptz,bigint) from public,anon,authenticated;
grant execute on function public.accc_google_results(bigint,integer,timestamptz,timestamptz,bigint) to authenticated;
create table if not exists public.accc_review_notes (
 run_id uuid primary key,note text not null check(length(note)<=4000),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table if not exists public.accc_review_note_audit (
 id bigint generated always as identity primary key,run_id uuid not null,note text not null,
 updated_by uuid not null,updated_at timestamptz not null default now()
);
alter table public.accc_review_notes enable row level security;
alter table public.accc_review_note_audit enable row level security;
revoke all on public.accc_review_notes,public.accc_review_note_audit from public,anon,authenticated;
create or replace function public.accc_get_review_note(p_run uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.accc_google_user() then raise exception 'Google login required' using errcode='42501'; end if;
 select jsonb_build_object('note',note,'updated_at',updated_at) into result from public.accc_review_notes where run_id=p_run;
 return coalesce(result,'{"note":""}'::jsonb);
end; $$;
create or replace function public.accc_save_review_note(p_run uuid,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.accc_web_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_note is null or length(p_note)>4000 or not exists(select 1 from public.accc_dashboard where run_id=p_run) then
 raise exception 'Invalid review note or session' using errcode='22023'; end if;
 insert into public.accc_review_notes(run_id,note,updated_by) values(p_run,p_note,auth.uid())
 on conflict(run_id) do update set note=excluded.note,updated_by=excluded.updated_by,updated_at=now();
 insert into public.accc_review_note_audit(run_id,note,updated_by) values(p_run,p_note,auth.uid());
end; $$;
revoke all on function public.accc_get_review_note(uuid) from public,anon,authenticated;
revoke all on function public.accc_save_review_note(uuid,text) from public,anon,authenticated;
grant execute on function public.accc_get_review_note(uuid),public.accc_save_review_note(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
