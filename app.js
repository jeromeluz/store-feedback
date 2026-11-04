import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,deleteDoc,onSnapshot,serverTimestamp,Timestamp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,cloudinary} from './config.js';
console.info('區組回饋平台 build 20261104-13');
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='res.cloudinary.com'&&x.pathname.startsWith('/'+cloudinary.cloudName+'/')?x.href:''}catch{return ''}};
let sharedTaskId=new URLSearchParams(location.search).get('task');
const baseUrl=()=>location.origin+location.pathname;
function setTaskUrl(id){const url=new URL(baseUrl());if(id)url.searchParams.set('task',id);history.replaceState(null,'',url.href)}
function sortedTasks(items,mode){return [...items].sort((a,b)=>{const ad=mode==='deadline'?(a.deadline||'9999'):(a.time||'0000');const bd=mode==='deadline'?(b.deadline||'9999'):(b.time||'0000');return mode==='deadline'?ad.localeCompare(bd):bd.localeCompare(ad)})}
const isDraft=t=>t.status==='draft';
const isExpired=t=>expired(t);
const timeText=v=>{if(!v)return '尚未上傳';const d=v.toDate?.()||(v.seconds?new Date(v.seconds*1000):new Date(v));return Number.isNaN(d.getTime())?'尚未上傳':d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})};
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let sharedTaskOpened=false,taskSnapshotReady=false,responseSnapshotReady=false;
let store=null,admin=false,stores=[],tasks=[],answers={},editing=null,unsubs=[],saveTimers=new Map(),epoch=0,feedbackRows=[],activeFeedbackTask=null,activeResponseTask=null;
const say=s=>$('status').textContent=s;
const show=id=>['login','storePage','adminLogin','adminPage'].forEach(k=>$(k).classList.toggle('hidden',k!==id));
const stop=()=>{unsubs.forEach(f=>f());unsubs=[];saveTimers.forEach(clearTimeout);saveTimers.clear();epoch++};
const listen=(ref,fn)=>unsubs.push(onSnapshot(ref,fn,e=>say('讀取失敗：'+e.message)));
const key=(s,t)=>s+'__'+t;
async function anonymous(){if(!auth.currentUser||!auth.currentUser.isAnonymous){await signOut(auth);await signInAnonymously(auth)}}
async function logout(){setTaskUrl(null);sharedTaskId=null;stop();store=null;admin=false;localStorage.removeItem('storeName');await signOut(auth);show('login');say('請登入')}
$('storeLogout').onclick=logout;$('adminLogout').onclick=logout;$('adminEntry').onclick=()=>{stop();show('adminLogin')};$('backLogin').onclick=()=>show('login');
async function enterStore(name){stop();sharedTaskOpened=false;taskSnapshotReady=false;responseSnapshotReady=false;answers={};tasks=[];await anonymous();const snap=await getDocs(collection(db,'stores'));const match=snap.docs.map(x=>({id:x.id,...x.data()})).find(x=>x.enabled&&x.name===name);if(!match)throw Error('找不到此門市或門市已停用');store=match;admin=false;localStorage.setItem('storeName',name);show('storePage');$('storeSort').parentElement.classList.remove('hidden');$('storeTitle').textContent=name+'｜回饋任務';activeResponseTask=null;$('tasks').classList.remove('hidden');$('response').classList.add('hidden');listen(collection(db,'tasks'),s=>{tasks=s.docs.map(d=>({id:d.id,...d.data()}));taskSnapshotReady=true;renderStoreTasks();openSharedTaskIfReady()});listen(collection(db,'responses'),s=>{answers={};s.docs.forEach(d=>{const v=d.data();if(v.storeId===store.id)answers[v.taskId]=v});responseSnapshotReady=true;renderStoreTasks();openSharedTaskIfReady()});say('已連線')}
function openSharedTaskIfReady(){
 if(!sharedTaskId||sharedTaskOpened||!store||!taskSnapshotReady||!responseSnapshotReady)return;
 const t=tasks.find(x=>x.id===sharedTaskId);
 if(!t||isDraft(t)||isExpired(t)){$('sharedTaskHint').textContent='此任務不存在、尚未發布或已截止，可進入門市查看其他任務';return;}
 if(t.stores?.length&&!t.stores.includes(store.id)){
  $('sharedTaskHint').textContent='這個任務未指派給此門市，請確認門市名稱';return;
 }
 sharedTaskOpened=true;openResponse(t);
}
$('storeLoginForm').addEventListener('submit',e=>{e.preventDefault();$('enter').click()});
$('adminLoginForm').addEventListener('submit',e=>{e.preventDefault();$('adminSignIn').click()});
$('enter').onclick=async()=>{try{$('loginError').textContent='';await enterStore($('storeName').value.trim())}catch(e){$('loginError').textContent=e.message}};
// 快速登入只使用 Firebase 已保留的管理員登入狀態，不儲存帳號密碼。
$('quickAdminLogin').onclick=async()=>{
  const error=$('adminError');error.textContent='';
  const pin=prompt('請輸入快速登入驗證碼');
  if(pin===null)return;
  if(pin!=='4302'){error.textContent='驗證碼錯誤';return;}
  const user=auth.currentUser;
  if(!user||user.isAnonymous){error.textContent='此瀏覽器尚未保留管理員登入狀態，請先使用帳號密碼登入一次';return;}
  try{
    const a=await getDoc(doc(db,'admins',user.uid));
    if(!a.exists()||a.data().enabled!==true)throw Error('此帳號未獲管理者授權');
    stop();admin=true;store=null;show('adminPage');openAdmin();say('管理者已登入');
  }catch(e){error.textContent='快速登入失敗：'+e.message;}
};
$('adminSignIn').onclick=async()=>{try{$('adminError').textContent='';stop();await signOut(auth);const cred=await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);const a=await getDoc(doc(db,'admins',cred.user.uid));if(!a.exists()||a.data().enabled!==true)throw Error('此帳號未獲管理者授權');admin=true;store=null;show('adminPage');openAdmin();say('管理者已登入')}catch(e){$('adminError').textContent=e.message;admin=false;await signOut(auth).catch(()=>{})}};
function renderStoreTasks(){
 if(activeResponseTask && !tasks.some(t=>t.id===activeResponseTask&&!isDraft(t)&&!isExpired(t))){setTaskUrl(null);activeResponseTask=null;$('response').classList.add('hidden');$('tasks').classList.remove('hidden')}
 const eligible=tasks.filter(t=>!isDraft(t)&&(!t.stores?.length||t.stores.includes(store.id)));
 const live=sortedTasks(eligible.filter(t=>!isExpired(t)),$('storeSort').value);
 const past=sortedTasks(eligible.filter(isExpired),$('storeSort').value);
 const card=(t,ended)=>`<div class="card"><h3>${esc(t.title)}</h3><p>${esc(t.time)}</p><p class="muted">截止 ${esc(t.deadline||'未設定')}　${ended?'已截止':answers[t.id]?.submitted?'已完成':answers[t.id]?'填寫中':'待填寫'}</p><button ${ended?'class="secondary"':''} data-task="${esc(t.id)}">${ended?'查看已截止任務':'查看任務'}</button></div>`;
 $('tasks').innerHTML='<h2>進行中任務</h2>'+(live.map(t=>card(t,false)).join('')||'<p class="muted">目前沒有進行中任務</p>')+`<details class="card"><summary>已截止任務（${past.length}）</summary><div style="margin-top:14px">${past.map(t=>card(t,true)).join('')||'<p class="muted">沒有已截止任務</p>'}</div></details>`;
 $('tasks').querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>openResponse(tasks.find(t=>t.id===b.dataset.task)));
}
const expired=t=>!!(t.deadlineAt?.toMillis&&Date.now()>t.deadlineAt.toMillis());
function openResponse(t){if(!t||isDraft(t))return;setTaskUrl(t.id);activeResponseTask=t.id;$('tasks').classList.add('hidden');$('storeSort').parentElement.classList.add('hidden');const panel=$('response'),a=answers[t.id]?.answers||{},readonly=expired(t);panel.classList.remove('hidden');panel.innerHTML=`<button id="closeResponse" class="secondary">返回列表</button><h2>${esc(t.title)}</h2><p>${esc(t.time)}</p><p style="white-space:pre-wrap">${esc(t.description)}</p><p class="muted">截止 ${esc(t.deadline||'未設定')}</p>${(t.references||[]).map(u=>cleanUrl(u)?`<a href="${esc(cleanUrl(u))}" target="_blank" rel="noopener"><img class="preview" src="${esc(cleanUrl(u))}"></a>`:'').join('')}<div id="responseFields"></div><p id="saveState" class="muted">${readonly?'已截止 無法修改':'填寫後自動儲存'}</p><button id="submitResponse" ${readonly?'disabled':''}>完成回饋</button>`;$('closeResponse').onclick=()=>{setTaskUrl(null);sharedTaskId=null;activeResponseTask=null;panel.classList.add('hidden');$('tasks').classList.remove('hidden');$('storeSort').parentElement.classList.remove('hidden')};
$('responseFields').innerHTML=(t.questions||[]).map((q,i)=>`<div class="question"><label>${i+1}. ${esc(q.label)} ${q.required?'*':''}</label>${q.type==='yesno'?`<div class="yesno-group" role="group" aria-label="${esc(q.label)}" data-yesno="${esc(q.id)}"><button type="button" class="yesno-btn yes ${a[q.id]==='是'?'is-selected':''}" data-choice="是" aria-pressed="${a[q.id]==='是'}" ${readonly?'disabled':''}>✓ 是</button><button type="button" class="yesno-btn no ${a[q.id]==='否'?'is-selected':''}" data-choice="否" aria-pressed="${a[q.id]==='否'}" ${readonly?'disabled':''}>✕ 否</button></div>`:q.type==='text'?`<textarea data-answer="${esc(q.id)}" ${readonly?'disabled':''}>${esc(a[q.id]||'')}</textarea>`:`<input data-photo="${esc(q.id)}" type="file" accept="image/jpeg,image/png,image/webp" ${readonly?'disabled':''}><div>${cleanUrl(a[q.id])?`<a href="${esc(cleanUrl(a[q.id]))}" target="_blank" rel="noopener">查看已上傳照片</a>`:'尚未上傳'}</div>`}</div>`).join('');
$('responseFields').querySelectorAll('[data-answer]').forEach(el=>el.oninput=()=>{const v={...(answers[t.id]?.answers||{}),[el.dataset.answer]:el.value};answers[t.id]={...(answers[t.id]||{}),answers:v};queueResponse(t,v)});
$('responseFields').querySelectorAll('[data-yesno]').forEach(group=>{group.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{if(readonly)return;const choice=btn.dataset.choice;group.querySelectorAll('[data-choice]').forEach(b=>{const selected=b.dataset.choice===choice;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected))});const v={...(answers[t.id]?.answers||{}),[group.dataset.yesno]:choice};answers[t.id]={...(answers[t.id]||{}),answers:v};queueResponse(t,v)})});
$('responseFields').querySelectorAll('[data-photo]').forEach(el=>el.onchange=async()=>{try{const f=el.files[0];if(!f)return;$('saveState').textContent='照片上傳中';const u=await upload(f);const v={...(answers[t.id]?.answers||{}),[el.dataset.photo]:u};answers[t.id]={...(answers[t.id]||{}),answers:v};await persistResponse(t,v);openResponse(t)}catch(e){$('saveState').textContent='上傳失敗：'+e.message}});
$('submitResponse').onclick=async()=>{const v=answers[t.id]?.answers||{};if((t.questions||[]).some(q=>q.required&&!v[q.id]))return alert('請先完成必填題目');try{await persistResponse(t,v,true);alert('回饋已完成')}catch(e){alert('送出失敗：'+e.message)}};
}
function queueResponse(t,v){const k='r'+t.id;clearTimeout(saveTimers.get(k));$('saveState').textContent='儲存中';saveTimers.set(k,setTimeout(()=>persistResponse(t,v).catch(e=>{$('saveState').textContent='儲存失敗：'+e.message}),800))}
async function persistResponse(t,v,submitted=false){if(expired(t))throw Error('任務已截止');const payload={storeId:store.id,store:store.name,taskId:t.id,answers:v,updatedAt:serverTimestamp()};if(submitted)payload.submitted=true;await setDoc(doc(db,'responses',key(store.id,t.id)),payload,{merge:true});if($('saveState'))$('saveState').textContent='已自動儲存'}
async function upload(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('僅接受 JPG PNG WebP');if(file.size>2*1024*1024)throw Error('照片不得超過 2 MB');const fd=new FormData();fd.append('file',file);fd.append('upload_preset',cloudinary.uploadPreset);const r=await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,{method:'POST',body:fd});const j=await r.json();if(!r.ok||!cleanUrl(j.secure_url))throw Error(j.error?.message||'雲端上傳失敗');return j.secure_url}
function openAdmin(){showAdminSection('list');listen(collection(db,'stores'),s=>{stores=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));renderStores();renderStoreOptions()});listen(collection(db,'tasks'),s=>{tasks=s.docs.map(d=>({id:d.id,...d.data()}));renderAdminTasks()});listen(collection(db,'responses'),s=>{feedbackRows=s.docs.map(d=>d.data());renderAdminTasks();if(activeFeedbackTask)renderOverview(feedbackRows.filter(r=>r.taskId===activeFeedbackTask))})}
function renderStores(){$('storeList').innerHTML=stores.map(x=>`<div class="task"><strong>${esc(x.name)}</strong> <span class="pill">${x.enabled?'啟用':'停用'}</span><div><button data-rename="${x.id}" class="secondary">改名</button><button data-toggle="${x.id}" class="secondary">${x.enabled?'停用':'啟用'}</button><button data-delete="${x.id}" class="danger">刪除</button></div></div>`).join('')||'<p>尚無門市</p>';$('storeList').querySelectorAll('[data-rename]').forEach(b=>b.onclick=async()=>{const s=stores.find(x=>x.id===b.dataset.rename),name=prompt('門市名稱',s.name)?.trim();if(!name||name===s.name)return;if(stores.some(x=>x.name===name))return alert('名稱重複');await setDoc(doc(db,'stores',s.id),{name},{merge:true})});$('storeList').querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const s=stores.find(x=>x.id===b.dataset.toggle);await setDoc(doc(db,'stores',s.id),{enabled:!s.enabled},{merge:true})});$('storeList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const s=stores.find(x=>x.id===b.dataset.delete);if(confirm('確定刪除 '+s.name+'？原回饋紀錄保留'))await deleteDoc(doc(db,'stores',s.id))})}
$('addStore').onclick=async()=>{try{const name=$('newStoreName').value.trim();if(!name)return;if(stores.some(x=>x.name===name))throw Error('門市名稱已存在');await setDoc(doc(db,'stores',crypto.randomUUID()),{name,enabled:true,createdAt:serverTimestamp()});$('newStoreName').value=''}catch(e){$('storeMessage').textContent=e.message}};
function renderOverview(rows){$('overview').innerHTML=rows.map(x=>`<div class="task"><strong>${esc(x.store)}</strong> ｜ ${esc(tasks.find(t=>t.id===x.taskId)?.title||x.taskId)} <span class="pill">${x.submitted?'已完成':'填寫中'}</span><p class="muted">上傳時間：${esc(timeText(x.updatedAt))}</p><div>${Object.entries(x.answers||{}).map(([id,v])=>{const q=tasks.find(t=>t.id===x.taskId)?.questions?.find(q=>q.id===id);return `<p class="break"><b>${esc(q?.label||id)}</b>：${cleanUrl(v)?`<a href="${esc(cleanUrl(v))}" target="_blank" rel="noopener">查看照片</a>`:esc(v)}</p>`}).join('')}</div></div>`).join('')||'<p class="muted">尚無回饋</p>'}
function showAdminSection(which){clearTimeout(saveTimers.get('task'));saveTimers.delete('task');$('adminTaskList').classList.toggle('hidden',which!=='list');$('adminStores').classList.toggle('hidden',which!=='list');$('editor').classList.toggle('hidden',which!=='edit');$('taskFeedback').classList.toggle('hidden',which!=='feedback');if(which!=='edit')editing=null;if(which!=='feedback')activeFeedbackTask=null;window.scrollTo({top:0,behavior:'smooth'})}
function openTaskEditor(task){editing=structuredClone(task);showAdminSection('edit');renderEditor()}
function openTaskFeedback(t){activeFeedbackTask=t.id;$('feedbackTitle').textContent='回饋查看｜'+t.title;showAdminSection('feedback');activeFeedbackTask=t.id;renderOverview(feedbackRows.filter(r=>r.taskId===t.id))}
$('backAdminTasks').onclick=()=>showAdminSection('list');
$('backFromFeedback').onclick=()=>showAdminSection('list');
function renderAdminTasks(){
 const ordered=sortedTasks(tasks,$('adminSort').value);
 const groups=[['進行中',ordered.filter(t=>!isDraft(t)&&!isExpired(t))],['暫存任務',ordered.filter(isDraft)],['已截止',ordered.filter(t=>!isDraft(t)&&isExpired(t))]];
 const card=t=>`<div class="task"><div class="task-summary"><div><strong>${esc(t.title)}</strong><p class="muted">任務日期 ${esc(t.time)} ｜ 截止 ${esc(t.deadline||'未設定')}</p></div><span class="pill">${isDraft(t)?'暫存':isExpired(t)?'已截止':feedbackRows.filter(r=>r.taskId===t.id).length+' 筆回饋'}</span></div><div class="task-actions"><button data-edit="${esc(t.id)}">編輯</button><button class="danger" data-delete-task="${esc(t.id)}">刪除</button><button class="secondary" data-feedback="${esc(t.id)}">回饋查看</button><button class="secondary" data-export="${esc(t.id)}">匯出 Excel</button>${!isDraft(t)?`<button class="secondary" data-share="${esc(t.id)}">分享網址</button>`:''}</div></div>`;
 $('adminTasks').innerHTML=groups.map(([name,items],i)=>`<details class="task-category" ${i===0?'open':''}><summary>${name}（${items.length}）</summary><div>${items.map(card).join('')||'<p class="muted">目前沒有任務</p>'}</div></details>`).join('');
 $('adminTasks').querySelectorAll('[data-share]').forEach(b=>b.onclick=async()=>{const url=new URL(baseUrl());url.searchParams.set('task',b.dataset.share);try{await navigator.clipboard.writeText(url.href);alert('已複製任務網址\n'+url.href)}catch{prompt('請複製此任務網址',url.href)}});
 $('adminTasks').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openTaskEditor(tasks.find(t=>t.id===b.dataset.edit)));
 $('adminTasks').querySelectorAll('[data-feedback]').forEach(b=>b.onclick=()=>openTaskFeedback(tasks.find(t=>t.id===b.dataset.feedback)));
 $('adminTasks').querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportTaskExcel(tasks.find(t=>t.id===b.dataset.export)));
 $('adminTasks').querySelectorAll('[data-delete-task]').forEach(b=>b.onclick=async()=>{const t=tasks.find(x=>x.id===b.dataset.deleteTask);if(!t||!confirm('確定刪除任務「'+t.title+'」？回饋紀錄會保留'))return;try{await deleteDoc(doc(db,'tasks',t.id))}catch(e){alert('刪除失敗：'+e.message)}});
}
function exportTaskExcel(t){
 if(!t)return;
 if(typeof XLSX==='undefined'){alert('Excel 匯出元件尚未載入，請確認網路連線後重新整理');return}
 const qs=t.questions||[];
 const rows=feedbackRows.filter(r=>r.taskId===t.id).map(r=>{const row={'任務名稱':t.title,'任務日期':t.time,'截止日期':t.deadline,'門市':r.store||stores.find(s=>s.id===r.storeId)?.name||r.storeId,'狀態':r.submitted?'已完成':'填寫中','上傳時間':timeText(r.updatedAt)};qs.forEach((q,i)=>row[`${i+1}. ${q.label}`]=r.answers?.[q.id]||'');return row});
 const headers=['任務名稱','任務日期','截止日期','門市','狀態','上傳時間',...qs.map((q,i)=>`${i+1}. ${q.label}`)];
 const ws=XLSX.utils.json_to_sheet(rows,{header:headers});if(!rows.length)XLSX.utils.sheet_add_aoa(ws,[headers],{origin:'A1'});
 ws['!cols']=headers.map((h,i)=>({wch:i<6?20:36}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'門市回饋');
 const filename=t.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,55)||'任務';XLSX.writeFile(wb,`${filename}_回饋彙整.xlsx`);
}

