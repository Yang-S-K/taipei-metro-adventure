# 🚊 雙北捷運足跡冒險網頁 (Taipei Metro Adventure)

一個專為雙北捷運（高運量與中運量系統，不含輕軌與機捷）設計的多用戶足跡紀錄與成就解鎖網頁。使用者可以查閱各站點預先規劃的旅遊景點，並在實地造訪後，透過獨立的登入管理介面上傳該站的「捷運紀念章」與「現場合照」，動態累積個人成就與時間軸紀錄。

本專案完全基於**完全免費、無時間限制**的架構開發，前端靜態網頁託管於 **GitHub Pages**，後端驗證、資料庫儲存與圖片空間則完全整合 **Google 生態系 (Google Sheets + Google Drive + Google Apps Script)**。

---

## 🛠 系統架構與技術細節

### 1. 前端架構 (Frontend)
* **託管平台：** GitHub Pages（提供免費、無負載上限的靜態網頁託管）。
* **地圖渲染：** `Leaflet.js`（開源免費地圖庫），搭配大台北捷運系統的 GeoJSON 路線與座標開放資料。地圖背景採用免費的 `CartoDB Voyager` 樣式，免去綁定付費 Google Maps API 的信用卡與限制。
* **響應式設計 (RWD)：** 介面全面適應行動裝置（手機）與桌上型電腦，方便使用者在捷運站現場直接操作。
* **資料夾結構預期：**
  * `index.html` - 主導航與地圖頁面
  * `stamps.html` - 數位集章冊專屬頁面
  * `timeline.html` - 個人足跡時間軸頁面
  * `login.html` - 管理員與多帳號登入頁面
  * `style.css` - 視覺樣式表
  * `app.js` - 地圖核心控制與 API 串接邏輯

### 2. 後端與資料庫儲存 (Backend & Database)
本專案採用 **【方案 A：Google 核心生態系】**，免除自架伺服器帶來的網址維護、固定 IP 以及電費成本：
* **雲端資料庫 (Google Sheets)：** 作為 NoSQL 風格的關聯資料庫，分為三張工作表，分別管理「使用者權限」、「車站基本景點」與「各別使用者通關進度」。
* **後端邏輯中樞 (Google Apps Script - GAS)：** * 撰寫部署為「網頁應用程式 (Web App)」的 JavaScript 腳本。
  * 提供 `doGet(e)` 接口供前端獲取車站與解鎖狀態。
  * 提供 `doPost(e)` 接口，專職負責「帳密比對驗證」、「寫入打卡狀態」與「圖片串流傳輸」。
* **海量圖片儲存庫 (Google Drive)：** * 由於使用者擁有大容量（5TB）雲端硬碟，本專案將利用 GAS 直接將照片寫入指定資料夾。
  * 圖片寫入完成後，GAS 會自動將該圖片設定為「知道連結的使用者皆可查看」，並抓取其 `webViewLink` 寫回 Google Sheets，達成自動化圖片外連網址生成。

---

## 🚀 核心功能細節設計

### 1. 遊戲化成就與進度系統 (Gamification)
* **全局進度條 (Global Progress Bar)：** 網頁頂部顯眼處即時計算並顯示「總解鎖車站數 / 總車站數」以及對應的百分比進度條（如：`24 / 117 (20.5%)`）。
* **路線限定勳章 (Route Badges)：** 系統動態計算個別捷運線的制霸進度。當某一條路線全部車站被該帳號解鎖時，網頁個人儀表板將頒發數位勳章：
  * *【文湖線特戰隊】*：全線 24 站解鎖。
  * *【淡水信義大縱走】*：全線 28 站解鎖。
  * *【中和新蘆拓荒者】*：全線 26 站解鎖。
* **特殊隱藏成就 (Secret Achievements)：**
  * *【轉乘轉不停】*：解鎖所有雙路線（或以上）的交會樞紐站（如：台北車站、忠孝復興、東門、民權西路等）。
  * *【端點終結者】*：成功造訪所有路線的端點站（如：淡水、頂埔、動物園、新店、蘆洲、迴龍、南港展覽館）。

### 2. 「集章冊」數位虛擬化 (Digital Stamp Album)
* **視覺呈現：** 專屬的 `stamps.html` 頁面採用網格（Grid）手帳風格排版。
* **解鎖邏輯：** * *未去過的車站*：印章格子呈現黑白剪影或灰色虛線框。
  * *已去過的車站*：展示使用者上傳的真實捷運站藍色/綠色紀念章照片，並轉為高飽和彩色，點擊可放大檢視蓋章細節，重現紙本集章手帳的滿足感。

### 3. 個人足跡時間軸 (Travel Timeline)
* **時光回顧：** 獨立的 `timeline.html` 頁面會依據解鎖時間（由新到舊或由舊到新）對數據進行排序。
* **豐富呈現：** 每一個節點代表一次冒險軌跡，內容包含：`造訪日期`、`車站名稱（自帶線路顏色徽章）`、`規劃的景點名稱`，以及最核心的`當日實地合照`。這讓網頁不再只是冷冰冰的數據，而是具備情感溫度的個人/朋友生活日誌。

