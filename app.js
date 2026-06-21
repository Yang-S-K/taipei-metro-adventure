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

const LABEL_ZOOM_THRESHOLD = 13;
const allMarkers = [];
const markerMap = {};
const linePolylines = {};
let stationsRef = [];
let activeLines = new Set();

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

function openPhotoLightbox(src, caption) {
    const lb = document.getElementById('photo-lightbox');
    document.getElementById('lb-img').src = src;
    document.getElementById('lb-caption').textContent = caption;
    lb.classList.remove('lb-hidden');
}
(function setupLightbox() {
    document.addEventListener('DOMContentLoaded', () => {
        const lb = document.getElementById('photo-lightbox');
        if (!lb) return;
        lb.addEventListener('click', (e) => {
            if (e.target.id === 'photo-lightbox' || e.target.id === 'lb-close') {
                lb.classList.add('lb-hidden');
                setTimeout(() => { document.getElementById('lb-img').src = ''; }, 250);
            }
        });
    });
})();

(function setupSpotsModal() {
    document.addEventListener('DOMContentLoaded', () => {
        const modal = document.getElementById('spots-modal');
        if (!modal) return;
        document.getElementById('spots-modal-close').addEventListener('click', () => modal.classList.add('spots-modal-hidden'));
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('spots-modal-hidden'); });
    });
})();

const fixDriveImage = (url) => {
    if (url && url.includes("uc?id=")) return url.replace("uc?id=", "thumbnail?id=") + "&sz=w800";
    return url;
};

async function initMetroAdventure() {
    try {
        const fetchUrl = currentUserId ? `${API_URL}?user_id=${encodeURIComponent(currentUserId)}` : API_URL;
        const response = await fetch(fetchUrl);
        const data = await response.json();
        if (data.error) return alert("資料庫讀取失敗！");

        // 每次載入同步最新權限，無需重新登入即可生效
        if (data.current_user && userObj && currentUserId === data.current_user.user_id) {
            const refreshed = { ...userObj, permissions: data.current_user.permissions || '', avatar_url: data.current_user.avatar_url || userObj.avatar_url || '' };
            localStorage.setItem('metro_user', JSON.stringify(refreshed));
            userObj.permissions = refreshed.permissions;
        }

        const stations = data.stations;
        const progress = data.progress || [];

        // 將個人進度合併進車站資料
        stations.forEach(station => {
            station.is_visited = false;
            if (currentUserId) {
                const userProg = progress.find(p => p.station_id === station.station_id && p.user_id === currentUserId);
                if (userProg) {
                    station.is_visited = true;
                    station.stamp_img_url    = userProg.stamp_url;
                    station.photo_img_url    = userProg.photo_url;
                    station.extra_photo_urls = userProg.extra_photo_urls ? userProg.extra_photo_urls.split(',').filter(u => u.trim()) : [];
                    station.spot_photo_urls  = userProg.spot_photo_urls  ? userProg.spot_photo_urls.split(',').filter(u => u.trim())  : [];
                }
            }
        });

        stationsRef = stations;
        updateProgress(stations);
        drawDynamicLines(stations);
        renderStationMarkers(stations);
        setupSearch();
        setupLineFilter();
        updateLabelsVisibility();
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
        const pathGroups  = station.path_group ? station.path_group.split(',') : (station.line_name ? station.line_name.split(',') : []);
        const lineColors  = station.line_color ? station.line_color.split(',') : [];
        const lineNames   = station.line_name  ? station.line_name.split(',')  : [];

        pathGroups.forEach((pathKey, index) => {
            const key = pathKey.trim();
            if (!key) return;
            if (!lines[key]) {
                const color = lineColors[index] ? lineColors[index].trim() : (lineColors[0] ? lineColors[0].trim() : "#888");
                lines[key] = { color, coords: [], lineNames: new Set() };
            }
            lines[key].coords.push([parseFloat(station.lat), parseFloat(station.lng)]);
            // index 配對：path_group[i] 對應 line_name[i]
            const ln = (lineNames[index] || lineNames[0] || '').trim();
            if (ln) lines[key].lineNames.add(ln);
        });
    });

    Object.keys(lines).forEach(pathKey => {
        if (lines[pathKey].coords.length >= 2) {
            const pl = L.polyline(lines[pathKey].coords, {
                color: lines[pathKey].color,
                weight: 5,
                opacity: 0.6
            }).addTo(map);
            pl._lineNames = lines[pathKey].lineNames; // 直接存在折線物件上
            linePolylines[pathKey] = pl;
        }
    });
}

