# Taipei Metro Adventure — Claude 開發參考文件

**這份文件是給 Claude 看的技術規格書。每次新 session 開始請先讀這份。**
**每次對檔案做出重要變動後請同步更新這份文件。**

---

## 檔案清單與職責

| 檔案 | 職責 | 備註 |
|------|------|------|
| `Code.gs` | GAS 後端完整原始碼 | 複製全部內容貼到 GAS 編輯器，建立新版本後部署 |
| `appsscript.json` | GAS 專案設定檔 | 含 webapp 部署設定（executeAs、access）、時區等；本地備份用 |
| `index.html` | 主地圖頁 | inline `<style>` 含 `body { overflow: hidden }`，不在 style.css |
| `app.js` | 主地圖所有 JS | 地圖、打卡、照片、景點顯示全在這 |
| `style.css` | 全域共用樣式 | 各頁 inline style 優先級更高，改全域時注意覆蓋 |
| `stamps.html` | 集章冊 | 完整自給自足，有燈箱 |
| `timeline.html` | 時間軸 | 完整自給自足，有燈箱，只顯示主要合照 |
| `profile.html` | 個人主頁 | 頭貼、路線徽章、隱藏成就；有管理員權限者顯示後台入口 |
| `admin.html` | 管理後台 | 四個 tab，按權限顯示 |
| `login.html` | 登入/註冊 | 完整自給自足，登入後寫 localStorage |
| `manifest.json` | PWA | icon 用 placeholder |
| `sw.js` | Service Worker | 離線快取；更新靜態檔案後須升級 `STATIC_VER` 常數 |

**API_URL 硬編碼於 5 個檔案頂端**：`app.js`、`stamps.html`、`timeline.html`、`profile.html`、`login.html`。換部署版本時全部要改。

---

## 跨頁面共用狀態

唯一的跨頁面狀態是 `localStorage`：
- `metro_user`：JSON 物件 `{ user_id, username, avatar_url, permissions }`
- `metro_token`：登入時回傳的 token 字串（純形式，前端不驗證）

各頁頂部讀法：
```javascript
const savedUser = localStorage.getItem("metro_user");
const userObj = savedUser ? JSON.parse(savedUser) : null;
const currentUserId = userObj ? userObj.user_id : null;
```

`permissions` 欄位每次 doGet 回傳 `current_user` 時會自動更新 localStorage，無需重新登入即可反映最新權限。

---

## Google Sheets 資料庫

### `Users`（GAS 以欄位索引存取，順序不能動）

| A | B | C | D | E |
|---|---|---|---|---|
| user_id | username | password（明文，刻意不加密） | avatar_url | permissions（逗號分隔：`spots,users,checkins`，空白 = 無權限） |

### `User_Progress`（GAS 以 header name 存取）

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| user_id | station_id | stamp_url | photo_url（主要合照） | date | extra_photo_urls（逗號分隔） | spot_photo_urls（逗號分隔） |

> F、G 欄是後來加的。舊資料這兩欄為空，前端用 `.filter(u => u.trim())` 處理。

### `Metro_Stations`（GAS 以 header name 存取）

| 欄位 | 說明 |
|------|------|
| station_id | 唯一 ID。共構站格式 `R13_O11`；路由輔助節點加 `_hidden` 後綴 |
| station_name | 中文站名 |
| line_name | 路線顯示名，共構站逗號分隔 |
| line_color | 路線色碼，逗號對應 line_name |
| path_group | 折線分組 key（可能與 line_name 不同，見重要坑） |
| lat / lng | 座標 |
| is_terminal | 終點站填 `TRUE`（用於「端點終結者」成就） |
| spots_json | 景點 JSON 陣列（見下方格式） |

**spots_json 格式**（`name` 和 `category` 必填，其餘選填）：
```json
[{"name":"淡水老街","category":"景點","hours":"全天","address":"新北市淡水區中正路","url":"https://maps.app.goo.gl/xxxxx"},
 {"name":"阿給","category":"食物飲料","address":"新北市淡水區真理街6-1號"}]
```
- `category`：`"景點"` 或 `"食物飲料"`，舊資料沒有此欄時前端 fallback 為 `"景點"`
- `url`：Google Maps 地點直連網址；沒填則 fallback 用 name+address 搜尋
- Apple Maps 一律用 `?q={name}` 搜尋
- 卡片預覽：有兩種分類時各顯示一個；modal 裡按分類分成兩段顯示

