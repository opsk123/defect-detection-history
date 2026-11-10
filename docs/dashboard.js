import {labels,filteredRows,csvCell,classCounts} from './dashboard-utils.mjs';
const $=id=>document.getElementById(id),cfg=window.ACCC_CONFIG;
let password='',records=[],page=0,busy=false,generation=0,controller=null,limited=false;
const pageSize=100;
const dateString=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
$('to').value=dateString(new Date());$('from').value=dateString(new Date(Date.now()-30*864e5));
for(const [value,label] of Object.entries(labels)){const o=document.createElement('option');o.value=value;o.textContent=label;$('status').append(o);}
const selected=()=>filteredRows(records,{fixture:$('fixture').checked,line:$('line').value,status:$('status').value});
function textNode(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function bars(id,counts,names={}){const box=$(id);box.replaceChildren();const max=Math.max(1,...Object.values(counts));for(const [name,count] of Object.entries(counts)){const row=document.createElement('div');row.className='bar';const meter=document.createElement('meter');meter.min=0;meter.max=max;meter.value=count;meter.setAttribute('aria-label',names[name]||name);row.append(textNode('span',names[name]||name),meter,textNode('span',count.toLocaleString()));box.append(row);}}
function render(){
 const rows=selected(),counts=Object.fromEntries(Object.keys(labels).map(k=>[k,0]));for(const r of rows)if(r.status in counts)counts[r.status]++;
 $('metrics').replaceChildren();for(const [title,value] of [['검사 시행',rows.length],['재검토 필요',counts.review_required],['정상 · 모델 일치',counts.normal_candidate],['검사 세션',new Set(rows.map(r=>r.run)).size]]){const n=document.createElement('div');n.className='metric';n.append(textNode('small',title),textNode('strong',value.toLocaleString()));$('metrics').append(n);}
 bars('statusChart',counts,labels);bars('classChart',classCounts(rows));
 page=Math.max(0,Math.min(page,Math.ceil(rows.length/pageSize)-1));$('rows').replaceChildren();
 for(const r of [...rows].reverse().slice(page*pageSize,(page+1)*pageSize)){
  const tr=document.createElement('tr');const boxes=(r.boxes||[]).map(b=>`${b.class_key} ${(b.score*100).toFixed(1)}%`).join(' · ');
  for(const v of [new Date(r.time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),r.line,r.mode==='inference'?'실제 추론':r.mode||'미실행',r.class||'—',boxes||'없음',labels[r.status]||r.status])tr.append(textNode('td',v));
  const cell=document.createElement('td'),button=textNode('button','보기');button.onclick=()=>{$('detailText').textContent=JSON.stringify(r,null,2);$('details').showModal();};cell.append(button);tr.append(cell);$('rows').append(tr);
 }
 $('recordCount').textContent=`검사 기록 · 총 ${rows.length.toLocaleString()}건`;$('recordRange').textContent=rows.length?`${(page*pageSize+1).toLocaleString()}–${Math.min((page+1)*pageSize,rows.length).toLocaleString()}번째 기록 표시 · 페이지당 ${pageSize}건`:'표시할 기록이 없습니다.';$('empty').hidden=rows.length>0;$('page').textContent=`${page+1} / ${Math.max(1,Math.ceil(rows.length/pageSize))}`;$('previous').disabled=page===0;$('next').disabled=(page+1)*pageSize>=rows.length;
 const other=records.filter(r=>r.mode!=='inference').length;
 $('message').textContent=`조회 ${records.length.toLocaleString()}건 · 현재 표시 ${rows.length.toLocaleString()}건 · 모의·미실행 ${other.toLocaleString()}건${!$('fixture').checked?' 제외':''}${limited?' · 20,000건 제한: 기간을 좁혀 주세요.':''}`;
}
async function refresh(){
 if(busy)return;busy=true;const version=++generation;controller=new AbortController();$('refresh').disabled=true;$('loginButton').disabled=true;$('loginError').textContent='';$('message').textContent='Supabase 기록을 조회하고 있습니다…';
 try{
  const from=new Date($('from').value+'T00:00:00+09:00'),to=new Date(new Date($('to').value+'T00:00:00+09:00').getTime()+864e5);
  if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>=to)throw Error('검사 기간을 확인하세요.');
  const fetched=[];let cursor=0,ceiling=null,more=true;
  while(more&&fetched.length<20000){
   const response=await fetch(cfg.url+'/rest/v1/rpc/accc_pages_results',{method:'POST',signal:controller.signal,headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_password:password,p_after:cursor,p_limit:500,p_from:from.toISOString(),p_to:to.toISOString(),p_ceiling:ceiling})});
   if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.code==='28000'?'조회 비밀번호가 일치하지 않습니다.':`조회 연결 오류 (${response.status}). 잠시 후 다시 시도하세요.`);}
   const result=await response.json();if(!Array.isArray(result.rows))throw Error('잘못된 조회 응답입니다.');
   if(version!==generation)return;
   fetched.push(...result.rows);more=result.has_more;ceiling=result.ceiling;
   if(more&&result.next_cursor<=cursor)throw Error('조회 페이지가 진행되지 않습니다.');cursor=result.next_cursor;
   $('message').textContent=`${fetched.length.toLocaleString()}건 조회 중…`;
  }
  if(version!==generation)return;
  records=fetched;limited=more;page=0;
  const current=$('line').value;$('line').replaceChildren(new Option('전체',''),...([...new Set(records.map(r=>r.line))].sort().map(l=>new Option(l,l))));if([...$('line').options].some(o=>o.value===current))$('line').value=current;
  $('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;$('password').value='';render();
 }catch(error){if(error.name!=='AbortError'&&version===generation){$('loginError').textContent=error.message;$('message').textContent='갱신 실패 · 기존 표시 결과는 이전 조회 기준입니다. '+error.message;}}
 finally{if(version===generation){busy=false;$('refresh').disabled=false;$('loginButton').disabled=false;}}
}
$('loginForm').onsubmit=e=>{e.preventDefault();password=$('password').value;refresh();};$('refresh').onclick=refresh;
for(const id of ['fixture','line','status'])$(id).onchange=()=>{page=0;render();};
$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('closeDetails').onclick=()=>$('details').close();
$('logout').onclick=()=>{generation++;controller?.abort();busy=false;password='';records=[];$('password').value='';$('dashboard').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('loginButton').disabled=false;$('refresh').disabled=false;$('auto').checked=false;$('details').close();for(const id of ['detailText','rows','metrics','statusChart','classChart','message','loginError'])$(id).replaceChildren();};
$('csv').onclick=()=>{const header=['검사 시각','라인','실행 구분','분류','판정','검출','관측 ID'];const rows=selected().map(r=>[r.time,r.line,r.mode,r.class,r.status,JSON.stringify(r.boxes),r.id]);const data='\ufeff'+[header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='accc-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
setInterval(()=>{if(password&&!$('dashboard').hidden&&$('auto').checked&&!document.hidden)refresh();},30000);
