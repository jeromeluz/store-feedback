# V5 介面調整

- 管理者任務列表每筆提供「編輯」「刪除」「回饋查看」。
- 編輯任務與回饋查看改為獨立畫面，不在任務列表下方展開。
- 回饋總覽整合進個別任務的「回饋查看」。
- 門市端點選任務才顯示填寫畫面，可返回任務列表。
- 延用 V4 的 Firebase、Cloudinary 設定與 Firestore 規則。
- 部署 GitHub Pages 時，將 index.html、app.js、config.js 放在儲存庫根目錄，取代舊檔。
- 此版本已通過 JavaScript 語法檢查，未經線上 Firebase 實測。

# 區組回饋平台 V5 — GitHub Pages + Firebase Spark + Cloudinary Free

## 已設定
- Firebase Project ID: `pcscteam-ff6b2`
- Cloudinary Cloud Name: `t5bnwl9v`
- Unsigned Upload Preset: `pcscteam`
- 不使用 Firebase Storage、Cloud Functions、付費主機
- 只有照片上傳，支援 JPG、PNG、WebP，前端限制每張 2 MB

## 重要安全限制（上線前必讀）
**只輸入門市名稱不是身分驗證。** 這個純前端、免費、免密碼版本，匿名訪客可能讀取或冒用其他門市的回饋，無法保證門市資料保密與隔離。Firestore 規則只保護管理員寫入權限，無法證明訪客屬於哪間門市。若需要真正的門市資料隔離，必須改用每店密碼、登入連結或後端身分驗證。

`4302` 僅是管理後台的**介面附加驗證**，不是資料庫安全憑證，前端原始碼可被檢視。實際管理權限依 Firebase Email/Password 登入及 `admins/{uid}` 管理者白名單驗證。

Cloudinary Unsigned Upload Preset 是公開上傳入口，可能被濫用，照片 URL 也可能被持有網址者查看。不適合個資或機密照片。務必在 Cloudinary 控制台對 `pcscteam` 設定限制格式（jpg/png/webp）、大小上限 2MB，並監控免費額度。前端限制無法取代服務端限制。即使使用者刪除回饋，已上傳 Cloudinary 的圖片不會自動刪除。

Firebase Spark 與 Cloudinary Free 有用量限制，超額可能暫停服務，不能保證無限量免費。GitHub Pages 對商業使用有條款限制，請自行確認適用性。

## 1. Firebase 設定
1. Firebase Console → `pcscteam-ff6b2` → Authentication → Sign-in method：**同時啟用 Anonymous 和 Email/Password**。
2. Firestore Database → Create database → 選 Standard / Spark 可用區域。建議使用 production mode，之後部署本專案規則。
3. Authentication → Users → Add user：建立管理者 Email/Password。
4. 複製該使用者的 **UID**。
5. Firestore → Start collection → collection ID `admins` → document ID 填入管理者 UID → 新增欄位 `enabled`，類型 boolean，值 `true`。**不要將此集合設為公開寫入**。
6. 本機安裝 Node.js 和 Firebase CLI：`npm install -g firebase-tools`，再執行 `firebase login`、`firebase use --add`（選 pcscteam-ff6b2）及 `firebase deploy --only firestore:rules --project pcscteam-ff6b2`。CLI 部署安全規則不需要 Cloud Functions。
7. 若出現 `permission-denied`，請檢查規則是否成功部署及管理員 UID 是否正確。

## 2. Cloudinary
1. Settings → Upload → Upload Presets → `pcscteam`，確認為 **Unsigned**。
2. 設定可接受的檔案格式 jpg/png/webp、檔案大小上限 2 MB；請確認該方案支援所需的限制設定。
3. 不要提供 API Secret，也不要把 API Secret 放入 GitHub。

## 3. GitHub Pages
1. 建立新的 **Public** repository，例如 `store-feedback`。
2. 上傳 `index.html`、`app.js`、`config.js` 到儲存庫根目錄（`firestore.rules`、`firebase.json`、README 可一併上傳）。
3. Repository → Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save。
4. 等候部署，網址通常是 `https://你的GitHub帳號.github.io/store-feedback/`。
5. Firebase Console → Authentication → Settings → Authorized domains，新增 `你的GitHub帳號.github.io`（只填網域，不含 https 和路徑）。
6. 開啟網站，使用 Firebase 管理者 Email/Password 加上 PIN `4302` 登入，先建立門市及任務，再測試門市端。

## 4. 使用提醒
- 管理者新增門市後，門市端輸入**完全相同的名稱**即可進入。
- 任務修改會延遲約 850 毫秒儲存，文字回饋約 800 毫秒；照片上傳完成後才會保存 URL。看到「已自動儲存」再關閉。
- 同一門市同一任務只有一份回饋，多人同時編輯可能互相覆蓋。
- 截止日期使用瀏覽器當地時間轉成 Firestore Timestamp，規則用伺服器時間檢查是否逾期。
- 若管理者改名，舊回饋會保留舊門市顯示名稱；請勿重複建立同名門市。
- 本專案是可部署測試版，尚未進行正式安全稽核或完整多使用者驗收。


## V6 任務分享網址
管理者登入後在「任務管理」每個任務點「分享網址」，即可複製 `https://jeromeluz.github.io/store-feedback/?task=任務ID`。門市開啟連結，輸入已建立且啟用的門市名稱，若任務有指派該門市，會直接跳轉到該任務填答頁。無權限、刪除的任務不會跳轉。請上傳 V6 的 index.html 與 app.js，保留 config.js。

注意：網址不是登入憑證，門市名稱仍無法驗證身分；現有 Firestore 規則允許匿名使用者讀取回饋資料，不適用敏感資料。Cloudinary unsigned 上傳可能被濫用。