---

## Google Drive 圖片儲存

**根資料夾**：`Metro_Photos`（ID：`12SoeJwhGD9WU_fJSGr2xeYfCa60EmLiB`）
**資料夾設定**：「知道連結的任何人皆可檢視」——**不能關，否則圖片載不到**

**重要**：`uploadToDrive` **不呼叫 `setSharing`**（會報「存取遭拒：DriveApp」），資料夾公開後子檔案自動繼承。

```
Metro_Photos/
└── {user_id}/
    ├── stamp_{user_id}_{station_id}
    ├── photo_{user_id}_{station_id}
    ├── extra_{user_id}_{station_id}_{index}
    ├── spot_{user_id}_{station_id}_{index}
    └── avatar
```

---

## GAS API 規格

**POST 格式**：一律用 `Content-Type: text/plain;charset=utf-8`（繞過 CORS preflight）。
**統一錯誤格式**：`{ "success": false, "message": "後端錯誤: ..." }`
**未知 action fallback**：doPost 最底部有 fallback return，避免無 return 導致 GAS 回 HTML 觸發 CORS 錯誤。

### GET

```
GET {API_URL}?user_id={user_id}
```

回傳：
- `stations`：所有車站（含 spots_json）
- `progress`：requestedUserId 的打卡紀錄
- `current_user`：`{ user_id, username, avatar_url, permissions }` — 前端用來更新 localStorage
- `all_users` + `all_progress`：僅當 requestedUserId 是 admin，或其 permissions 包含 `users`/`checkins`

### doPost actions

| action | 說明 | 參數 |
|--------|------|------|
| `login` | 帳密比對 | user_id, password → `{ success, user:{…,permissions}, token }` |
| `register` | 建帳號 | user_id, username, password → `{ success }` |
| `update_avatar` | 上傳頭貼 | user_id, avatar_base64, avatar_mime → `{ success, avatar_url }` |
| `remove_avatar` | 刪頭貼 | user_id → `{ success }` |
| `checkin` | 解鎖車站，上傳所有照片 | user_id, station_id, stamp_base64, stamp_mime, photo_base64, photo_mime, extra_photos_base64[], spot_photos_base64[] → `{ success, stamp_url, photo_url, extra_photo_urls, spot_photo_urls }` |
| `add_photo` | 補傳照片 | user_id, station_id, photo_base64, photo_mime, photo_type(`extra`/`spot`) → `{ success, photo_url }` |
| `set_primary_photo` | 設主要合照 | user_id, station_id, new_primary_url → `{ success, primary_url, extra_photo_urls }` |
| `delete_photo` | 刪除單張照片（自己或 admin） | target_user_id, station_id, photo_url, photo_type(`stamp`/`main`/`extra`/`spot`) → `{ success }` |
| `delete_checkin` | 撤銷打卡紀錄 | target_user_id, station_id → `{ success }` |
| `update_station` | 更新車站景點 JSON | station_id, spots_json → `{ success }` |
| `set_permissions` | 設定使用者權限 | target_user_id, permissions（逗號分隔字串） → `{ success, permissions }` |
| `delete_user` | 刪除使用者 + 所有打卡紀錄 | target_user_id → `{ success }` |
| `update_profile` | 更改帳號名稱或密碼 | user_id, new_username（選填）, new_password（選填）→ `{ success, username }` |
| `update_note` | 更新打卡備註 | user_id, station_id, note → `{ success, note }` |

---

## 管理員權限系統

- `user_id === 'admin'`：超級管理員，無條件全權限，不可被刪除或撤銷
- Users 表 E 欄 `permissions`：逗號分隔的權限字串，有效值只有 `spots`、`users`、`checkins`
  - 空白 = 無權限（不顯示後台入口，進 admin.html 會被 redirect）
  - `TRUE`/`FALSE` 是舊格式，**前端不認**（會被嚴格過濾掉）
- 每次 doGet 回傳 `current_user.permissions` 同步到 localStorage，重整頁面即生效
- admin.html tab 按權限顯示：`spots` = 景點 tab，`users` = 使用者 tab，`checkins` = 打卡 tab
- 總覽 tab 對所有進入後台的人都顯示

