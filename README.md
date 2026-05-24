# 雙北捷運足跡冒險 (Taipei Metro Adventure)

輕量級 PWA，將雙北捷運打卡遊戲化。以 Google Apps Script 作後端、Google Sheets 作資料庫、GitHub Pages 作前端部署，零伺服器成本。

---

## 功能說明

| 頁面 | 檔案 | 功能 |
|------|------|------|
| 主地圖 | `index.html` + `app.js` | Leaflet 互動地圖、打卡解鎖、進度條 |
| 集章冊 | `stamps.html` | 按路線分組的印章格，已解鎖可點擊放大 |
| 時間軸 | `timeline.html` | 打卡紀錄由新到舊排列，含合照與印章縮圖 |
| 個人主頁 | `profile.html` | 頭貼、路線制霸徽章、隱藏成就 |
| 登入 / 註冊 | `login.html` | 帳密驗證與創建帳號，登入狀態存於 `localStorage` |

### 主地圖行為

- 從 GAS API 取得車站清單與個人打卡進度，合併後渲染地圖
- 已造訪站點：顯示路線色；未造訪：灰色
- 路線連線由 `path_group` 欄位決定分組，支援共構站（逗號分隔多路線）
- `station_id` 含 `_hidden` 的節點為換線輔助節點，僅用於畫線，不計入總站數也不顯示 marker
- 縮放 < 14 時站名標籤自動隱藏，避免地圖過於雜亂（門檻值：`app.js` 的 `LABEL_ZOOM_THRESHOLD`）
- 打卡上傳：用 Canvas 將圖片壓縮至最大 1024px / JPEG 品質 0.7，再以 Base64 POST 給 GAS

### 集章冊

- 按路線分組顯示，每個路線有彩色圓點標題列
- 共構站同時出現在每條所屬路線的分組下，border 顏色對應該分組路線色

### 個人主頁

- **頭貼**：點擊頭像可上傳圖片（壓縮至 512px），有頭貼時右上角顯示紅色 `×` 移除鈕
- **路線徽章**：全線解鎖顯示金框，未解鎖顯示進度
- **隱藏成就**：
  - 🔀 **轉乘大師**：解鎖所有共構站（自動偵測 `line_name` 含逗號的車站）
  - 🏁 **端點終結者**：造訪所有路線終點站（需在 `Metro_Stations` 試算表標記 `is_terminal = TRUE`）

---

## 技術架構