function renderStationMarkers(stations) {
    stations.forEach(station => {
        if (!station.lat || !station.lng) return;
        if (station.station_id.includes('_hidden')) return;
        const markerColor = station.is_visited ? station.line_color : '#888888';
        const marker = L.circleMarker([parseFloat(station.lat), parseFloat(station.lng)], { radius: 8, fillColor: markerColor, color: '#ffffff', weight: 2, fillOpacity: 1 }).addTo(map);
        
        marker._station = station;
        marker.bindTooltip(station.station_name, { permanent: true, direction: 'top', className: 'station-label', offset: [0, -10] });
        allMarkers.push(marker);
        markerMap[station.station_id] = marker;
        
        marker.on('click', () => {
            ['upload-stamp','upload-photo','upload-spot','supplement-file'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });

            document.getElementById('card-title').textContent = station.station_name;

            const lines  = station.line_name.split(',');
            const colors = station.line_color.split(',');
            let lineHtml = '';
            lines.forEach((line, index) => {
                const color = colors[index] ? colors[index].trim() : '#888';
                lineHtml += `<span class="badge" style="background-color:${color};color:white;padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:bold;">${line.trim()}</span>`;
            });
            document.getElementById('card-line').innerHTML = lineHtml;

            renderSpotsArea(station);

            renderPhotosArea(station);

            const checkinForm    = document.getElementById('checkin-form');
            const supplementArea = document.getElementById('supplement-area');
            const msgBox         = document.getElementById('upload-msg');
            msgBox.textContent   = '';

            if (currentUserId && !station.is_visited) {
                checkinForm.classList.remove('hidden');
                supplementArea.classList.add('hidden');

                const submitBtn = document.getElementById('submit-checkin-btn');
                submitBtn.onclick = async () => {
                    const stampFile  = document.getElementById('upload-stamp').files[0];
                    const photoFiles = document.getElementById('upload-photo').files;
                    const spotFiles  = document.getElementById('upload-spot').files;

                    if (!stampFile) return (msgBox.textContent = "❌ 請上傳紀念章！");
                    if (!photoFiles || photoFiles.length === 0) return (msgBox.textContent = "❌ 請上傳至少一張合照！");

                    msgBox.style.color = "#005edd";
                    msgBox.textContent = "⏳ 上傳處理中...(圖片壓縮與傳輸)";
                    submitBtn.disabled = true;

                    try {
                        const stampBase64 = await compressAndGetBase64(stampFile);
                        const photoBase64 = await compressAndGetBase64(photoFiles[0]);

                        const extraPhotosBase64 = [];
                        for (let i = 1; i < photoFiles.length; i++) {
                            extraPhotosBase64.push(await compressAndGetBase64(photoFiles[i]));
                        }
                        const spotPhotosBase64 = [];
                        for (const f of spotFiles) {
                            spotPhotosBase64.push(await compressAndGetBase64(f));
                        }

                        const res = await fetch(API_URL, {
                            method: 'POST',
                            redirect: 'follow',
                            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                            body: JSON.stringify({
                                action: 'checkin',
                                user_id: currentUserId,
                                station_id: station.station_id,
                                stamp_base64: stampBase64,
                                stamp_mime: 'image/jpeg',
                                photo_base64: photoBase64,
                                photo_mime: 'image/jpeg',
                                extra_photos_base64: extraPhotosBase64,
                                spot_photos_base64: spotPhotosBase64
                            })
                        });
                        const result = await res.json();

                        if (result.success) {
                            station.is_visited       = true;
                            station.stamp_img_url    = result.stamp_url;
                            station.photo_img_url    = result.photo_url;
                            station.extra_photo_urls = result.extra_photo_urls ? result.extra_photo_urls.split(',').filter(u => u.trim()) : [];
                            station.spot_photo_urls  = result.spot_photo_urls  ? result.spot_photo_urls.split(',').filter(u => u.trim())  : [];

                            const firstColor = station.line_color.split(',')[0].trim();
                            if (markerMap[station.station_id]) markerMap[station.station_id].setStyle({ fillColor: firstColor });
                            updateProgress(stationsRef);
                            renderPhotosArea(station);

                            checkinForm.classList.add('hidden');
                            supplementArea.classList.remove('hidden');
                            setupSupplementArea(station);

                            msgBox.style.color = "green";
                            msgBox.textContent = "✅ 解鎖成功！";
                        } else {
                            msgBox.style.color = "red";
                            msgBox.textContent = result.message || "上傳失敗。";
                        }
                    } catch (e) {
                        msgBox.style.color = "red";
                        msgBox.textContent = "網路錯誤！";
                        console.error(e);
                    } finally {
                        submitBtn.disabled = false;
                    }
                };
            } else if (currentUserId && station.is_visited) {
                checkinForm.classList.add('hidden');
                supplementArea.classList.remove('hidden');
                setupSupplementArea(station);
            } else {
                checkinForm.classList.add('hidden');
                supplementArea.classList.add('hidden');
            }

            card.classList.remove('card-hidden');
            map.flyTo([parseFloat(station.lat), parseFloat(station.lng)], 14, { duration: 0.5 });
        });
    });
}
const SPOT_CAT = {
    '景點':    { icon: '🏛', color: '#005edd' },
    '食物飲料': { icon: '🍜', color: '#e67e22' },
};