### 4. 獨立登入與多帳號防護 (Multi-User Backend)
* **使用者隔離：** 雖然前端網頁完全公開，但每位帳號使用者只能看到並操作屬於自己的進度。
* **驗證機制：**
  * 使用者在 `login.html` 輸入帳號密碼。
  * 前端將資料送至 GAS 進行試算表核對，若吻合則回傳「驗證 Token（如 user_id + 隨機亂數）」並記錄在瀏覽器的 `sessionStorage` 或 `localStorage` 中。
  * **寫入防護：** 當發送「勾選去過」或「上傳照片」的 `doPost` 請求時，GAS 後端會再次嚴格校對 Token 與該 user_id 的對應關係。只有權限核對正確，才會允許對 Google Sheets 進行修改與 Google Drive 檔案寫入，確保各帳號之間的資料完整性與安全性。

---

## 📊 Google Sheets 資料庫欄位詳細設計

### 工作表一：`Users` (使用者名冊)
* **作用：** 儲存合法使用者帳密，用以支持多使用者獨立登入。
| 欄位名稱 (Column) | 資料型態 (Type) | 說明 (Description) |
| :--- | :--- | :--- |
| `user_id` | String (Primary Key) | 使用者唯一代碼 (例如：`user01`, `user02`) |
| `username` | String | 網頁畫面上顯示的暱稱 (例如：`舒凱`) |
| `password_hash` | String | 儲存使用者密碼（建議經過簡單雜湊，提高安全性） |

### 工作表二：`Metro_Stations` (捷運車站與景點基礎資料)
* **作用：** 存放雙北捷運所有車站的靜態基礎資料，所有使用者共用。景點介紹維持完全公開。
| 欄位名稱 (Column) | 資料型態 (Type) | 說明 (Description) |
| :--- | :--- | :--- |
| `station_id` | String (Primary Key) | 車站編號 (例如：`BL01`, `R28`) |
| `station_name` | String | 車站中文名稱 (例如：`頂埔`, `淡水`) |
| `line_name` | String | 所屬路線名稱 (例如：`板南線`, `淡水信義線`) |
| `line_color` | String (HEX) | 路線對應網頁渲染顏色 (例如：`#005edd`, `#e30022`) |
| `lat` | Float | 車站地理緯度 (用於 Leaflet 定位) |
| `lng` | Float | 車站地理經度 (用於 Leaflet 定位) |
| `spots_info` | String (Text) | 該站預計規劃前往的景點/美食資訊（文字描述，支援 HTML 換行或超連結） |

### 工作表三：`User_Progress` (使用者打卡紀錄表)
* **作用：** 紀錄特定使用者在特定車站的解鎖數據與圖片路徑，是本系統最核心的動態資料表。
| 欄位名稱 (Column) | 資料型態 (Type) | 說明 (Description) |
| :--- | :--- | :--- |
| `record_id` | String (Primary Key) | 紀錄唯一識別碼 (例如：`r_user01_R28`) |
| `user_id` | String (Foreign Key) | 對應 `Users` 表的 `user_id` |
| `station_id` | String (Foreign Key) | 對應 `Metro_Stations` 表的 `station_id` |
| `is_visited` | Boolean | 是否已造訪過 (`TRUE` / `FALSE`) |
| `stamp_img_url` | String (URL) | 存放在 Google Drive 的捷運紀念章圖片公開瀏覽網址 |
| `photo_img_url` | String (URL) | 存放在 Google Drive 的現場合照圖片公開瀏覽網址 |
| `date_visited` | Date (YYYY-MM-DD) | 使用者實地造訪並上傳資料的日期（用於生成時間軸） |

---

## 🗓️ 專案分段開發時程表

* **【第一階段：靜態地圖、佈局與資料基礎】** * 蒐集雙北捷運所有高低運量車站的經緯度與編號，並手動在 Google Sheets `Metro_Stations` 填入你想去的景點。
    * 在 GitHub 建立 Repository，完成 `index.html` 的地圖基礎佈局，利用 `Leaflet.js` 在地圖上繪製出所有車站圓點。
* **【第二階段：GAS API 唯讀串接】**
    * 編寫 Google Apps Script 的 `doGet()` 腳本，將 Google Sheets 的資料轉換為 JSON 格式。
    * 修改前端 `app.js`，從本地假資料改為透過 `fetch()` 向 GAS 發送請求，動態在地圖上載入所有捷運車站。
* **【第三階段：多用戶登入驗證】**
    * 實作前端 `login.html`。
    * 在 GAS 端編寫 `doPost()` 驗證邏輯：比對 `Users` 表中的帳密，成功則發放 Session Token 紀錄於前端瀏覽器快取中。
* **【第四階段：後台管理與大容量照片上傳】**
    * 在網頁端設計打卡後台介面，包含「勾選已去過」、「日期選擇」與兩個「檔案上傳控制項」。
    * 利用 JS 將上傳的圖片壓縮並轉為 `Base64` 字串，隨打卡請求透過 `POST` 送至 GAS。
    * 擴充 GAS 邏輯：接收 Base64、解碼並寫入 5TB 的 Google Drive 專屬資料夾、取得分享網址，最終連同打卡日期一併寫入 `User_Progress` 工作表。
* **【第五階段：集章冊、時間軸與成就視覺化】**
    * 實作 `stamps.html` 與 `timeline.html`，串接已解鎖的資料庫圖片。
    * 在主畫面上方整合進度條，並實作「當整條路線皆為 TRUE 時」觸發路線勳章亮起的視覺特效。