- **前端**：HTML5 / CSS3 / Vanilla JS / [Leaflet.js 1.9.4](https://leafletjs.com/)
- **後端 API**：Google Apps Script，部署為 Web App
- **資料庫**：Google Sheets（`Metro_Stations`、`Users`、`User_Progress`）
- **圖片儲存**：Google Drive（回傳的圖片網址格式為 `uc?id=...`，前端自動轉為 `thumbnail?id=...` 縮圖 API）
- **部署**：GitHub Pages（靜態前端）
- **PWA**：`manifest.json` + `sw.js`（Service Worker 目前為 pass-through，iOS 需要它才能加到主畫面）

---

## GAS 後端

### 檔案

| 檔案 | 說明 |
|------|------|
| `Code.gs` | 主程式，實作 `doGet()`、`doPost()`、`forceAuth()` |
| `appsscript.json` | 專案設定，含 OAuth 範圍與部署模式 |

### 部署設定（`appsscript.json`）

```json
{
  "timeZone": "Asia/Taipei",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
  ]
}
```

`forceAuth()` 是空函式，第一次手動執行時觸發 OAuth 授權流程讓 Drive 權限生效。

### 圖片儲存路徑

```
Metro_Photos/（Drive 資料夾 ID: 12SoeJwhGD9WU_fJSGr2xeYfCa60EmLiB）
└── {user_id}/
    ├── {station_id}_stamp
    ├── {station_id}_photo
    └── avatar
```

---

## API 規格

所有頁面共用同一個 `API_URL`（硬編碼於各檔案頂端）。

### GET — 讀取資料

帶 `user_id` 時只回傳該使用者的 progress，不帶時回傳空陣列（未登入訪客仍可看地圖）：

```
GET {API_URL}?user_id={user_id}
```

```json
{
  "stations": [ { "station_id": "R01", "station_name": "新北投", "lat": "...", "lng": "...",
                  "line_name": "淡水信義線", "line_color": "#e30022",
                  "path_group": "淡水信義線", "spots_info": "...", "is_terminal": "TRUE" } ],
  "progress": [ { "user_id": "u1", "station_id": "R01",
                  "stamp_url": "https://drive.google.com/uc?id=...",
                  "photo_url": "https://drive.google.com/uc?id=...", "date": "2024-01-15" } ]
}
```

### POST — 動作列表

| `action` | 說明 | 必要欄位 |
|----------|------|---------|
| `login` | 登入驗證，回傳 user 物件（含 `avatar_url`）與 token | `user_id`, `password` |
| `register` | 創建帳號，檢查 `user_id` 是否重複 | `user_id`, `username`, `password` |
| `checkin` | 上傳印章與合照 Base64，寫入 Progress 表 | `user_id`, `station_id`, `stamp_base64`, `stamp_mime`, `photo_base64`, `photo_mime` |
| `update_avatar` | 上傳頭貼，存進 Drive，更新 Users 表 D 欄 | `user_id`, `avatar_base64`, `avatar_mime` |
| `remove_avatar` | 刪除 Drive 頭貼，清空 Users 表 D 欄 | `user_id` |

> 所有 POST 使用 `Content-Type: text/plain;charset=utf-8`，繞過 GAS CORS 預檢限制。

---

## Google Sheets 結構

### `Users`（欄位順序固定，GAS 以索引存取）

| A | B | C | D |
|---|---|---|---|
| user_id | username | password | avatar_url |

### `User_Progress`

| A | B | C | D | E |
|---|---|---|---|---|
| user_id | station_id | stamp_url | photo_url | date（YYYY-MM-DD）|

### `Metro_Stations`

必要欄位（欄位名稱即 header row）：`station_id`, `station_name`, `lat`, `lng`, `line_name`, `line_color`, `path_group`, `spots_info`, `is_terminal`

**共構站**（如民權西路）各欄以逗號分隔多路線：

```
line_name:  淡水信義線,中和新蘆線
line_color: #e30022,#f8b61c
path_group: 淡水信義線,中和新蘆線
```

**隱藏換線節點**：`station_id` 加上 `_hidden` 後綴，僅用於路線折線連接。

**終點站**：`is_terminal` 欄填 `TRUE`，前端據此偵測「端點終結者」成就。

---

## 部署步驟

1. **建立 Google Sheets**：依上方結構建立三張試算表，填入車站資料。
2. **建立 Google Drive 資料夾**：命名為 `Metro_Photos`，設為「知道連結的任何人皆可檢視」，記下資料夾 ID。
3. **建立 GAS 專案**：
   - 貼上 `Code.gs` 內容，將 `parentFolderId` 換成自己的 Drive 資料夾 ID
   - 編輯 `appsscript.json`（需先在設定中開啟「顯示 appsscript.json」）
   - 手動執行一次 `forceAuth()` 觸發 OAuth 授權
   - 部署為 Web App：執行身份選「我」、存取權選「所有人（包括匿名）」
4. **設定 API 網址**：將部署網址填入以下位置的 `API_URL` 常數：
   - [app.js:25](app.js)、[login.html](login.html)、[stamps.html](stamps.html)、[timeline.html](timeline.html)、[profile.html](profile.html)
5. **推送到 GitHub**：啟用 Pages 服務，指向 `main` branch 根目錄。

---

## 已知限制

- **API 網址分散**：`API_URL` 硬編碼於五個檔案，更換 GAS 部署版本時需逐一更新。
- **無 token 驗證**：後端不驗證 token，任何人只要知道他人的 `user_id` 就能代替他打卡。
- **無重複打卡防護**：後端不檢查同一使用者是否已打過同一站。
- **無離線功能**：`sw.js` 目前為 pass-through，關閉網路後無法使用。
- **佔位圖示**：`manifest.json` 的 icon 使用 placeholder.com，需替換為實際圖示檔。
- **進度全量回傳**：`Metro_Stations` 資料每次都完整回傳，車站數多時首次載入較慢。