function buildSpotItemHtml(spot) {
    const cat    = SPOT_CAT[spot.category] || SPOT_CAT['景點'];
    const catKey = spot.category || '景點';
    const gmUrl  = spot.url
        ? spot.url
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((spot.name + ' ' + (spot.address || '')).trim())}`;
    const amUrl  = `https://maps.apple.com/?q=${encodeURIComponent(spot.name)}`;
    return `<div class="spot-item">
        <div class="spot-item-header">
            <div class="spot-name">${spot.name}</div>
            <span class="spot-cat-badge" style="background:${cat.color}">${cat.icon} ${catKey}</span>
        </div>
        ${spot.hours   ? `<div class="spot-meta">🕐 ${spot.hours}</div>`   : ''}
        ${spot.address ? `<div class="spot-meta">📍 ${spot.address}</div>` : ''}
        <div class="spot-links">
            <a href="${gmUrl}" class="spot-map-btn" onclick="window.open('${gmUrl.replace(/'/g,"\\'")}','_blank','noopener,noreferrer');return false;">Google Maps</a>
            <a href="${amUrl}" class="spot-map-btn spot-map-btn-apple" onclick="window.open('${amUrl.replace(/'/g,"\\'")}','_blank','noopener,noreferrer');return false;">Apple Maps</a>
        </div>
    </div>`;
}

