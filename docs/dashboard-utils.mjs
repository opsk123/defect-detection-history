export const labels={normal_candidate:'정상 · 모델 일치',damage_suspected:'손상 의심',review_required:'재검토 필요',processing_error:'처리 오류',not_run:'미실행'};
export function filteredRows(rows,{fixture=false,line='',status=''}={}){return rows.filter(r=>(fixture||r.mode==='inference')&&(!line||r.line===line)&&(!status||r.status===status));}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function classCounts(rows){const counts={fracture:0,sawing:0,shifting:0,splitting:0};for(const row of rows)for(const name of new Set((row.boxes||[]).map(b=>b.class_key)))if(name in counts)counts[name]++;return counts;}
export function sessionRows(rows,options={}){
 const groups=new Map();
 // Apply disposition filters only after grouping: a mismatch cannot disappear
 // from a session merely because the user selects the normal filter.
 for(const r of filteredRows(rows,{...options,status:''})){
  const key=r.run||r.id;
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(r);
 }
 const sessions=[];
 for(const [run,observations] of groups){
  const states=new Set(observations.map(r=>r.status));
  const status=states.has('review_required')?'review_required':states.has('processing_error')?'processing_error':
    [...states].some(s=>s!=='normal_candidate')?'not_run':'normal_candidate';
  const ordered=[...observations].sort((a,b)=>a.time.localeCompare(b.time));
  const boxes=new Map();for(const r of observations)for(const box of r.boxes||[]){if(!boxes.has(box.class_key)||boxes.get(box.class_key).score<box.score)boxes.set(box.class_key,box);}
  sessions.push({id:run,run,line:[...new Set(observations.map(r=>r.line))].join(', '),time:ordered[0].time,
   last_time:ordered.at(-1).time,mode:observations[0].mode,status,
   class:[...new Set(observations.map(r=>r.class).filter(Boolean))].join(', '),
   boxes:[...boxes.values()],frame_count:observations.length,observations});
 }
 return sessions.filter(r=>!options.status||r.status===options.status).sort((a,b)=>a.time.localeCompare(b.time));
}