---

## app.js 架構

### 全域狀態

```javascript
const API_URL
const LABEL_ZOOM_THRESHOLD = 13   // 縮放 13 以上才顯示站名（14 太晚）
const allMarkers = []       // Leaflet circleMarker 陣列
const markerMap  = {}       // station_id → marker
const linePolylines = {}    // pathKey → L.polyline（含 _lineNames Set）
let stationsRef = []        // 全部車站（已合併個人進度）
let activeLines = new Set() // 目前顯示中的路線名
```

### 主要函式

| 函式 | 說明 |
|------|------|
| `fixDriveImage(url)` | `uc?id=` → `thumbnail?id=...&sz=w800` |
| `compressAndGetBase64(file, maxW, maxH, quality)` | Canvas 壓縮，預設 1024px / JPEG 0.7 |
| `initMetroAdventure()` | 入口，fetch 後更新 localStorage permissions，合併進度，渲染地圖 |
| `updateProgress(stations)` | 過濾 _hidden，更新進度條 |
| `drawDynamicLines(stations)` | 依 path_group 建折線，`_lineNames` Set 掛在 polyline 物件上 |
| `renderStationMarkers(stations)` | 建 marker，click 顯示車站卡片 |
| `buildSpotItemHtml(spot)` | 產生單一景點的 HTML（地圖連結 + 資訊） |
| `renderSpotsArea(station)` | 解析 spots_json，渲染 `#card-spots`。超過 2 個景點時 bottom sheet modal 展開 |
| `openSpotsModal(spots, stationName)` | 開啟景點 bottom sheet modal |
| `renderPhotosArea(station)` | 渲染 `#photos-area`：鎖圖 / 紀念章 + 合照 + 景點照 + 刪除按鈕 |
| `deleteMyPhoto(station, url, type)` | 呼叫 delete_photo（target = 自己），更新本地後 re-render |
| `setPrimaryPhoto(station, url, btn)` | 呼叫 set_primary_photo，更新本地後 re-render |
| `setupSupplementArea(station)` | 綁定補傳按鈕 |
| `setupLineFilter()` | 建路線篩選按鈕 |
| `applyLineFilter()` | 依 activeLines 顯示/隱藏 marker 和 polyline |
| `setupSearch()` | 搜尋框，選取後 `markerMap[id].fire('click')` |
| `openPhotoLightbox(src, caption)` | 全域函式，開啟主地圖燈箱 |

### 打卡資料合併（initMetroAdventure）

```javascript
station.is_visited       = true
station.stamp_img_url    = userProg.stamp_url
station.photo_img_url    = userProg.photo_url
station.extra_photo_urls = userProg.extra_photo_urls?.split(',').filter(u => u.trim()) ?? []
station.spot_photo_urls  = userProg.spot_photo_urls?.split(',').filter(u => u.trim())  ?? []
```

---

## index.html 特殊結構

- `body { overflow: hidden; height: 100vh }` 在 inline `<style>`，不能移到 style.css
- `#photos-area`：動態照片區，每次點 marker 時清空重建
- `#spots-modal`：景點 bottom sheet modal，超過 2 個景點時展開
- `#supplement-area`：補傳按鈕區，已解鎖時顯示
- `#photo-lightbox`：主地圖專屬燈箱
- `#coord-display` / `#coord-copied`：座標工具，只有 `user_id === 'admin'` 啟用（純地圖點擊複製座標用）

### 打卡表單

| input id | 限制 |
|----------|------|
| `upload-stamp` | 單選，必填 |
| `upload-photo` | 多選，至少 1 張，第一張為主要 |
| `upload-spot` | 多選，選填 |
| `supplement-file` | 多選，補傳合照/景點照共用 |

---

## admin.html 架構

四個 tab，按 permissions 顯示：

| Tab | 需要的 permission | 功能 |
|-----|-----------------|------|
| 📊 總覽 | 任何 | 使用者數/打卡數/景點設定率/人均/Top10站/最近活動 |
| 🗺 景點管理 | `spots` | 搜尋+路線篩選 → 點進車站 → 表單編輯 spots_json |
| 👥 使用者管理 | `users` | 查看所有使用者、打卡站數、刪除帳號；超管才能設定權限 chips |
| 📸 打卡管理 | `checkins` | 按用戶篩選 → 展開看照片 → 刪除照片 / 整筆記錄 |