function renderSpotsArea(station) {
    const el = document.getElementById('card-spots');
    let spots = [];
    if (station.spots_json) {
        try { spots = JSON.parse(station.spots_json); } catch(e) {}
    }
    if (spots.length === 0) {
        el.innerHTML = '<p class="spots-fallback spots-empty">尚未規劃景點</p>';
        return;
    }

    // 預覽：各分類盡量各取一個，不足 2 個再往後補
    const SHOW_INIT   = 2;
    const attractions = spots.filter(s => (s.category || '景點') === '景點');
    const foods       = spots.filter(s => s.category === '食物飲料');
    let preview;
    if (attractions.length > 0 && foods.length > 0) {
        preview = [attractions[0], foods[0]];
    } else {
        preview = spots.slice(0, SHOW_INIT);
    }

    let html = `<div class="spots-list">${preview.map(buildSpotItemHtml).join('')}</div>`;
    if (spots.length > SHOW_INIT) {
        html += `<button class="spots-expand-btn">查看全部 ${spots.length} 個 ▶</button>`;
    }
    el.innerHTML = html;

    const btn = el.querySelector('.spots-expand-btn');
    if (btn) btn.addEventListener('click', () => openSpotsModal(spots, station.station_name));
}

function openSpotsModal(spots, stationName) {
    document.getElementById('spots-modal-title').textContent = `📍 ${stationName}`;

    const catOrder = ['景點', '食物飲料'];
    const grouped  = {};
    spots.forEach(s => {
        const k = s.category || '景點';
        if (!grouped[k]) grouped[k] = [];
        grouped[k].push(s);
    });

    // 按 catOrder 排序，未知分類附在最後
    const keys = [...catOrder.filter(k => grouped[k]), ...Object.keys(grouped).filter(k => !catOrder.includes(k) && grouped[k])];
    const isMultiCat = keys.length > 1;

    let html = '';
    keys.forEach(k => {
        const info = SPOT_CAT[k] || { icon: '📍' };
        if (isMultiCat) html += `<div class="spot-cat-header">${info.icon} ${k}</div>`;
        html += grouped[k].map(buildSpotItemHtml).join('');
    });

    document.getElementById('spots-modal-list').innerHTML = html;
    document.getElementById('spots-modal').classList.remove('spots-modal-hidden');
}

function renderPhotosArea(station) {
    const area = document.getElementById('photos-area');
    if (!station.is_visited) {
        area.innerHTML = `<div style="text-align:center;padding:20px 0;color:#888;background:#f8f9fa;border-radius:8px;margin-top:12px;">
            <div style="font-size:32px;margin-bottom:8px;">🔒</div>
            <p style="font-size:0.85rem;">到現場打卡後解鎖</p>
        </div>`;
        return;
    }

    const extras = station.extra_photo_urls || [];
    const spots  = station.spot_photo_urls  || [];
    const stName = station.station_name;

    const lbAttr = (src, cap) => `onclick="openPhotoLightbox('${src.replace(/'/g, "\\'")}','${cap.replace(/'/g, "\\'")}')"`;

    const delBtn = (url, type) => `<button class="photo-del-btn" data-url="${url}" data-type="${type}">🗑 刪除</button>`;

    let extrasHtml = '';
    if (extras.length > 0) {
        const thumbs = extras.map((url, i) => {
            const hi = fixDriveImage(url).replace('sz=w800', 'sz=w1200');
            return `<div class="gallery-extra-item">
                <img src="${fixDriveImage(url)}" alt="合照${i + 2}" class="gallery-clickable" ${lbAttr(hi, `📸 ${stName} 合照`)}>
                <button class="set-primary-btn" data-url="${url}">設為主要</button>
                ${delBtn(url, 'extra')}
            </div>`;
        }).join('');
        extrasHtml = `
            <button class="gallery-expand-btn">▼ 其他合照（${extras.length}張）</button>
            <div class="gallery-extra-scroll hidden">${thumbs}</div>`;
    }

    let spotsHtml = '';
    if (spots.length > 0) {
        const imgs = spots.map((url, i) => {
            const hi = fixDriveImage(url).replace('sz=w800', 'sz=w1200');
            return `<div class="spot-photo-item">
                <img src="${fixDriveImage(url)}" alt="景點照${i + 1}" class="gallery-clickable" ${lbAttr(hi, `🌟 ${stName} 景點照`)}>
                ${delBtn(url, 'spot')}
            </div>`;
        }).join('');
        spotsHtml = `<div class="photos-spot-section"><h4>🌟 景點照</h4><div class="gallery-spot-grid">${imgs}</div></div>`;
    }

    const stampUrl = fixDriveImage(station.stamp_img_url) || '';
    const stampHi  = stampUrl.replace('sz=w800', 'sz=w1200');
    const photoUrl = fixDriveImage(station.photo_img_url) || '';
    const photoHi  = photoUrl.replace('sz=w800', 'sz=w1200');

    area.innerHTML = `
        <div class="photos-stamp-row">
            <div class="photos-stamp-box">
                <h4>📝 紀念章</h4>
                <img src="${stampUrl}" alt="紀念章" class="gallery-clickable" ${lbAttr(stampHi, `📝 ${stName} 紀念章`)}>
                ${station.stamp_img_url ? delBtn(station.stamp_img_url, 'stamp') : ''}
            </div>
            <div class="photos-main-box">
                <h4>📸 合照</h4>
                <img class="photos-main-img gallery-clickable" src="${photoUrl}" alt="合照" ${lbAttr(photoHi, `📸 ${stName} 合照`)}>
                ${station.photo_img_url ? delBtn(station.photo_img_url, 'main') : ''}
                ${extrasHtml}
            </div>
        </div>
        ${spotsHtml}`;

    const expandBtn = area.querySelector('.gallery-expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', () => expandBtn.nextElementSibling.classList.toggle('hidden'));
    }
    area.querySelectorAll('.set-primary-btn').forEach(btn => {
        btn.addEventListener('click', () => setPrimaryPhoto(station, btn.dataset.url, btn));
    });
    area.querySelectorAll('.photo-del-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteMyPhoto(station, btn.dataset.url, btn.dataset.type));
    });
}

