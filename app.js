import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signInAnonymously,signInWithEmailAndPassword,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,deleteDoc,onSnapshot,serverTimestamp,Timestamp,runTransaction,query,where} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {firebaseConfig,cloudinary} from './config.js';
console.info('區組回饋平台 build 20261104-23');
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cleanUrl=u=>{try{const x=new URL(u);return x.protocol==='https:'&&x.hostname==='res.cloudinary.com'&&x.pathname.startsWith('/'+cloudinary.cloudName+'/')?x.href:''}catch{return ''}};
let sharedTaskId=new URLSearchParams(location.search).get('task');
const baseUrl=()=>location.origin+location.pathname;
function setTaskUrl(id){const url=new URL(baseUrl());if(id){url.searchParams.set('task',id);if(ownerId)url.searchParams.set('group',ownerId)};history.replaceState(null,'',url.href)}
function sortedTasks(items,mode){return [...items].sort((a,b)=>{const ad=mode==='deadline'?(a.deadline||'9999'):(a.time||'0000');const bd=mode==='deadline'?(b.deadline||'9999'):(b.time||'0000');return mode==='deadline'?ad.localeCompare(bd):bd.localeCompare(ad)})}
const isDraft=t=>t.status==='draft';
const isExpired=t=>expired(t);
const timeText=v=>{if(!v)return '尚未上傳';const d=v.toDate?.()||(v.seconds?new Date(v.seconds*1000):new Date(v));return Number.isNaN(d.getTime())?'尚未上傳':d.toLocaleString('zh-TW',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})};
const todayLocal=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const responseWrites=new Map();
let sharedTaskOpened=false,taskSnapshotReady=false,responseSnapshotReady=false;
let ownerId=null,store=null,admin=false,stores=[],tasks=[],answers={},editing=null,unsubs=[],saveTimers=new Map(),epoch=0,feedbackRows=[],activeFeedbackTask=null,activeResponseTask=null;
const say=s=>$('status').textContent=s;
const show=id=>{['login','storePage','adminLogin','adminPage'].forEach(k=>$(k).classList.toggle('hidden',k!==id));$('storeLogout').classList.toggle('hidden',id!=='storePage');$('adminLogout').classList.toggle('hidden',id!=='adminPage');};
const stop=()=>{unsubs.forEach(f=>f());unsubs=[];saveTimers.forEach(clearTimeout);saveTimers.clear();epoch++};
const listen=(ref,fn)=>unsubs.push(onSnapshot(ref,fn,e=>say('讀取失敗：'+e.message)));
const key=(s,t)=>s+'__'+t;
const scoped=(type,id)=>id?doc(db,'groups',ownerId,type,id):collection(db,'groups',ownerId,type);
const directoryId=name=>encodeURIComponent(name.normalize('NFC').trim());
const codeRef=code=>doc(db,'storeCodes',String(code).trim());
let catalog=[];
async function loadCatalog(){if(catalog.length)return catalog;const response=await fetch('./store-catalog.json?build=20261104-23');if(!response.ok)throw Error('門市名冊載入失敗');catalog=await response.json();return catalog;}
const catalogByCode=code=>catalog.find(x=>x.code===String(code));
const displayStore=s=>s.code?`${s.name}(${s.code})`:s.name;