$('newTask').onclick=()=>{editing={id:crypto.randomUUID(),title:'',time:todayLocal(),description:'',deadline:'',stores:[],references:[],questions:[],status:'draft'};showAdminSection('edit');renderEditor()};
function renderStoreOptions() {if(!editing)return;$('taskStoreOptions').innerHTML=stores.map(s=>`<label style="display:inline-block;margin:7px"><input style="width:auto;display:inline" type="checkbox" data-store="${s.id}" ${(editing.stores||[]).includes(s.id)?'checked':''}> ${esc(s.name)}</label>`).join('');$('taskStoreOptions').querySelectorAll('[data-store]').forEach(el=>el.onchange=()=>{editing.stores=[...$('taskStoreOptions').querySelectorAll('[data-store]:checked')].map(x=>x.dataset.store);queueTask()})}
function renderEditor(){if(!editing)return;$('editor').classList.remove('hidden');for(const [id,field] of [['taskTitle','title'],['taskTime','time'],['taskDesc','description'],['taskDeadline','deadline']])$(id).value=editing[field]||'';$('taskStatus').value=editing.status||'published';renderStoreOptions();renderReferences();renderQuestions();$('editorStatus').textContent=validateTask(editing)?'請填寫全部必填欄位，完成後自動儲存':'修改後自動儲存'}
for(const [id,field] of [['taskTitle','title'],['taskTime','time'],['taskDesc','description'],['taskDeadline','deadline']])$(id).oninput=()=>{if(!editing)return;editing[field]=$(id).value;queueTask()};
$('taskStatus').onchange=()=>{if(!editing)return;editing.status=$('taskStatus').value;queueTask()};
function renderReferences(){$('referenceList').innerHTML=(editing.references||[]).map((u,i)=>`<div><a href="${esc(cleanUrl(u))}" target="_blank" rel="noopener"><img class="preview" src="${esc(cleanUrl(u))}"></a><button class="secondary" data-ref="${i}">移除</button></div>`).join('');$('referenceList').querySelectorAll('[data-ref]').forEach(b=>b.onclick=()=>{editing.references.splice(+b.dataset.ref,1);renderReferences();queueTask()})}
$('reference').onchange=async e=>{const id=editing?.id;for(const f of e.target.files){try{$('editorStatus').textContent='照片上傳中';const u=await upload(f);if(editing?.id!==id)break;editing.references.push(u);renderReferences();queueTask()}catch(err){$('editorStatus').textContent=err.message}}e.target.value=''};
function renderQuestions(){$('questionEditor').innerHTML=(editing.questions||[]).map((q,i)=>`<div class="task" data-i="${i}"><input data-field="label" placeholder="題目名稱" value="${esc(q.label)}"><select data-field="type"><option value="yesno" ${q.type==='yesno'?'selected':''}>是／否</option><option value="text" ${q.type==='text'?'selected':''}>文字輸入</option><option value="image" ${q.type==='image'?'selected':''}>上傳照片</option></select><label><input style="width:auto;display:inline" type="checkbox" data-field="required" ${q.required?'checked':''}> 必填</label><button data-remove class="secondary">刪除題目</button></div>`).join('');$('questionEditor').querySelectorAll('[data-i]').forEach(div=>{const i=+div.dataset.i;div.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{editing.questions[i][el.dataset.field]=el.type==='checkbox'?el.checked:el.value;queueTask()});div.querySelector('[data-remove]').onclick=()=>{editing.questions.splice(i,1);renderQuestions();queueTask()}})}
$('addQuestion').onclick=()=>{editing.questions.push({id:crypto.randomUUID(),label:'',type:'yesno',required:false});renderQuestions();queueTask()};
function validateTask(t){if(!t.title?.trim())return '請填寫任務名稱';if(!/^\d{4}-\d{2}-\d{2}$/.test(t.time||''))return '請選擇任務日期';if(!t.description?.trim())return '請填寫任務說明';if(!t.deadline||Number.isNaN(new Date(t.deadline).getTime()))return '請設定截止時間';if(!t.questions?.length)return '請至少新增一個回饋題目';if(t.questions.some(q=>!q.label?.trim()))return '所有回饋題目名稱都要填寫';return ''}
function queueTask(){const invalid=editing.status==='draft'?'':validateTask(editing);if(invalid){clearTimeout(saveTimers.get('task'));$('editorStatus').textContent='尚未儲存：'+invalid;return}const snap=structuredClone(editing),n=epoch,k='task';clearTimeout(saveTimers.get(k));$('editorStatus').textContent='等待儲存';saveTimers.set(k,setTimeout(()=>{if(epoch===n && editing?.id===snap.id)persistTask(snap).catch(e=>$('editorStatus').textContent='儲存失敗：'+e.message)},850))}
async function persistTask(t){const invalid=t.status==='draft'?'':validateTask(t);if(invalid)throw Error(invalid);const data={title:t.title,time:t.time,description:t.description,deadline:t.deadline,stores:t.stores||[],references:t.references||[],questions:t.questions||[],status:t.status||'published',updatedAt:serverTimestamp()};if(t.deadline){const d=new Date(t.deadline);if(Number.isNaN(d.getTime()))throw Error('截止日期無效');data.deadlineAt=Timestamp.fromDate(d)}else data.deadlineAt=null;await setDoc(doc(db,'tasks',t.id),data);$('editorStatus').textContent='已自動儲存'}

$('storeSort').onchange=()=>{if(store)renderStoreTasks()};$('adminSort').onchange=()=>{if(admin)renderAdminTasks()};$('saveTaskNow').onclick=async()=>{if(!editing)return;try{await persistTask(structuredClone(editing));$('editorStatus').textContent='儲存成功'}catch(e){$('editorStatus').textContent='尚未儲存：'+e.message}};onAuthStateChanged(auth,()=>{});say('請登入');
