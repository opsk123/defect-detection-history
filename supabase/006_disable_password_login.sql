-- Apply only after Google sign-in and administrator/viewer tests pass.
begin;
revoke all on function public.accc_pages_results(text,bigint,integer,timestamptz,timestamptz,bigint) from public,anon,authenticated;
update public.accc_dashboard_access set enabled=false where name='pages_viewer';
notify pgrst,'reload schema';
commit;