async function deleteMyPhoto(station, photoUrl, photoType) {
    if (!confirm('確定要刪除這張照片？')) return;
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'delete_photo',
                target_user_id: currentUserId,
                station_id: station.station_id,
                photo_url: photoUrl,
                photo_type: photoType
            })
        });
        const result = await res.json();
        if (result.success) {
            if      (photoType === 'stamp') station.stamp_img_url = '';
            else if (photoType === 'main')  station.photo_img_url = '';
            else if (photoType === 'extra') station.extra_photo_urls = station.extra_photo_urls.filter(u => u !== photoUrl);
            else if (photoType === 'spot')  station.spot_photo_urls  = station.spot_photo_urls.filter(u => u !== photoUrl);
            renderPhotosArea(station);
        } else {
            alert(result.message || '刪除失敗');
        }
    } catch(e) {
        alert('❌ 網路錯誤');
        console.error(e);
    }
}

async function setPrimaryPhoto(station, newPrimaryUrl, btn) {
    btn.disabled = true;
    btn.textContent = '處理中...';
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'set_primary_photo',
                user_id: currentUserId,
                station_id: station.station_id,
                new_primary_url: newPrimaryUrl
            })
        });
        const result = await res.json();
        if (result.success) {
            station.photo_img_url    = newPrimaryUrl;
            station.extra_photo_urls = result.extra_photo_urls ? result.extra_photo_urls.split(',').filter(u => u.trim()) : [];
            renderPhotosArea(station);
        } else {
            btn.disabled = false;
            btn.textContent = '設為主要';
            alert(result.message || '操作失敗');
        }
    } catch(e) {
        btn.disabled = false;
        btn.textContent = '設為主要';
        console.error(e);
    }
}