async function anonymous(){if(!auth.currentUser||!auth.currentUser.isAnonymous){await signOut(auth);await signInAnonymously(auth)}}
async function logout(){setTaskUrl(null);sharedTaskId=null;stop();store=null;ownerId=null;admin=false;localStorage.removeItem('storeName');await signOut(auth);show('login');say('請登入')}
$('storeLogout').onclick=logout;$('adminLogout').onclick=logout;$('backLogin').onclick=()=>{location.href=baseUrl()};
async function enterStore(name){
 stop();sharedTaskOpened=false;taskSnapshotReady=false;responseSnapshotReady=false;answers={};tasks=[];
 await anonymous();
 const input=name.trim();
 let match;
 if(/^\d+$/.test(input)){
  const code=await getDoc(codeRef(input));
  if(!code.exists()||!code.data().enabled)throw Error('找不到此店號或門市已停用');
  match=code.data();
 }else{
  const dir=await getDoc(doc(db,'storeDirectory',directoryId(input)));
  if(!dir.exists()||!dir.data().enabled)throw Error('找不到此門市或門市已停用，請確認名稱或輸入店號');
  match=dir.data();
  if(match.ambiguous){await chooseSameNameStore(input);return;}
 }
 ownerId=match.ownerId;const linkGroup=new URLSearchParams(location.search).get('group');if(sharedTaskId&&linkGroup&&linkGroup!==ownerId)throw Error('此分享任務不屬於這間門市');
 const snap=await getDoc(scoped('stores',match.storeId));
 if(!snap.exists()||!snap.data().enabled||snap.data().name!==match.name)throw Error('門市資料無效，請聯絡管理員');
 store={id:snap.id,...snap.data()};admin=false;localStorage.setItem('storeName',store.code||store.name);
 show('storePage');$('storeSort').parentElement.classList.remove('hidden');$('storeBack').classList.add('hidden');$('storeTitle').textContent=displayStore(store)+'｜回饋任務';activeResponseTask=null;$('tasks').classList.remove('hidden');$('response').classList.add('hidden');
 listen(query(scoped('tasks'),where('status','==','published')),s=>{tasks=s.docs.map(d=>({id:d.id,...d.data()}));taskSnapshotReady=true;renderStoreTasks();openSharedTaskIfReady()});
 listen(scoped('responses'),s=>{answers={};s.docs.forEach(d=>{const v=d.data();if(v.storeId===store.id)answers[v.taskId]=v});responseSnapshotReady=true;renderStoreTasks();openSharedTaskIfReady()});say('已連線')
}
function openSharedTaskIfReady(){
 if(!sharedTaskId||sharedTaskOpened||!store||!taskSnapshotReady||!responseSnapshotReady)return;
 const t=tasks.find(x=>x.id===sharedTaskId);
 if(!t||isDraft(t)||isExpired(t)||!withinStoreWindow(t)){$('sharedTaskHint').textContent='此任務不存在、尚未發布或已截止，可進入門市查看其他任務';return;}
 if(t.stores?.length&&!t.stores.includes(store.id)){
  $('sharedTaskHint').textContent='這個任務未指派給此門市，請確認門市名稱';return;
 }
 sharedTaskOpened=true;openResponse(t);
}
// 同名門市先依區課確認，再用店號完成既有登入及權限檢查。
async function chooseSameNameStore(name){
 await loadCatalog();
 const matches=catalog.filter(x=>x.name.normalize('NFC').trim()===name.normalize('NFC').trim());
 if(!matches.length)throw Error('找不到同名門市資料，請改用店號登入');
 const dialog=$('duplicateStorePicker'),options=$('duplicateStoreOptions');
 $('duplicateStoreName').textContent=name;
 $('duplicateStoreError').textContent='';
 options.innerHTML=matches.map(x=>`<button type="button" class="picker-option" data-store-code="${esc(x.code)}">${esc(x.area)}　｜　${esc(x.name)} (${esc(x.code)})</button>`).join('');
 options.querySelectorAll('button').forEach(button=>button.onclick=async()=>{
  options.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
   // 先驗證店號是否已由管理員加入，避免將其他區組門市登入成功。
   await enterStore(button.dataset.storeCode);
   dialog.close();
  }catch(e){$('duplicateStoreError').textContent=e.message;options.querySelectorAll('button').forEach(b=>b.disabled=false)}
 });
 dialog.showModal();
}
$('closeDuplicateStorePicker').onclick=()=>$('duplicateStorePicker').close();
$('duplicateStorePicker').addEventListener('click',e=>{if(e.target===$('duplicateStorePicker'))$('duplicateStorePicker').close()});
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
    stop();admin=true;store=null;ownerId=user.uid;show('adminPage');openAdmin();say('管理者已登入');
  }catch(e){error.textContent='快速登入失敗：'+e.message;}
};
$('adminSignIn').onclick=async()=>{try{$('adminError').textContent='';stop();await signOut(auth);const cred=await signInWithEmailAndPassword(auth,$('email').value.trim(),$('password').value);const a=await getDoc(doc(db,'admins',cred.user.uid));if(!a.exists()||a.data().enabled!==true)throw Error('此帳號未獲管理者授權');admin=true;store=null;ownerId=cred.user.uid;show('adminPage');openAdmin();say('管理者已登入')}catch(e){$('adminError').textContent=e.message;admin=false;await signOut(auth).catch(()=>{})}};
// 門市僅顯示任務日期在最近 14 個日曆日內（含今天）或未來日期的任務。
// 以本地日期比較，避免跨時區造成日期偏移。
function withinStoreWindow(t){const day=t.time;if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return false;const today=new Date();today.setHours(0,0,0,0);const earliest=new Date(today);earliest.setDate(earliest.getDate()-13);return day>=`${earliest.getFullYear()}-${String(earliest.getMonth()+1).padStart(2,'0')}-${String(earliest.getDate()).padStart(2,'0')}`;}
function renderStoreTasks(){
 if(activeResponseTask && !tasks.some(t=>t.id===activeResponseTask&&!isDraft(t)&&!isExpired(t))){setTaskUrl(null);activeResponseTask=null;$('response').classList.add('hidden');$('tasks').classList.remove('hidden');$('storeBack').classList.add('hidden')}
 const eligible=tasks.filter(t=>!isDraft(t)&&withinStoreWindow(t)&&(!t.stores?.length||t.stores.includes(store.id)));
 const live=sortedTasks(eligible.filter(t=>!isExpired(t)),$('storeSort').value);
 const past=sortedTasks(eligible.filter(isExpired),$('storeSort').value);
 const card=(t,ended)=>`<div class="card store-task-card" role="button" tabindex="0" data-task="${esc(t.id)}" aria-label="開啟任務 ${esc(t.title)}"><h3>${esc(t.title)}</h3><p>${esc(t.time)}</p><p class="muted">截止 ${esc(t.deadline||'未設定')}　${ended?'已截止':answers[t.id]?.submitted?'已完成':answers[t.id]?'填寫中':'待填寫'}</p></div>`;
 const ongoing=live.filter(t=>!answers[t.id]?.submitted);
 const completed=live.filter(t=>!!answers[t.id]?.submitted);
 $('tasks').innerHTML='<h2>進行中任務</h2>'+(ongoing.map(t=>card(t,false)).join('')||'<p class="muted">目前沒有進行中任務</p>')+`<details class="card"><summary>已完成任務（${completed.length}）</summary><div style="margin-top:14px">${completed.map(t=>card(t,false)).join('')||'<p class="muted">目前沒有已完成任務</p>'}</div></details><details class="card"><summary>已截止任務（${past.length}）</summary><div style="margin-top:14px">${past.map(t=>card(t,true)).join('')||'<p class="muted">沒有已截止任務</p>'}</div></details>`;
 $('tasks').querySelectorAll('[data-task]').forEach(card=>{const open=()=>openResponse(tasks.find(t=>t.id===card.dataset.task));card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
}
const expired=t=>!!(t.deadlineAt?.toMillis&&Date.now()>t.deadlineAt.toMillis());
function openResponse(t){if(!t||isDraft(t)||!withinStoreWindow(t))return;setTaskUrl(t.id);activeResponseTask=t.id;$('tasks').classList.add('hidden');$('storeSort').parentElement.classList.add('hidden');const panel=$('response'),a=answers[t.id]?.answers||{},readonly=expired(t);$('storeBack').classList.remove('hidden');panel.classList.remove('hidden');panel.innerHTML=`<h2>${esc(t.title)}</h2><p>${esc(t.time)}</p><p style="white-space:pre-wrap">${esc(t.description)}</p><p class="muted">截止 ${esc(t.deadline||'未設定')}</p>${(t.references||[]).map(u=>cleanUrl(u)?`<button type="button" class="image-trigger" data-lightbox="${esc(cleanUrl(u))}" aria-label="放大查看參考照片"><img class="preview" src="${esc(cleanUrl(u))}" alt="參考照片"></button>`:'').join('')}<div id="responseFields"></div><p id="saveState" class="muted">${readonly?'已截止 無法修改':'填寫後自動儲存'}</p><button id="submitResponse" ${readonly?'disabled':''}>完成回饋</button>`;$('storeBack').onclick=()=>{setTaskUrl(null);sharedTaskId=null;activeResponseTask=null;panel.classList.add('hidden');$('tasks').classList.remove('hidden');$('storeSort').parentElement.classList.remove('hidden');$('storeBack').classList.add('hidden');renderStoreTasks()};
$('responseFields').innerHTML=(t.questions||[]).map((q,i)=>`<div class="question"><label>${i+1}. ${esc(q.label)} ${q.required?'*':''}</label>${q.type==='yesno'?`<div class="yesno-group" role="group" aria-label="${esc(q.label)}" data-yesno="${esc(q.id)}"><button type="button" class="yesno-btn yes ${a[q.id]==='是'?'is-selected':''}" data-choice="是" aria-pressed="${a[q.id]==='是'}" ${readonly?'disabled':''}>✓ 是</button><button type="button" class="yesno-btn no ${a[q.id]==='否'?'is-selected':''}" data-choice="否" aria-pressed="${a[q.id]==='否'}" ${readonly?'disabled':''}>✕ 否</button></div>`:q.type==='text'?`<textarea data-answer="${esc(q.id)}" ${readonly?'disabled':''}>${esc(a[q.id]||'')}</textarea>`:`<input data-photo="${esc(q.id)}" type="file" accept="image/jpeg,image/png,image/webp" ${readonly?'disabled':''}><div>${cleanUrl(a[q.id])?`<button type="button" class="image-trigger photo-link" data-lightbox="${esc(cleanUrl(a[q.id]))}">查看已上傳照片</button>`:'尚未上傳'}</div>`}</div>`).join('');
$('responseFields').querySelectorAll('[data-answer]').forEach(el=>el.oninput=()=>{const v={...(answers[t.id]?.answers||{}),[el.dataset.answer]:el.value};answers[t.id]={...(answers[t.id]||{}),answers:v};queueResponse(t,v)});
$('responseFields').querySelectorAll('[data-yesno]').forEach(group=>{group.querySelectorAll('[data-choice]').forEach(btn=>btn.onclick=()=>{if(readonly)return;const choice=btn.dataset.choice;group.querySelectorAll('[data-choice]').forEach(b=>{const selected=b.dataset.choice===choice;b.classList.toggle('is-selected',selected);b.setAttribute('aria-pressed',String(selected))});const v={...(answers[t.id]?.answers||{}),[group.dataset.yesno]:choice};answers[t.id]={...(answers[t.id]||{}),answers:v};queueResponse(t,v)})});
$('responseFields').querySelectorAll('[data-photo]').forEach(el=>el.onchange=async()=>{try{const f=el.files[0];if(!f)return;$('saveState').textContent='照片上傳中';const u=await upload(f);const v={...(answers[t.id]?.answers||{}),[el.dataset.photo]:u};answers[t.id]={...(answers[t.id]||{}),answers:v};await persistResponse(t,v);openResponse(t)}catch(e){$('saveState').textContent='上傳失敗：'+e.message}});
$('submitResponse').onclick=async()=>{const v=answers[t.id]?.answers||{};if(!allQuestionsAnswered(t,v))return alert('請先完成所有題目');try{await persistResponse(t,v,true);alert('回饋已完成')}catch(e){alert('送出失敗：'+e.message)}};
}
function allQuestionsAnswered(t,v){const questions=t.questions||[];return questions.length>0&&questions.every(q=>{const answer=v[q.id];return typeof answer==='string'&&answer.trim().length>0})}
function queueResponse(t,v){const k='r'+t.id;clearTimeout(saveTimers.get(k));$('saveState').textContent='儲存中';saveTimers.set(k,setTimeout(()=>persistResponse(t,v).catch(e=>{if(activeResponseTask===t.id)$('saveState').textContent='儲存失敗：'+e.message}),800))}
async function persistResponse(t,v,forceSubmit=false){
 if(expired(t))throw Error('任務已截止');
 const submitted=forceSubmit||allQuestionsAnswered(t,v);
 const payload={ownerId,storeId:store.id,store:store.name,taskId:t.id,answers:v,submitted,updatedAt:serverTimestamp()};
 const previous=responseWrites.get(t.id)||Promise.resolve();
 const write=previous.catch(()=>{}).then(()=>setDoc(scoped('responses',key(store.id,t.id)),payload,{merge:true}));
 responseWrites.set(t.id,write);await write;
 if(activeResponseTask===t.id&&$('saveState'))$('saveState').textContent=submitted?'回饋已完成並自動儲存':'已自動儲存';
 // 即使門市立刻返回列表，也會由 Firestore 即時更新狀態。
}
async function upload(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('僅接受 JPG PNG WebP');if(file.size>2*1024*1024)throw Error('照片不得超過 2 MB');const fd=new FormData();fd.append('file',file);fd.append('upload_preset',cloudinary.uploadPreset);const r=await fetch(`https://api.cloudinary.com/v1_1/${cloudinary.cloudName}/image/upload`,{method:'POST',body:fd});const j=await r.json();if(!r.ok||!cleanUrl(j.secure_url))throw Error(j.error?.message||'雲端上傳失敗');return j.secure_url}
function openAdmin(){showAdminSection('list');listen(scoped('stores'),s=>{stores=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.name.localeCompare(b.name,'zh-Hant'));renderStores();renderStoreOptions()});listen(scoped('tasks'),s=>{tasks=s.docs.map(d=>({id:d.id,...d.data()}));renderAdminTasks()});listen(scoped('responses'),s=>{feedbackRows=s.docs.map(d=>d.data());renderAdminTasks();if(activeFeedbackTask)renderOverview(feedbackRows.filter(r=>r.taskId===activeFeedbackTask))})}
async function addOwnedStore(entry){
 const {name,code,area}=entry;
 const id=crypto.randomUUID(),ref=doc(db,'storeDirectory',directoryId(name)),codeDoc=codeRef(code),storeRef=scoped('stores',id);
 // 同名門市可以分別加入，店號是唯一識別；同名登入只在唯一時有效。
 await runTransaction(db,async tx=>{
  const old=await tx.get(ref),existingCode=await tx.get(codeDoc);
  if(existingCode.exists())throw Error('此店號已被其他區組新增');
  const nameData={ownerId,storeId:id,name,enabled:true};
  if(old.exists()){
   if(old.data().ownerId===ownerId && old.data().ambiguous!==true){tx.update(ref,{ambiguous:true});}
  }else tx.set(ref,nameData);
  tx.set(codeDoc,{...nameData,code,area});
  tx.set(storeRef,{...nameData,code,area,createdAt:serverTimestamp()});
 });
}
async function renameOwnedStore(s,name){
 const oldRef=doc(db,'storeDirectory',directoryId(s.name)),newRef=doc(db,'storeDirectory',directoryId(name));
 await runTransaction(db,async tx=>{const old=await tx.get(oldRef),next=await tx.get(newRef);if(!old.exists()||old.data().ownerId!==ownerId||old.data().storeId!==s.id)throw Error('原門市對照資料不正確');if(next.exists())throw Error('此門市名稱已被使用');tx.delete(oldRef);tx.set(newRef,{ownerId,storeId:s.id,name,enabled:s.enabled});tx.update(scoped('stores',s.id),{name})});
}
async function toggleOwnedStore(s){
 const ref=s.code?codeRef(s.code):doc(db,'storeDirectory',directoryId(s.name));
 await runTransaction(db,async tx=>{const d=await tx.get(ref);if(!d.exists()||d.data().ownerId!==ownerId||d.data().storeId!==s.id)throw Error('門市對照資料不正確');tx.update(ref,{enabled:!s.enabled});tx.update(scoped('stores',s.id),{enabled:!s.enabled})});
}
async function deleteOwnedStore(s){
 const ref=s.code?codeRef(s.code):doc(db,'storeDirectory',directoryId(s.name));
 await runTransaction(db,async tx=>{const d=await tx.get(ref);if(!d.exists()||d.data().ownerId!==ownerId||d.data().storeId!==s.id)throw Error('門市對照資料不正確');tx.delete(ref);tx.delete(scoped('stores',s.id))});
}
function renderStores(){
 $('storeList').innerHTML=stores.map(x=>`<div class="task"><strong>${esc(displayStore(x))}</strong> <span class="pill">${x.enabled?'啟用':'停用'}</span><div class="store-detail">${esc(x.area||'舊門市資料')}</div><div>${!x.code?`<button data-rename="${x.id}" class="secondary">改名</button>`:''}<button data-toggle="${x.id}" class="secondary">${x.enabled?'停用':'啟用'}</button><button data-delete="${x.id}" class="danger">刪除</button></div></div>`).join('')||'<p>尚無門市</p>';
 $('storeList').querySelectorAll('[data-rename]').forEach(b=>b.onclick=async()=>{const x=stores.find(z=>z.id===b.dataset.rename),name=prompt('門市名稱',x.name)?.trim();if(!name||name===x.name)return;try{await renameOwnedStore(x,name)}catch(e){alert('改名失敗：'+e.message)}});
 $('storeList').querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{try{await toggleOwnedStore(stores.find(x=>x.id===b.dataset.toggle))}catch(e){alert(e.message)}});
 $('storeList').querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const x=stores.find(z=>z.id===b.dataset.delete);if(confirm('確定刪除 '+displayStore(x)+'？原回饋紀錄保留'))try{await deleteOwnedStore(x)}catch(e){alert(e.message)}});
}
function renderPicker(){
 const area=$('pickerArea').value,search=$('pickerSearch').value.trim().toLowerCase();
 const filtered=catalog.filter(x=>x.area===area&&(!search||x.name.toLowerCase().includes(search)||x.code.includes(search)));
 $('pickerOptions').innerHTML=filtered.map(x=>{const used=stores.some(s=>s.code===x.code);return `<button type="button" class="picker-option" data-code="${esc(x.code)}" ${used?'disabled':''}>${esc(x.name)} (${esc(x.code)})${used?' · 已新增':''}</button>`}).join('')||'<p class="muted">請選擇區課，或沒有符合的門市</p>';
 $('pickerOptions').querySelectorAll('[data-code]').forEach(btn=>btn.onclick=async()=>{const x=catalogByCode(btn.dataset.code);if(!x)return;btn.disabled=true;$('pickerMessage').textContent='新增中…';try{await addOwnedStore(x);$('pickerMessage').textContent='已新增 '+displayStore(x);$('storeMessage').textContent='新增成功：'+displayStore(x);$('storePicker').close()}catch(e){$('pickerMessage').textContent='新增失敗：'+e.message;btn.disabled=false}});
}
$('addStore').onclick=async()=>{try{await loadCatalog();const areas=[...new Set(catalog.map(x=>x.area))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));$('pickerArea').innerHTML='<option value="">請選擇區課</option>'+areas.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('pickerSearch').value='';$('pickerMessage').textContent='';renderPicker();$('storePicker').showModal()}catch(e){$('storeMessage').textContent=e.message}};
$('closeStorePicker').onclick=()=>$('storePicker').close();
$('pickerArea').onchange=renderPicker;
$('pickerSearch').oninput=renderPicker;
function renderOverview(rows){$('overview').innerHTML=rows.map(x=>`<div class="task"><strong>${esc(displayStore(stores.find(s=>s.id===x.storeId)||{name:x.store}))}</strong> ｜ ${esc(tasks.find(t=>t.id===x.taskId)?.title||x.taskId)} <span class="pill">${x.submitted?'已完成':'填寫中'}</span><p class="muted">上傳時間：${esc(timeText(x.updatedAt))}</p><div>${Object.entries(x.answers||{}).map(([id,v])=>{const q=tasks.find(t=>t.id===x.taskId)?.questions?.find(q=>q.id===id);return `<p class="break"><b>${esc(q?.label||id)}</b>：${cleanUrl(v)?`<button type="button" class="image-trigger photo-link" data-lightbox="${esc(cleanUrl(v))}">查看照片</button>`:esc(v)}</p>`}).join('')}</div></div>`).join('')||'<p class="muted">尚無回饋</p>'}
let adminArea='tasks';
function showAdminSection(which){
 clearTimeout(saveTimers.get('task'));saveTimers.delete('task');
 if(which==='stores')adminArea='stores';else if(which==='list'||which==='edit'||which==='feedback')adminArea='tasks';
 $('adminTaskList').classList.toggle('hidden',which!=='list');
 $('adminStores').classList.toggle('hidden',which!=='stores');
 $('editor').classList.toggle('hidden',which!=='edit');
 $('taskFeedback').classList.toggle('hidden',which!=='feedback');
 $('navTasks').classList.toggle('active',adminArea==='tasks');
 $('navStores').classList.toggle('active',adminArea==='stores');
 if(which!=='edit')editing=null;
 if(which!=='feedback')activeFeedbackTask=null;
 window.scrollTo({top:0,behavior:'smooth'});
}
$('navTasks').onclick=()=>showAdminSection('list');
$('navStores').onclick=()=>showAdminSection('stores');
function openTaskEditor(task){editing=structuredClone(task);showAdminSection('edit');renderEditor()}
function openTaskFeedback(t){activeFeedbackTask=t.id;$('feedbackTitle').textContent='回饋查看｜'+t.title;showAdminSection('feedback');activeFeedbackTask=t.id;renderOverview(feedbackRows.filter(r=>r.taskId===t.id))}
$('backAdminTasks').onclick=()=>showAdminSection('list');
$('backFromFeedback').onclick=()=>showAdminSection('list');
function renderAdminTasks(){
 const selectedDate=$('adminDate').value;const ordered=sortedTasks(selectedDate?tasks.filter(t=>t.time===selectedDate):tasks,$('adminSort').value);
 const groups=[['進行中',ordered.filter(t=>!isDraft(t)&&!isExpired(t))],['暫存任務',ordered.filter(isDraft)],['已截止',ordered.filter(t=>!isDraft(t)&&isExpired(t))]];
 const card=t=>`<div class="task"><div class="task-summary"><div><strong>${esc(t.title)}</strong><p class="muted">任務日期 ${esc(t.time)} ｜ 截止 ${esc(t.deadline||'未設定')}</p></div><span class="pill">${isDraft(t)?'暫存':isExpired(t)?'已截止':feedbackRows.filter(r=>r.taskId===t.id).length+' 筆回饋'}</span></div><div class="task-actions"><button type="button" class="task-menu-toggle" aria-label="${esc(t.title)} 操作選單" aria-expanded="false" aria-haspopup="true">⋯</button><div class="task-menu" hidden><button data-edit="${esc(t.id)}">編輯任務</button><button data-duplicate="${esc(t.id)}">複製任務</button><button data-feedback="${esc(t.id)}">查看回饋</button><button data-export="${esc(t.id)}">匯出 Excel</button>${!isDraft(t)?`<button data-share="${esc(t.id)}">複製分享網址</button>`:''}<button class="danger" data-delete-task="${esc(t.id)}">刪除任務</button></div></div></div>`;
 $('adminTasks').innerHTML=groups.map(([name,items],i)=>`<details class="task-category" ${i===0?'open':''}><summary>${name}（${items.length}）</summary><div>${items.map(card).join('')||'<p class="muted">目前沒有任務</p>'}</div></details>`).join('');
 $('adminTasks').querySelectorAll('.task-menu-toggle').forEach(b=>b.onclick=e=>{e.stopPropagation();const menu=b.nextElementSibling,open=menu.hidden;$('adminTasks').querySelectorAll('.task-menu').forEach(m=>{m.hidden=true;m.previousElementSibling.setAttribute('aria-expanded','false')});menu.hidden=!open;b.setAttribute('aria-expanded',String(open))});
 $('adminTasks').querySelectorAll('[data-duplicate]').forEach(b=>b.onclick=()=>duplicateTask(tasks.find(t=>t.id===b.dataset.duplicate)));
 $('adminTasks').querySelectorAll('[data-share]').forEach(b=>b.onclick=async()=>{const url=new URL(baseUrl());url.searchParams.set('task',b.dataset.share);url.searchParams.set('group',ownerId);try{await navigator.clipboard.writeText(url.href);alert('已複製任務網址\n'+url.href)}catch{prompt('請複製此任務網址',url.href)}});
 $('adminTasks').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openTaskEditor(tasks.find(t=>t.id===b.dataset.edit)));
 $('adminTasks').querySelectorAll('[data-feedback]').forEach(b=>b.onclick=()=>openTaskFeedback(tasks.find(t=>t.id===b.dataset.feedback)));
 $('adminTasks').querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportTaskExcel(tasks.find(t=>t.id===b.dataset.export)));
 $('adminTasks').querySelectorAll('[data-delete-task]').forEach(b=>b.onclick=async()=>{const t=tasks.find(x=>x.id===b.dataset.deleteTask);if(!t||!confirm('確定刪除任務「'+t.title+'」？回饋紀錄會保留'))return;try{await deleteDoc(scoped('tasks',t.id))}catch(e){alert('刪除失敗：'+e.message)}});
}
document.addEventListener('click',e=>{if(!e.target.closest('.task-actions'))document.querySelectorAll('.task-menu').forEach(m=>{m.hidden=true;m.previousElementSibling?.setAttribute('aria-expanded','false')})});
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.task-menu').forEach(m=>{m.hidden=true;m.previousElementSibling?.setAttribute('aria-expanded','false')})});
function tomorrowEndLocal(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(23,59,0,0);const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T23:59`}
function duplicateTask(t){
 if(!t)return;
 // 保留內容、題目、指定門市與參考照片，建立全新 ID，不帶入原回饋。
 const copy=structuredClone(t);
 editing={id:crypto.randomUUID(),title:copy.title,time:todayLocal(),description:copy.description||'',deadline:tomorrowEndLocal(),stores:[...(copy.stores||[])],references:[...(copy.references||[])],questions:(copy.questions||[]).map(q=>({...q,id:crypto.randomUUID()})),status:'published'};
 showAdminSection('edit');renderEditor();
 $('editorStatus').textContent='已套用複製內容，任務日期為今天，截止為明天 23:59。確認後按「儲存任務」建立新任務';
}
function exportTaskExcel(t){
 if(!t)return;
 if(typeof XLSX==='undefined'){alert('Excel 匯出元件尚未載入，請確認網路連線後重新整理');return}
 const qs=t.questions||[];
 const rows=feedbackRows.filter(r=>r.taskId===t.id).map(r=>{const row={'任務名稱':t.title,'任務日期':t.time,'截止日期':t.deadline,'門市':displayStore(stores.find(s=>s.id===r.storeId)||{name:r.store||r.storeId}),'狀態':r.submitted?'已完成':'填寫中','上傳時間':timeText(r.updatedAt)};qs.forEach((q,i)=>row[`${i+1}. ${q.label}`]=r.answers?.[q.id]||'');return row});
 const headers=['任務名稱','任務日期','截止日期','門市','狀態','上傳時間',...qs.map((q,i)=>`${i+1}. ${q.label}`)];
 const ws=XLSX.utils.json_to_sheet(rows,{header:headers});if(!rows.length)XLSX.utils.sheet_add_aoa(ws,[headers],{origin:'A1'});
 ws['!cols']=headers.map((h,i)=>({wch:i<6?20:36}));
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'門市回饋');
 const filename=t.title.replace(/[\\/:*?"<>|]/g,'_').slice(0,55)||'任務';XLSX.writeFile(wb,`${filename}_回饋彙整.xlsx`);
}

$('newTask').onclick=()=>{editing={id:crypto.randomUUID(),title:'',time:todayLocal(),description:'',deadline:tomorrowEndLocal(),stores:[],references:[],questions:[],status:'published'};showAdminSection('edit');renderEditor()};
function renderStoreOptions() {if(!editing)return;$('taskStoreOptions').innerHTML=stores.map(s=>`<label style="display:inline-block;margin:7px"><input style="width:auto;display:inline" type="checkbox" data-store="${s.id}" ${(editing.stores||[]).includes(s.id)?'checked':''}> ${esc(displayStore(s))}</label>`).join('');$('taskStoreOptions').querySelectorAll('[data-store]').forEach(el=>el.onchange=()=>{editing.stores=[...$('taskStoreOptions').querySelectorAll('[data-store]:checked')].map(x=>x.dataset.store);queueTask()})}
function renderEditor(){if(!editing)return;$('editor').classList.remove('hidden');for(const [id,field] of [['taskTitle','title'],['taskTime','time'],['taskDesc','description'],['taskDeadline','deadline']])$(id).value=editing[field]||'';$('taskStatus').value=editing.status||'published';renderStoreOptions();renderReferences();renderQuestions();$('editorStatus').textContent=validateTask(editing)?'請填寫全部必填欄位，完成後自動儲存':'修改後自動儲存'}
for(const [id,field] of [['taskTitle','title'],['taskTime','time'],['taskDesc','description'],['taskDeadline','deadline']])$(id).oninput=()=>{if(!editing)return;editing[field]=$(id).value;queueTask()};
$('taskStatus').onchange=()=>{if(!editing)return;editing.status=$('taskStatus').value;queueTask()};
function renderReferences(){$('referenceList').innerHTML=(editing.references||[]).map((u,i)=>`<div><button type="button" class="image-trigger" data-lightbox="${esc(cleanUrl(u))}"><img class="preview" src="${esc(cleanUrl(u))}"></button><button class="secondary" data-ref="${i}">移除</button></div>`).join('');$('referenceList').querySelectorAll('[data-ref]').forEach(b=>b.onclick=()=>{editing.references.splice(+b.dataset.ref,1);renderReferences();queueTask()})}
$('reference').onchange=async e=>{const id=editing?.id;for(const f of e.target.files){try{$('editorStatus').textContent='照片上傳中';const u=await upload(f);if(editing?.id!==id)break;editing.references.push(u);renderReferences();queueTask()}catch(err){$('editorStatus').textContent=err.message}}e.target.value=''};
function renderQuestions(){$('questionEditor').innerHTML=(editing.questions||[]).map((q,i)=>`<div class="task" data-i="${i}"><input data-field="label" placeholder="題目名稱" value="${esc(q.label)}"><select data-field="type"><option value="yesno" ${q.type==='yesno'?'selected':''}>是／否</option><option value="text" ${q.type==='text'?'selected':''}>文字輸入</option><option value="image" ${q.type==='image'?'selected':''}>上傳照片</option></select><label><input style="width:auto;display:inline" type="checkbox" data-field="required" ${q.required?'checked':''}> 必填</label><button data-remove class="secondary">刪除題目</button></div>`).join('');$('questionEditor').querySelectorAll('[data-i]').forEach(div=>{const i=+div.dataset.i;div.querySelectorAll('[data-field]').forEach(el=>el.oninput=()=>{editing.questions[i][el.dataset.field]=el.type==='checkbox'?el.checked:el.value;queueTask()});div.querySelector('[data-remove]').onclick=()=>{editing.questions.splice(i,1);renderQuestions();queueTask()}})}
$('addQuestion').onclick=()=>{editing.questions.push({id:crypto.randomUUID(),label:'',type:'yesno',required:false});renderQuestions();queueTask()};
function validateTask(t){if(!t.title?.trim())return '請填寫任務名稱';if(!/^\d{4}-\d{2}-\d{2}$/.test(t.time||''))return '請選擇任務日期';if(!t.description?.trim())return '請填寫任務說明';if(!t.deadline||Number.isNaN(new Date(t.deadline).getTime()))return '請設定截止時間';if(!t.questions?.length)return '請至少新增一個回饋題目';if(t.questions.some(q=>!q.label?.trim()))return '所有回饋題目名稱都要填寫';return ''}
function queueTask(){const invalid=editing.status==='draft'?'':validateTask(editing);if(invalid){clearTimeout(saveTimers.get('task'));$('editorStatus').textContent='尚未儲存：'+invalid;return}const snap=structuredClone(editing),n=epoch,k='task';clearTimeout(saveTimers.get(k));$('editorStatus').textContent='等待儲存';saveTimers.set(k,setTimeout(()=>{if(epoch===n && editing?.id===snap.id)persistTask(snap).catch(e=>$('editorStatus').textContent='儲存失敗：'+e.message)},850))}
async function persistTask(t){const invalid=t.status==='draft'?'':validateTask(t);if(invalid)throw Error(invalid);const data={title:t.title,time:t.time,description:t.description,deadline:t.deadline,stores:t.stores||[],references:t.references||[],questions:t.questions||[],status:t.status||'published',updatedAt:serverTimestamp()};if(t.deadline){const d=new Date(t.deadline);if(Number.isNaN(d.getTime()))throw Error('截止日期無效');data.deadlineAt=Timestamp.fromDate(d)}else data.deadlineAt=null;await setDoc(scoped('tasks',t.id),{...data,ownerId});$('editorStatus').textContent='已自動儲存'}

$('adminDate').onchange=()=>{if(admin)renderAdminTasks()};$('clearAdminDate').onclick=()=>{$('adminDate').value='';if(admin)renderAdminTasks()};$('storeSort').onchange=()=>{if(store)renderStoreTasks()};$('adminSort').onchange=()=>{if(admin)renderAdminTasks()};$('saveTaskNow').onclick=async()=>{if(!editing)return;try{await persistTask(structuredClone(editing));$('editorStatus').textContent='儲存成功'}catch(e){$('editorStatus').textContent='尚未儲存：'+e.message}};// 專用管理者入口：index.html?admin=1，不在門市登入頁顯示按鈕。
const adminRoute=new URLSearchParams(location.search).get('admin')==='1';
if(adminRoute){show('adminLogin');say('管理者登入');}
else {
 const remembered=localStorage.getItem('storeName');
 if(remembered){$('storeName').value=remembered;onAuthStateChanged(auth,async user=>{
  if(window.__storeRestoreAttempted)return;
  window.__storeRestoreAttempted=true;
  try{await enterStore(remembered)}catch(e){$('loginError').textContent='自動登入失敗：'+e.message;show('login');say('請登入');}
 });}else say('請登入');
}


// 全站照片燈箱：不開新分頁，按 Esc、關閉按鈕或點擊背景可關閉。
const lightbox=document.getElementById('imageLightbox');
const lightboxImg=document.getElementById('lightboxImage');
let previousFocus=null;
function closeLightbox(){if(lightbox.hidden)return;lightbox.hidden=true;lightboxImg.removeAttribute('src');document.body.classList.remove('lightbox-open');previousFocus?.focus?.();}
function openLightbox(url){const safe=cleanUrl(url);if(!safe)return;previousFocus=document.activeElement;lightboxImg.src=safe;lightbox.hidden=false;document.body.classList.add('lightbox-open');document.getElementById('lightboxClose').focus();}
document.addEventListener('click',event=>{const trigger=event.target.closest('[data-lightbox]');if(trigger){event.preventDefault();openLightbox(trigger.dataset.lightbox);}});
document.getElementById('lightboxClose').addEventListener('click',closeLightbox);
lightbox.addEventListener('click',event=>{if(event.target===lightbox)closeLightbox();});
document.addEventListener('keydown',event=>{if(!lightbox.hidden&&event.key==='Escape')closeLightbox();});
