-- Preserve immutable ingestion events; normalize the shared read projection.
create or replace function public.accc_agreement_decision(c jsonb,d jsonb,previous jsonb)
returns jsonb language plpgsql immutable set search_path='' as $$
declare result_status text; reason text; predicted text; kinds text[];
begin
  if c->>'status' in ('load_error','inference_error') or d->>'status' in ('load_error','inference_error') then
    result_status='processing_error'; reason='model_error';
  elsif coalesce(c->>'status','not_run')<>'ok' or coalesce(d->>'status','not_run')<>'ok' then
    result_status='not_run'; reason='models_unavailable';
  elsif coalesce(jsonb_typeof(d->'detections'),'null')<>'array' or c->>'predicted_key' is null then
    result_status='processing_error'; reason='contract_error';
  else
    predicted=c->>'predicted_key';
    select coalesce(array_agg(distinct b->>'class_key'),'{}'::text[]) into kinds
      from jsonb_array_elements(d->'detections') b;
    if cardinality(kinds)>1 then result_status='review_required'; reason='multiple_defect_types';
    elsif predicted='normal' and cardinality(kinds)=0 then result_status='normal_candidate'; reason='no_defect_evidence';
    elsif predicted='normal' then result_status='review_required'; reason='detector_only';
    elsif cardinality(kinds)=0 then result_status='review_required'; reason='classifier_only';
    elsif predicted=kinds[1] then result_status='normal_candidate'; reason='models_agree';
    else result_status='review_required'; reason='class_mismatch'; end if;
  end if;
  return coalesce(previous,'{}'::jsonb)||jsonb_build_object(
    'original_status',coalesce(previous->'original_status',previous->'status'),
    'original_reason_codes',coalesce(previous->'original_reason_codes',previous->'reason_codes'),
    'status',result_status,'reason_codes',jsonb_build_array(reason),'policy_version','dual-agreement-2.0');
end;
$$;
revoke all on function public.accc_agreement_decision(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.accc_agreement_decision(jsonb,jsonb,jsonb) to service_role;
create or replace view public.accc_dashboard with (security_invoker=true) as
select server_sequence,event_id,run_id,line_id,execution_mode,occurred_at,received_at,
       envelope->'run_context'->>'line_name' as line_name,
       envelope->'payload'->'observation' as observation,
       envelope->'payload'->'classifier' as classifier,
       envelope->'payload'->'detector' as detector,
       public.accc_agreement_decision(envelope->'payload'->'classifier',envelope->'payload'->'detector',
         envelope->'payload'->'decision') as decision
from public.accc_events where event_type='dual_decision';
revoke all on public.accc_dashboard from public,anon,authenticated;
grant select on public.accc_dashboard to service_role;
notify pgrst,'reload schema';
