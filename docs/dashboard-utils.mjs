export const labels={normal_candidate:'정상 · 모델 일치',damage_suspected:'손상 의심',review_required:'재검토 필요',processing_error:'처리 오류',not_run:'미실행'};
export function filteredRows(rows,{fixture=false,line='',status=''}={}){return rows.filter(r=>(fixture||r.mode==='inference')&&(!line||r.line===line)&&(!status||r.status===status));}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function classCounts(rows){const counts={fracture:0,sawing:0,shifting:0,splitting:0};for(const row of rows)for(const name of new Set((row.boxes||[]).map(b=>b.class_key)))if(name in counts)counts[name]++;return counts;}
