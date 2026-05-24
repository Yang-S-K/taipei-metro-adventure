// 檢查登入狀態與 UI
const savedUser = localStorage.getItem("metro_user");
const userObj = savedUser ? JSON.parse(savedUser) : null;
const currentUserId = userObj ? userObj.user_id : null;

// 🚊 動態判斷登入狀態與按鈕跳轉邏輯
const loginBtn = document.getElementById('login-status-btn');

if (userObj) {
    // 【情況 A：已登入】顯示用戶名，點擊直接進入個人主頁
    loginBtn.textContent = `👋 ${userObj.username}`;
    loginBtn.onclick = () => {
        location.href = 'profile.html';
    };
} else {
    // 【情況 B：未登入】顯示登入，點擊導向登入驗證畫面
    loginBtn.textContent = `🔑 登入`;
    loginBtn.onclick = () => {
        location.href = 'login.html';
    };
}
const map = L.map('map', { zoomControl: false }).setView([25.0462, 121.5174], 12);
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { attribution: '&copy; CARTO' }).addTo(map);

const API_URL = "https://script.google.com/macros/s/AKfycbzMS3h1Cm4cFREYEkOQVKyS4VyQad4dKEvEv9DveZtFMQ1PG_6kkhi-5g0UONcOaYSv_g/exec";

const card = document.getElementById('station-card');
document.getElementById('close-btn').addEventListener('click', () => card.classList.add('card-hidden'));

// 🔄 升級版圖片壓縮與轉碼工具 (限制最大寬高 1024px，品質 0.7)
const compressAndGetBase64 = (file, maxWidth = 1024, maxHeight = 1024, quality = 0.7) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 計算等比例縮小的寬高
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 統一轉成 jpeg 格式並進行品質壓縮
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
        };
        reader.onerror = error => reject(error);
    });
};

async function initMetroAdventure() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        if (data.error) return alert("資料庫讀取失敗！");

        const stations = data.stations;
        const progress = data.progress || [];

        // 將個人進度合併進車站資料
        stations.forEach(station => {
            station.is_visited = false;
            if (currentUserId) {
                const userProg = progress.find(p => p.station_id === station.station_id && p.user_id === currentUserId);
                if (userProg) {
                    station.is_visited = true;
                    station.stamp_img_url = userProg.stamp_url;
                    station.photo_img_url = userProg.photo_url;
                }
            }
        });

        updateProgress(stations);
        drawDynamicLines(stations);
        renderStationMarkers(stations);
    } catch (error) { console.error("API 連線失敗:", error); }
}

function updateProgress(stations) {
    // 過濾掉隱藏替身節點，避免分母膨脹
    const realStations = stations.filter(s => !s.station_id.includes('_hidden'));
    
    const total = realStations.length;
    const visited = realStations.filter(s => s.is_visited).length;
    const percentage = total > 0 ? Math.round((visited / total) * 100) : 0;
    
    document.getElementById('progress-text').textContent = `捷運制霸進度: ${visited} / ${total} (${percentage}%)`;
    document.getElementById('progress-fill').style.width = `${percentage}%`;
}

function drawDynamicLines(stations) {
    const lines = {};
    stations.forEach(station => {
        if (!station.lat || !station.lng) return;
        
        // 處理共構站 (line_name 包含逗號)
        const pathGroups = station.path_group ? station.path_group.split(',') : (station.line_name ? station.line_name.split(',') : []);
        const lineColors = station.line_color ? station.line_color.split(',') : [];

        pathGroups.forEach((pathKey, index) => {
             const key = pathKey.trim();
             if(!key) return;

             if (!lines[key]) {
                // 如果沒有對應的顏色，就用灰色
                const color = lineColors[index] ? lineColors[index].trim() : (lineColors[0] ? lineColors[0].trim() : "#888");
                lines[key] = { color: color, coords: [] };
            }
            lines[key].coords.push([parseFloat(station.lat), parseFloat(station.lng)]);
        });
    });

    Object.keys(lines).forEach(pathKey => {
        if (lines[pathKey].coords.length >= 2) {
            L.polyline(lines[pathKey].coords, { 
                color: lines[pathKey].color, 
                weight: 5, 
                opacity: 0.6 
            }).addTo(map);
        }
    });
}

