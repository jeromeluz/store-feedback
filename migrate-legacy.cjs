/** One-time V14 -> V15 migration. Run locally with a Firebase service-account credential. */
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');
const EMAIL = 'jonny00520@gmail.com';
const APPLY = process.argv.includes('--apply');
const projectId = 'pcscteam-ff6b2';
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('請先設定 GOOGLE_APPLICATION_CREDENTIALS 指向 Firebase 服務帳戶 JSON 檔案');
  process.exit(1);
}
admin.initializeApp({credential: admin.credential.applicationDefault(), projectId});
const db = admin.firestore();
const auth = admin.auth();
const collections = ['stores','tasks','responses'];
const directoryId = name => encodeURIComponent(name.normalize('NFC').trim());
const asJson = v => JSON.stringify(v, (_k,x) => x && typeof x.toDate === 'function' ? x.toDate().toISOString() : x, 2);
async function main() {
  const user = await auth.getUserByEmail(EMAIL);
  const uid = user.uid;
  const adminDoc = await db.doc(`admins/${uid}`).get();
  if (!adminDoc.exists || adminDoc.data().enabled !== true) throw Error('管理員 admins/{UID} 不存在或 enabled 不是 true');
  const source = {};
  for (const type of collections) {
    const snap = await db.collection(type).get();
    source[type] = snap.docs.map(d => ({id:d.id, data:d.data()}));
  }
  const names = new Set();
  const sourceStoreIds = new Set(source.stores.map(x=>x.id));
  const sourceTaskIds = new Set(source.tasks.map(x=>x.id));
  const writes = [];
  for (const type of collections) for (const {id,data} of source[type]) {
    const target = db.doc(`groups/${uid}/${type}/${id}`);
    const existing = await target.get();
    if (existing.exists) throw Error(`目標資料已存在，停止避免覆寫：${target.path}`);
    if (type === 'stores') {
      if (typeof data.name !== 'string' || !data.name.trim()) throw Error(`門市名稱無效：${id}`);
      const normalized = directoryId(data.name);
      if (names.has(normalized)) throw Error(`舊資料存在重複門市名稱：${data.name}`);
      names.add(normalized);
      const directory = db.doc(`storeDirectory/${normalized}`);
      if ((await directory.get()).exists) throw Error(`門市名稱對照已存在：${data.name}`);
      writes.push({ref:directory,data:{ownerId:uid,storeId:id,name:data.name,enabled:data.enabled !== false}});
    }
    if (type === 'responses') {
      if (!sourceStoreIds.has(data.storeId) || !sourceTaskIds.has(data.taskId)) {
        console.warn(`提醒：回饋 ${id} 參照的門市或任務不在舊集合中，仍會保留回饋`);
      }
    }
    writes.push({ref:target,data:{...data,ownerId:uid,...(type==='tasks'?{status:data.status||'published'}:{})}});
  }
  const backupDir = path.join(process.cwd(), 'migration-backup');
  fs.mkdirSync(backupDir, {recursive:true});
  const backup = path.join(backupDir, `legacy-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
  fs.writeFileSync(backup, asJson({targetEmail:EMAIL,targetUid:uid,source,createdAt:new Date().toISOString()}));
  console.log(`管理員：${EMAIL} UID：${uid}`);
  console.log(`舊資料：門市 ${source.stores.length} 筆，任務 ${source.tasks.length} 筆，回饋 ${source.responses.length} 筆`);
  console.log(`備份：${backup}`);
  console.log(`預計新增：${writes.length} 份文件（含門市對照）`);
  if (!APPLY) {console.log('目前僅預覽，未修改 Firestore。確認後執行 npm run migrate:apply'); return;}
  for (let i=0;i<writes.length;i+=400) {
    const batch=db.batch();
    for (const w of writes.slice(i,i+400)) batch.create(w.ref,w.data);
    await batch.commit();
    console.log(`已移轉 ${Math.min(i+400,writes.length)}/${writes.length}`);
  }
  for (const type of collections) {
    const snap=await db.collection(`groups/${uid}/${type}`).get();
    if (snap.size !== source[type].length) throw Error(`${type} 數量不一致：${snap.size}/${source[type].length}`);
  }
  console.log('移轉完成且數量驗證通過。舊集合未刪除。現在可發布 V15 規則並更新網頁。');
}
main().catch(e=>{console.error('移轉未完成：',e.message);process.exitCode=1;});