function setupSupplementArea(station) {
    const supplementArea      = document.getElementById('supplement-area');
    const supplementForm      = document.getElementById('supplement-form');
    const addExtraBtn         = document.getElementById('add-extra-btn');
    const addSpotBtn          = document.getElementById('add-spot-btn');
    const supplementFile      = document.getElementById('supplement-file');
    const supplementSubmitBtn = document.getElementById('supplement-submit-btn');
    const supplementMsg       = document.getElementById('supplement-msg');

    if (!currentUserId) { supplementArea.classList.add('hidden'); return; }
    supplementArea.classList.remove('hidden');
    supplementForm.classList.add('hidden');
    supplementMsg.textContent = '';

    let currentType = null;
    addExtraBtn.onclick = () => { currentType = 'extra'; supplementFile.value = ''; supplementMsg.textContent = ''; supplementForm.classList.remove('hidden'); };
    addSpotBtn.onclick  = () => { currentType = 'spot';  supplementFile.value = ''; supplementMsg.textContent = ''; supplementForm.classList.remove('hidden'); };

    supplementSubmitBtn.onclick = async () => {
        const files = supplementFile.files;
        if (!files || files.length === 0) { supplementMsg.style.color = 'red'; supplementMsg.textContent = '❌ 請選擇照片'; return; }

        supplementMsg.style.color = '#005edd';
        supplementMsg.textContent = `⏳ 上傳中（共 ${files.length} 張）...`;
        supplementSubmitBtn.disabled = true;

        try {
            const uploadedUrls = [];
            for (const file of files) {
                const base64 = await compressAndGetBase64(file);
                const res = await fetch(API_URL, {
                    method: 'POST',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        action: 'add_photo',
                        user_id: currentUserId,
                        station_id: station.station_id,
                        photo_base64: base64,
                        photo_mime: 'image/jpeg',
                        photo_type: currentType
                    })
                });
                const result = await res.json();
                if (result.success) {
                    uploadedUrls.push(result.photo_url);
                } else {
                    throw new Error(result.message || '上傳失敗');
                }
            }
            if (currentType === 'extra') {
                station.extra_photo_urls = [...(station.extra_photo_urls || []), ...uploadedUrls];
            } else {
                station.spot_photo_urls  = [...(station.spot_photo_urls  || []), ...uploadedUrls];
            }
            supplementMsg.style.color = 'green';
            supplementMsg.textContent = `✅ 成功上傳 ${uploadedUrls.length} 張！`;
            supplementForm.classList.add('hidden');
            renderPhotosArea(station);
        } catch(e) {
            supplementMsg.style.color = 'red';
            supplementMsg.textContent = '網路錯誤！';
            console.error(e);
        } finally {
            supplementSubmitBtn.disabled = false;
        }
    };
}

function setupLineFilter() {
    const lineColorMap = {};

    stationsRef.forEach(s => {
        if (s.station_id.includes('_hidden')) return;
        const lineNames = s.line_name  ? s.line_name.split(',')  : [];
        const colors    = s.line_color ? s.line_color.split(',') : [];
        lineNames.forEach((name, i) => {
            const k = name.trim();
            if (k && !lineColorMap[k]) lineColorMap[k] = (colors[i] || colors[0] || '#888').trim();
        });
    });

    activeLines = new Set(Object.keys(lineColorMap));

    const filterBox = document.getElementById('filter-box');
    Object.entries(lineColorMap).forEach(([name, color]) => {
        const btn = document.createElement('button');
        btn.className = 'filter-btn';
        btn.dataset.line = name;
        btn.style.backgroundColor = color;
        btn.textContent = name.replace(/線$/, '');
        btn.addEventListener('click', () => toggleLine(name, btn));
        filterBox.appendChild(btn);
    });

    document.getElementById('filter-all-btn').addEventListener('click', () => {
        filterBox.querySelectorAll('.filter-btn:not(#filter-all-btn)').forEach(b => {
            activeLines.add(b.dataset.line);
            b.classList.remove('inactive');
        });
        applyLineFilter();
    });
}