function renderStationMarkers(stations) {
    stations.forEach(station => {
        if (!station.lat || !station.lng) return;
        if (station.station_id.includes('_hidden')) return;
        const markerColor = station.is_visited ? station.line_color : '#888888';
        const marker = L.circleMarker([parseFloat(station.lat), parseFloat(station.lng)], { radius: 8, fillColor: markerColor, color: '#ffffff', weight: 2, fillOpacity: 1 }).addTo(map);
        
        marker.bindTooltip(station.station_name, { permanent: true, direction: 'top', className: 'station-label', offset: [0, -10] }).openTooltip();
        
        marker.on('click', () => {
            // 1. 設定車站標題
            document.getElementById('card-title').textContent = station.station_name;
            
            // 2. 處理多線共構/單線的標籤切分邏輯
            const lines = station.line_name.split(',');  // 用逗號切開路線，例如 ["淡水信義線", "中和新蘆線"]
            const colors = station.line_color.split(',');// 用逗號切開顏色，例如 ["#e30022", "#f8b61c"]
            let lineHtml = '';
            
            // 依序幫每一條路線產生一個漂亮的彩色膠囊標籤
            lines.forEach((line, index) => {
                const color = colors[index] ? colors[index].trim() : '#888';
                lineHtml += `<span class="badge" style="background-color: ${color}; color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; font-weight: bold;">${line.trim()}</span>`;
            });
            
            // 3. 把產生好的所有標籤一次塞進剛剛在 html 挖好的 div 裡
            document.getElementById('card-line').innerHTML = lineHtml; 
            
            // 4. 設定景點文字
            document.getElementById('card-spots').textContent = station.spots_info || "尚未規劃景點";
            // 轉換 Google Drive 圖片網址的魔法函數
            const fixDriveImage = (url) => {
                if (url && url.includes("uc?id=")) {
                    // 換成 thumbnail 縮圖 API，並限制寬度為 800px 以加快載入速度
                    return url.replace("uc?id=", "thumbnail?id=") + "&sz=w800";
                }
                return url;
            };

            // 套用轉換
            document.getElementById('stamp-img').src = fixDriveImage(station.stamp_img_url) || "https://via.placeholder.com/150/CCCCCC/666666?text=No+Stamp";
            document.getElementById('photo-img').src = fixDriveImage(station.photo_img_url) || "https://via.placeholder.com/150/CCCCCC/666666?text=No+Photo";
            
            // 處理打卡表單顯示邏輯
            const checkinForm = document.getElementById('checkin-form');
            const submitBtn = document.getElementById('submit-checkin-btn');
            const msgBox = document.getElementById('upload-msg');
            msgBox.textContent = "";

            if (currentUserId && !station.is_visited) {
                checkinForm.classList.remove('hidden');
                
                // 重新綁定乾淨的點擊上傳事件
                submitBtn.onclick = async () => {
                    // 1. 先從 HTML 取得使用者選擇的檔案
                    const stampFile = document.getElementById('upload-stamp').files[0];
                    const photoFile = document.getElementById('upload-photo').files[0];
                    
                    // 2. 檢查是不是兩張照片都有選
                    if (!stampFile || !photoFile) return msgBox.textContent = "❌ 兩張照片都必須上傳！";
                    
                    // 3. 顯示處理中，並把按鈕鎖住避免重複點擊
                    msgBox.style.color = "#005edd";
                    msgBox.textContent = "⏳ 上傳處理中...(圖片壓縮與傳輸)";
                    submitBtn.disabled = true;

                    try {
                        // 4. 將原本幾 MB 的照片，透過 Canvas 壓縮成極小的 Base64 字串
                        const stampBase64 = await compressAndGetBase64(stampFile);
                        const photoBase64 = await compressAndGetBase64(photoFile);

                        // 5. 傳送給 Google Apps Script
                        const res = await fetch(API_URL, {
                            method: 'POST',
                            redirect: 'follow', // 確保跟隨 Google 的轉址
                            headers: {
                                'Content-Type': 'text/plain;charset=utf-8' // 偽裝成純文字避免 CORS 攔截
                            },
                            body: JSON.stringify({
                                action: 'checkin',
                                user_id: currentUserId,
                                station_id: station.station_id,
                                stamp_base64: stampBase64,
                                stamp_mime: 'image/jpeg',
                                photo_base64: photoBase64,
                                photo_mime: 'image/jpeg'
                            })
                        });
                        
                        const result = await res.json();
                        
                        if (result.success) {
                            alert("解鎖成功！");
                            location.reload(); // 重新載入網頁，更新地圖顏色與進度
                        } else {
                            msgBox.style.color = "red";
                            msgBox.textContent = "上傳失敗。";
                        }
                    } catch (e) { 
                        msgBox.textContent = "網路錯誤！";
                        console.error(e); // 在 Console 印出真正的錯誤原因
                    } finally { 
                        submitBtn.disabled = false; 
                    }
                };
            } else {
                checkinForm.classList.add('hidden');
            }

            card.classList.remove('card-hidden');
            map.flyTo([parseFloat(station.lat), parseFloat(station.lng)], 14, { duration: 0.5 });
        });
    });
}
// 註冊 Service Worker 啟動 PWA 功能
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(reg => {
            console.log('PWA Service Worker 註冊成功！', reg.scope);
        }).catch(err => {
            console.log('PWA 註冊失敗：', err);
        });
    });
}
initMetroAdventure();