資料來自 doGet 回傳的 `all_users` / `all_progress`（只有 admin 或有 users/checkins 權限的人才拿得到）。

---

## stamps.html / timeline.html 架構

**stamps.html**：自己 fetch，按 line_name 分組，過濾 _hidden，縮圖 `sz=w400`，燈箱 `sz=w1200`

**timeline.html**：自己 fetch，依 date 由新到舊排序，只顯示主要合照（不顯示 extra/spot），日期用 `record.date.split('T')[0]`

---

## profile.html 架構

- `compressAndGetBase64` 獨立定義，最大 **512px**（app.js 是 1024px）
- 頭貼：有 avatar_url 顯示圖片，否則顯示 username 首字
- 路線徽章：全線解鎖金框，點擊彈 `#badge-modal`
- 隱藏成就：🔀 轉乘大師（所有共構站）、🏁 端點終結者（所有 `is_terminal=TRUE` 的站）
- 管理後台入口：`hasValidPerms` 檢查，只認 `spots`/`users`/`checkins`，`TRUE` 等舊值不算
- loadProfile 取得 `data.current_user` 後同步更新 localStorage 並即時更新後台入口顯示

---

## 重要坑

### 1. path_group vs line_name 不一致
部分路線 path_group 用內部代號，篩選按鈕**只用 line_name**，不用 path_group。

### 2. _lineNames 索引對應
`drawDynamicLines` 用 `path_group[i] ↔ line_name[i]` 索引對應存 `polyline._lineNames`（Set）。巢狀 forEach 會造成 cross-contamination，索引對應才正確。

### 3. _hidden 節點永遠顯示
`polyline._lineNames` 為空時 `applyLineFilter` 維持可見（路由輔助段）。

### 4. setSharing 報「存取遭拒」
`uploadToDrive` 不能呼叫 `file.setSharing(...)`。Metro_Photos 資料夾設公開，子檔案自動繼承。

### 5. CORS 用 text/plain 繞過
POST 必須用 `Content-Type: text/plain;charset=utf-8`。doPost 最底部有 fallback return 防止無 return 導致 GAS 回 HTML 觸發 CORS 錯誤。

### 6. 安全性：刻意不加密
後端不驗 token，帳密明文存 Sheets。純內部使用，**不要自行加密或加驗證**。

### 7. GAS 重新部署授權問題
加新的 DriveApp 呼叫後若執行環境不認授權：撤銷 myaccount.google.com/permissions → 執行 `forceAuth()` → 建新版本部署。

### 8. permissions 嚴格驗證
前端只認 `spots`/`users`/`checkins` 三個值。舊的 `TRUE`/`FALSE` 格式不被識別為有效權限。Users 表 E 欄必須是逗號分隔的權限字串或空白。

---

## 待確認事項

- **景點 Google Maps 網址跳轉（mobile）**：用 `window.open(url,'_blank','noopener,noreferrer')` 取代 `<a target="_blank">` 以繞過 iOS universal link 攔截。`maps.app.goo.gl` 短網址在手機 app 顯示「不支援」的問題是否解決，**尚未測試確認**。建議改用完整 Google Maps 網頁網址（`https://www.google.com/maps/place/...`）取代短網址。

---

## 待開發功能規格

### 更改帳號名字 / 密碼 ✅（已完成）
- profile.html：✏️ 編輯資料按鈕，展開表單（名稱 + 新密碼 + 確認密碼）
- GAS：`update_profile` action，驗證名稱不重複
- loadProfile 同步更新 username 到 localStorage 和顯示

---

### Google 登入（暫緩，待規劃）
**目標**：用 Google 帳號登入，不需自訂帳密。

**方案**：Google Identity Services（One Tap）
1. Google Cloud Console 建 OAuth client ID
2. `login.html` 加 Google 登入按鈕，拿到 JWT credential
3. GAS `login_google` action：用 `UrlFetchApp.fetch` 呼叫 `https://oauth2.googleapis.com/tokeninfo?id_token=...` 驗證 token，取出 `sub`（唯一 Google ID）當 user_id、`name` 當 username
4. 首次登入自動建帳號（Users 表 appendRow），之後直接回傳 user 物件
5. 現有帳密登入保留（向下相容），兩種方式並存