function toggleLine(lineName, btn) {
    if (activeLines.has(lineName)) {
        activeLines.delete(lineName);
        btn.classList.add('inactive');
    } else {
        activeLines.add(lineName);
        btn.classList.remove('inactive');
    }
    applyLineFilter();
}

function applyLineFilter() {
    const zoom = map.getZoom();
    allMarkers.forEach(marker => {
        const station = marker._station;
        if (!station) return;
        const isVisible = station.line_name.split(',').some(l => activeLines.has(l.trim()));
        if (isVisible) {
            marker.setStyle({ opacity: 1, fillOpacity: 1 });
            if (zoom >= LABEL_ZOOM_THRESHOLD) marker.openTooltip();
        } else {
            marker.setStyle({ opacity: 0, fillOpacity: 0 });
            marker.closeTooltip();
        }
    });

    Object.values(linePolylines).forEach(polyline => {
        const lns = polyline._lineNames;
        if (!lns || lns.size === 0) {
            polyline.setStyle({ opacity: 0.6 }); // 無 line_name 的路由輔助段，維持顯示
            return;
        }
        const isVisible = [...lns].some(l => activeLines.has(l));
        polyline.setStyle({ opacity: isVisible ? 0.6 : 0 });
    });
}

function setupSearch() {
    const input = document.getElementById('search-input');
    const results = document.getElementById('search-results');

    input.addEventListener('input', () => {
        const q = input.value.trim();
        if (!q) { results.style.display = 'none'; return; }

        const matches = stationsRef
            .filter(s => !s.station_id.includes('_hidden') && s.station_name.includes(q))
            .slice(0, 8);

        if (matches.length === 0) { results.style.display = 'none'; return; }

        results.innerHTML = matches.map(s => {
            const dotColor = s.line_color.split(',')[0].trim();
            return `<div class="search-result-item" data-id="${s.station_id}">
                <span style="width:10px;height:10px;border-radius:50%;background:${dotColor};flex-shrink:0;display:inline-block;"></span>
                ${s.station_name}
            </div>`;
        }).join('');
        results.style.display = 'block';

        results.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const station = stationsRef.find(s => s.station_id === item.dataset.id);
                if (!station || !markerMap[station.station_id]) return;
                input.value = '';
                results.style.display = 'none';
                markerMap[station.station_id].fire('click');
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (!document.getElementById('search-box').contains(e.target)) {
            results.style.display = 'none';
        }
    });
}

function updateLabelsVisibility() {
    const zoom = map.getZoom();
    allMarkers.forEach(m => {
        const station = m._station;
        if (station && activeLines.size > 0) {
            const isVisible = station.line_name.split(',').some(l => activeLines.has(l.trim()));
            if (!isVisible) return;
        }
        zoom >= LABEL_ZOOM_THRESHOLD ? m.openTooltip() : m.closeTooltip();
    });
}

map.on('zoomend', updateLabelsVisibility);

// 座標輔助工具（僅限管理員）
const isAdmin = currentUserId === 'admin' || !!(userObj && userObj.permissions && userObj.permissions.trim());
if (currentUserId === 'admin') {
    const coordDisplay = document.getElementById('coord-display');
    const coordCopied  = document.getElementById('coord-copied');
    let copiedTimer;

    map.on('mousemove', (e) => {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);
        coordDisplay.textContent = `📍 ${lat}, ${lng}`;
        coordDisplay.style.display = 'block';
    });
    map.on('mouseout', () => { coordDisplay.style.display = 'none'; });
    map.on('click', (e) => {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);
        navigator.clipboard.writeText(`${lat}\t${lng}`).then(() => {
            coordCopied.textContent = `✅ 已複製 ${lat}, ${lng}`;
            coordCopied.style.opacity = '1';
            clearTimeout(copiedTimer);
            copiedTimer = setTimeout(() => { coordCopied.style.opacity = '0'; }, 2000);
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