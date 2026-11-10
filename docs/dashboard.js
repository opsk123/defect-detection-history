import {labels,sessionRows,csvCell,classCounts} from './dashboard-utils.mjs';
const $=id=>document.getElementById(id),cfg=window.ACCC_CONFIG;
const auth=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
let session=null,role='viewer',reviewRun=null,activeUser=null,
records=[],page=0,busy=false,generation=0,controller=null,limited=false,initialView=true;
const pageSize=100;
const dateString=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
$('to').value=dateString(new Date());$('from').value=dateString(new Date(Date.now()-30*864e5));
for(const [value,label] of Object.entries(labels)){const o=document.createElement('option');o.value=value;o.textContent=label;$('status').append(o);}
const selected=()=>sessionRows(records,{fixture:$('fixture').checked,line:$('line').value,status:$('status').value});
function textNode(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function bars(id,counts,names={}){const box=$(id);box.replaceChildren();const max=Math.max(1,...Object.values(counts));for(const [name,count] of Object.entries(counts)){const row=document.createElement('div');row.className='bar';const meter=document.createElement('meter');meter.min=0;meter.max=max;meter.value=count;meter.setAttribute('aria-label',names[name]||name);row.append(textNode('span',names[name]||name),meter,textNode('span',count.toLocaleString()));box.append(row);}}
function render(){
 const rows=selected(),counts=Object.fromEntries(Object.keys(labels).map(k=>[k,0]));for(const r of rows)if(r.status in counts)counts[r.status]++;
 $('metrics').replaceChildren();for(const [title,value] of [['검사 세션',rows.length],['재검토 필요',counts.review_required],['정상 · 모델 일치',counts.normal_candidate],['미실행 · 오류',counts.not_run+counts.processing_error]]){const n=document.createElement('div');n.className='metric';n.append(textNode('small',title),textNode('strong',value.toLocaleString()));$('metrics').append(n);}
 bars('statusChart',counts,labels);bars('classChart',classCounts(rows));
 page=Math.max(0,Math.min(page,Math.ceil(rows.length/pageSize)-1));$('rows').replaceChildren();
 for(const r of [...rows].reverse().slice(page*pageSize,(page+1)*pageSize)){
  const tr=document.createElement('tr');const boxes=(r.boxes||[]).map(b=>`${b.class_key} ${(b.score*100).toFixed(1)}%`).join(' · ');
  for(const v of [new Date(r.time).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}),r.line,r.mode==='inference'?'실제 추론':r.mode==='fixture'?'가상 · 시연':r.mode||'미실행',r.frame_count.toLocaleString()+'장',r.class||'—',boxes||'없음',labels[r.status]||r.status])tr.append(textNode('td',v));
  const cell=document.createElement('td'),button=textNode('button','보기');button.onclick=()=>{const {observations,...summary}=r;$('detailText').textContent=JSON.stringify({...summary,detail_note:'사진별 기록은 아래 최대 100건을 표시합니다. 전체는 사진별 CSV로 다운로드하세요.',observations:observations.slice(0,100)},null,2);$('detailCsv').onclick=()=>downloadCsv(observations,false);$('details').showModal();loadReview(r.run);};cell.append(button);tr.append(cell);$('rows').append(tr);
 }
 $('recordCount').textContent=`검사 기록 · 총 ${rows.length.toLocaleString()}건`;$('recordRange').textContent=rows.length?`${(page*pageSize+1).toLocaleString()}–${Math.min((page+1)*pageSize,rows.length).toLocaleString()}번째 세션 표시 · 페이지당 ${pageSize}세션`:'표시할 기록이 없습니다.';$('empty').hidden=rows.length>0;$('page').textContent=`${page+1} / ${Math.max(1,Math.ceil(rows.length/pageSize))}`;$('previous').disabled=page===0;$('next').disabled=(page+1)*pageSize>=rows.length;
 const mockCount=rows.filter(r=>r.mode==='fixture').length,realCount=rows.filter(r=>r.mode==='inference').length;$('demoNotice').hidden=mockCount===0;$('demoNotice').textContent=`가상 시연 ${mockCount.toLocaleString()}세션 포함 · 실제 검사 ${realCount.toLocaleString()}세션. 실제 기록만 보려면 ‘가상·시연 데이터 포함’을 해제하세요.`;
 $('message').textContent=`선택 기간 · 검사 세션 ${rows.length.toLocaleString()}건 · 세션당 기록 1건${limited?' · 원본 20,000건 조회 제한: 전체 세션 판정을 위해 기간을 좁혀 주세요.':''}`;
}
async function refresh(){
 if(busy)return;busy=true;const version=++generation;controller=new AbortController();$('refresh').disabled=true;$('loginButton').disabled=true;$('loginError').textContent='';$('message').textContent='Supabase 기록을 조회하고 있습니다…';
 try{
  const from=new Date($('from').value+'T00:00:00+09:00'),to=new Date(new Date($('to').value+'T00:00:00+09:00').getTime()+864e5);
  if(!Number.isFinite(+from)||!Number.isFinite(+to)||from>=to)throw Error('검사 기간을 확인하세요.');
  const fetched=[];let cursor=0,ceiling=null,more=true;
  while(more&&fetched.length<20000){
   const {data:authData,error:authError}=await auth.auth.getSession();if(authError||!authData.session)throw Error('Google 로그인이 필요합니다.');session=authData.session;
   const response=await fetch(cfg.url+'/rest/v1/rpc/accc_google_results',{method:'POST',signal:controller.signal,headers:{apikey:cfg.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({p_after:cursor,p_limit:500,p_from:from.toISOString(),p_to:to.toISOString(),p_ceiling:ceiling})});
   if(response.status===401||response.status===403){resetLogin();$('loginError').textContent='로그인이 만료되었거나 조회 권한이 없습니다. 다시 로그인하세요.';return;}
   if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(response.status===401||response.status===403?'로그인이 만료되었거나 조회 권한이 없습니다. 다시 로그인하세요.':`조회 연결 오류 (${response.status}). 잠시 후 다시 시도하세요.`);}
   const result=await response.json();if(!Array.isArray(result.rows))throw Error('잘못된 조회 응답입니다.');
   if(version!==generation)return;
   fetched.push(...result.rows);more=result.has_more;ceiling=result.ceiling;
   if(more&&result.next_cursor<=cursor)throw Error('조회 페이지가 진행되지 않습니다.');cursor=result.next_cursor;
   $('message').textContent=`${fetched.length.toLocaleString()}건 조회 중…`;
  }
  if(version!==generation)return;
  records=fetched;limited=more;page=0;
  const current=$('line').value;$('line').replaceChildren(new Option('전체',''),...([...new Set(records.map(r=>r.line))].sort().map(l=>new Option(l,l))));if([...$('line').options].some(o=>o.value===current))$('line').value=current;if(initialView&&$('fixture').checked&&records.some(r=>r.line==='DEMO-MVP-200'))$('line').value='DEMO-MVP-200';initialView=false;
  $('login').hidden=true;$('dashboard').hidden=false;$('logout').hidden=false;render();
 }catch(error){if(error.name!=='AbortError'&&version===generation){$('loginError').textContent=error.message;$('message').textContent='갱신 실패 · 기존 표시 결과는 이전 조회 기준입니다. '+error.message;}}
 finally{if(version===generation){busy=false;$('refresh').disabled=false;$('loginButton').disabled=false;}}
}
$('loginButton').onclick=async()=>{try{$('loginError').textContent='';const {error}=await auth.auth.signInWithOAuth({provider:'google',options:{redirectTo:new URL('./',location.href).href,queryParams:{prompt:'select_account'}}});if(error)throw error;}catch(e){$('loginError').textContent='Google 로그인 연결 실패: '+e.message;}};$('refresh').onclick=refresh;
for(const id of ['line','status'])$(id).onchange=()=>{page=0;render();};
$('fixture').onchange=()=>{page=0;if($('fixture').checked&&records.some(r=>r.line==='DEMO-MVP-200'))$('line').value='DEMO-MVP-200';else if(!$('fixture').checked&&$('line').value&&!records.some(r=>r.line===$('line').value&&r.mode==='inference'))$('line').value='';render();};
$('previous').onclick=()=>{page--;render();};$('next').onclick=()=>{page++;render();};$('closeDetails').onclick=()=>$('details').close();
function resetLogin(){generation++;controller?.abort();busy=false;session=null;activeUser=null;role='viewer';reviewRun=null;records=[];initialView=true;$('fixture').checked=true;$('dashboard').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('loginButton').disabled=false;$('refresh').disabled=false;$('auto').checked=false;$('details').close();$('detailCsv').onclick=null;$('saveReview').hidden=true;$('reviewNote').value='';$('reviewNote').readOnly=true;for(const id of ['accountRole','reviewStatus','detailText','rows','metrics','statusChart','classChart','message','loginError'])$(id).replaceChildren();}
$('logout').onclick=async()=>{resetLogin();const {error}=await auth.auth.signOut({scope:'local'});if(error)$('loginError').textContent=error.message;};
async function loadReview(run){reviewRun=run;$('reviewNote').value='';$('reviewNote').readOnly=role!=='admin';$('saveReview').hidden=role!=='admin';$('saveReview').disabled=true;$('reviewStatus').textContent='메모 조회 중…';const {data,error}=await auth.rpc('accc_get_review_note',{p_run:run});if(reviewRun!==run||!session)return;if(error){$('reviewStatus').textContent='메모 조회 실패';return;}$('reviewNote').value=data.note||'';$('reviewStatus').textContent=role==='admin'?'관리자 · 검토 메모 수정 가능':'조회 전용';$('saveReview').disabled=false;}
$('saveReview').onclick=async()=>{if(role!=='admin'||!reviewRun)return;const run=reviewRun;$('saveReview').disabled=true;const {error}=await auth.rpc('accc_save_review_note',{p_run:run,p_note:$('reviewNote').value});if(reviewRun!==run||!session)return;$('reviewStatus').textContent=error?'저장 실패: 관리자 권한과 로그인을 확인하세요.':'검토 메모를 저장했습니다.';$('saveReview').disabled=false;};
async function acceptSession(next){if(!next){resetLogin();return;}if(activeUser===next.user.id){session=next;return;}resetLogin();session=next;const user=next.user.id;activeUser=user;const {data,error}=await auth.rpc('accc_web_role');if(activeUser!==user)return;if(error){resetLogin();$('loginError').textContent='Google 계정의 조회 권한을 확인할 수 없습니다. 관리자 설정을 확인하세요.';return;}role=data==='admin'?'admin':'viewer';$('accountRole').textContent=role==='admin'?'관리자 · GitHub opsk123':'조회 전용';$('logout').hidden=false;await refresh();}
auth.auth.onAuthStateChange((_event,next)=>{setTimeout(()=>acceptSession(next),0);});

function downloadCsv(rows,isSession=true){const header=isSession?['검사 시각','라인','실행 구분','분류','판정','검출','세션 ID','사진 수']:['검사 시각','라인','실행 구분','분류','판정','검출','관측 ID'];const values=rows.map(r=>{const a=[r.time,r.line,r.mode,r.class,r.status,JSON.stringify(r.boxes),r.id];if(isSession)a.push(r.frame_count);return a;});const data='\ufeff'+[header,...values].map(row=>row.map(csvCell).join(',')).join('\r\n');const u=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=isSession?'accc-sessions.csv':'accc-session-photos.csv';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('csv').onclick=()=>downloadCsv(selected());
setInterval(()=>{if(session&&!$('dashboard').hidden&&$('auto').checked&&!document.hidden)refresh();},30000);