**注意**：目前帳密系統對內部小群體夠用，Google 登入工作量較大，暫緩。

---

### 打卡備註（note）✅（已完成）
**Sheets**：User_Progress H 欄加 `note` header（使用者需手動加）  
**GAS**：`checkin` appendRow 多一欄 note；`update_note` action 更新 H 欄  
**app.js**：note 合併進 station 物件；renderPhotosArea 底部備註區（有備註顯示文字+✏️，沒有顯示「加備註」）  
**index.html**：打卡表單加 💬 備註 textarea  
**timeline.html**：每筆記錄顯示 💬 備註（有才顯示）

---

### Timeline 加景點照
**目標**：timeline 每筆記錄可展開看 extra_photo_urls 和 spot_photo_urls，目前只顯示主要合照。

**前端異動（只改 timeline.html）**：
- 每筆記錄底部加「▼ 更多照片（N 張）」按鈕（有 extra 或 spot 才顯示）
- 展開後網格顯示：其他合照（extra_photo_urls）+ 景點照（spot_photo_urls）
- 圖片點擊開燈箱（已有燈箱 `#lightbox-modal`，直接複用）
- 無 GAS 改動

---

### 集章冊美化
**目標**：stamps.html 視覺升級，更像實體集章冊。

**規劃方向**：
- 未解鎖的章：灰階 + 輕微模糊 + 鎖頭圖示疊加
- 已解鎖的章：彩色，可加輕微光暈或框線
- 整體排版：加背景紋理（淡米色紙感），每條路線用分隔線區分
- 無 GAS 改動，純 CSS/HTML 調整

---

### PWA 離線快取 ✅（已完成）
`sw.js` 實作四種快取策略：
- 本地靜態檔（HTML/CSS/JS）：stale-while-revalidate
- GAS API GET：**stale-while-revalidate**（第二次起秒開，背景更新；原為 network-first 每次都要等 GAS 冷啟動）
- 地圖圖磚（CartoDB）：cache-first，上限 600 張
- Drive 圖片 / Leaflet CDN：cache-first，圖片上限 300 張

**更新靜態檔案後必須升級 `sw.js` 頂部的 `STATIC_VER`**，否則用戶瀏覽器會繼續用舊快取。

---

## 設計原則

- **所有功能必須同時考慮手機和電腦**：手機以底部 sheet 和大觸控區為主，桌面可有更大版面，但不能只設計其中一種

---

## 部署 / 版本控制

**靜態檔部署**：GitHub Pages `https://yang-s-k.github.io/taipei-metro-adventure/`（`main` branch 自動部署）

**本地 git 設定**（本地資料夾尚未 init，需手動設定）：
```bash
git init
git remote add origin https://github.com/yang-s-k/taipei-metro-adventure.git
git branch -M main
```

**建議分支策略**：
- `main` = 正式版（GitHub Pages 自動部署）
- `dev` = 開發 / 測試版（admin 後台測試完 → merge to main → push）
- 版本號用 git tag（`git tag v1.2`）方便回滾

**注意**：GAS (Code.gs) 不在 git 管理範圍，每次改 GAS 後用「建立新版本」部署即可，本地 Code.gs 備份用。

---

## 開發注意事項

1. **改 GAS 後必須「建立新版本」再部署**，只存檔不更新 API
2. **改 app.js / html 後強制重整**（Ctrl+Shift+R），瀏覽器快取強
3. **新增 Sheets 欄位**：doGet 自動帶出（header 對應）；doPost 寫入時注意 1-based 欄位索引
4. **不要動 User_Progress A-E 欄順序**，現有資料依賴這個順序
5. **不要在 uploadToDrive 加 setSharing**（坑 4）
6. **`fixDriveImage` 是 module-level**（app.js 頂部），多處使用
7. **每次有重要改動，同步更新這份 README**
8. **更新 HTML/CSS/JS 後**，記得升級 `sw.js` 頂部的 `STATIC_VER`，讓舊快取自動失效
