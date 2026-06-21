function doGet(e) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  let stationSheet = ss.getSheetByName("Metro_Stations");
  let progressSheet = ss.getSheetByName("User_Progress");

  let stations = [];
  if (stationSheet) {
    let sData = stationSheet.getDataRange().getValues();
    let sHeaders = sData[0];
    for (let i = 1; i < sData.length; i++) {
      let obj = {};
      for (let j = 0; j < sHeaders.length; j++) obj[sHeaders[j]] = sData[i][j];
      stations.push(obj);
    }
  }

  let progress = [];
  const requestedUserId = (e && e.parameter && e.parameter.user_id) ? e.parameter.user_id : null;

  if (progressSheet && requestedUserId) {
    let pData = progressSheet.getDataRange().getValues();
    let pHeaders = pData[0];
    const userIdCol = pHeaders.indexOf('user_id');
    for (let i = 1; i < pData.length; i++) {
      if (userIdCol >= 0 && String(pData[i][userIdCol]) !== requestedUserId) continue;
      let obj = {};
      for (let j = 0; j < pHeaders.length; j++) obj[pHeaders[j]] = pData[i][j];
      progress.push(obj);
    }
  }

  let output = { stations: stations, progress: progress };

  // 回傳當前使用者的最新資料（讓前端無需重新登入就能更新權限）
  if (requestedUserId) {
    var usSheet = ss.getSheetByName('Users');
    var usData = usSheet.getDataRange().getValues();
    for (var i = 1; i < usData.length; i++) {
      if (String(usData[i][0]) === requestedUserId) {
        var userPerms = String(usData[i][4] || '');
        output.current_user = { user_id: usData[i][0], username: usData[i][1], avatar_url: usData[i][3] || '', permissions: userPerms };
        // 有管理需求的也拿到完整資料
        var needsAdminData = requestedUserId === 'admin' || userPerms.includes('users') || userPerms.includes('checkins');
        if (needsAdminData) {
          var allUsersArr = [];
          for (var j = 1; j < usData.length; j++) {
            allUsersArr.push({ user_id: usData[j][0], username: usData[j][1], avatar_url: usData[j][3] || '', permissions: String(usData[j][4] || '') });
          }
          var allProgData = progressSheet.getDataRange().getValues();
          var allProgHeaders = allProgData[0];
          var allProgArr = allProgData.slice(1).map(function(row) {
            var obj = {}; allProgHeaders.forEach(function(h, k) { obj[h] = row[k]; }); return obj;
          });
          output.all_users    = allUsersArr;
          output.all_progress = allProgArr;
        }
        break;
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}


function doPost(e) {
  try {
    let params = JSON.parse(e.postData.contents);
    let ss = SpreadsheetApp.getActiveSpreadsheet();
    let progressSheet = ss.getSheetByName("User_Progress");

    // --- 登入驗證邏輯 ---
    if (params.action === 'login') {
      let sheet = ss.getSheetByName("Users");
      if (!sheet) throw new Error("找不到 Users 工作表");
      let data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === params.user_id && String(data[i][2]) === String(params.password)) {
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            user: { user_id: data[i][0], username: data[i][1], avatar_url: data[i][3] || '', permissions: String(data[i][4] || '') },
            token: "auth_" + new Date().getTime()
          })).setMimeType(ContentService.MimeType.JSON);

        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: "帳號或密碼錯誤" })).setMimeType(ContentService.MimeType.JSON);
    }
  // --- 創建帳號邏輯 ---
    if (params.action === 'register') {
      let sheet = ss.getSheetByName("Users");
      if (!sheet) throw new Error("找不到 Users 工作表");
      let data = sheet.getDataRange().getValues();

      // 檢查 user_id 是否已存在
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(params.user_id)) {
          return ContentService.createTextOutput(JSON.stringify({ success: false, message: "此帳號 ID 已被使用" })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      // 欄位順序：user_id, username, password
      sheet.appendRow([params.user_id, params.username, params.password]);
      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- 更新頭貼邏輯 ---
    if (params.action === 'update_avatar') {
      let parentFolderId = "12SoeJwhGD9WU_fJSGr2xeYfCa60EmLiB";
      let parentFolder = DriveApp.getFolderById(parentFolderId);
      let userFolders = parentFolder.getFoldersByName(params.user_id);
      let userFolder = userFolders.hasNext() ? userFolders.next() : parentFolder.createFolder(params.user_id);

      // 刪除舊頭貼
      let oldFiles = userFolder.getFilesByName('avatar');
      while (oldFiles.hasNext()) { oldFiles.next().setTrashed(true); }

      let blob = Utilities.newBlob(
        Utilities.base64Decode(params.avatar_base64.split(',')[1]),
        params.avatar_mime,
        'avatar'
      );
      let avatarUrl = "https://drive.google.com/uc?id=" + userFolder.createFile(blob).getId();

      // 寫入 Users 表第 D 欄
      let sheet = ss.getSheetByName("Users");
      let data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === params.user_id) {
          sheet.getRange(i + 1, 4).setValue(avatarUrl);
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true, avatar_url: avatarUrl })).setMimeType(ContentService.MimeType.JSON);
    }
    // --- 移除頭貼邏輯 ---
    if (params.action === 'remove_avatar') {
      let parentFolderId = "12SoeJwhGD9WU_fJSGr2xeYfCa60EmLiB";
      let parentFolder = DriveApp.getFolderById(parentFolderId);
      let userFolders = parentFolder.getFoldersByName(params.user_id);
      if (userFolders.hasNext()) {
        let userFolder = userFolders.next();
        let oldFiles = userFolder.getFilesByName('avatar');
        while (oldFiles.hasNext()) { oldFiles.next().setTrashed(true); }
      }

      let sheet = ss.getSheetByName("Users");
      let data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === params.user_id) {
          sheet.getRange(i + 1, 4).setValue('');
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    }

    // --- 打卡與照片上傳邏輯 ---
    if (params.action === 'checkin') {
      const stampUrl = uploadToDrive(params.stamp_base64, params.stamp_mime, 'stamp_' + params.user_id + '_' + params.station_id, params.user_id);
      const photoUrl = uploadToDrive(params.photo_base64, params.photo_mime, 'photo_' + params.user_id + '_' + params.station_id, params.user_id);

      let extraUrls = '';
      if (params.extra_photos_base64 && params.extra_photos_base64.length > 0) {
        extraUrls = params.extra_photos_base64.map(function(b64, i) {
          return uploadToDrive(b64, 'image/jpeg', 'extra_' + params.user_id + '_' + params.station_id + '_' + i, params.user_id);
        }).join(',');
      }

      let spotUrls = '';
      if (params.spot_photos_base64 && params.spot_photos_base64.length > 0) {
        spotUrls = params.spot_photos_base64.map(function(b64, i) {
          return uploadToDrive(b64, 'image/jpeg', 'spot_' + params.user_id + '_' + params.station_id + '_' + i, params.user_id);
        }).join(',');
      }

      progressSheet.appendRow([params.user_id, params.station_id, stampUrl, photoUrl, new Date(), extraUrls, spotUrls]);

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        stamp_url: stampUrl,
        photo_url: photoUrl,
        extra_photo_urls: extraUrls,
        spot_photo_urls: spotUrls
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'add_photo') {
      const newUrl = uploadToDrive(params.photo_base64, params.photo_mime, params.photo_type + '_' + params.user_id + '_' + params.station_id + '_' + Date.now(), params.user_id);

      const rows = progressSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === params.user_id && rows[i][1] === params.station_id) {
          var col = params.photo_type === 'spot' ? 7 : 6;
          var existing = progressSheet.getRange(i + 1, col).getValue();
          progressSheet.getRange(i + 1, col).setValue(existing ? existing + ',' + newUrl : newUrl);
          return ContentService.createTextOutput(JSON.stringify({ success: true, photo_url: newUrl }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '找不到紀錄' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'set_primary_photo') {
      const rows = progressSheet.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === params.user_id && rows[i][1] === params.station_id) {
          var oldPrimary = rows[i][3];
          var extrasStr  = rows[i][5];
          var extrasArr  = extrasStr ? extrasStr.split(',').filter(function(u){ return u.trim() !== params.new_primary_url.trim(); }) : [];
          if (oldPrimary) extrasArr.push(oldPrimary);
          progressSheet.getRange(i + 1, 4).setValue(params.new_primary_url);
          progressSheet.getRange(i + 1, 6).setValue(extrasArr.join(','));
          return ContentService.createTextOutput(JSON.stringify({
            success: true,
            primary_url: params.new_primary_url,
            extra_photo_urls: extrasArr.join(',')
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '找不到紀錄' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'update_station') {
      const stSheet = ss.getSheetByName('Metro_Stations');
      const stData = stSheet.getDataRange().getValues();
      const headers = stData[0];
      const stationIdCol = headers.indexOf('station_id');
      const spotsJsonCol = headers.indexOf('spots_json');
      for (let i = 1; i < stData.length; i++) {
        if (stData[i][stationIdCol] === params.station_id) {
          stSheet.getRange(i + 1, spotsJsonCol + 1).setValue(params.spots_json);
          return ContentService.createTextOutput(JSON.stringify({ success: true }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '找不到車站' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'set_permissions') {
      var usersSheet = ss.getSheetByName('Users');
      var usersData = usersSheet.getDataRange().getValues();
      for (var i = 1; i < usersData.length; i++) {
        if (String(usersData[i][0]) === String(params.target_user_id)) {
          usersSheet.getRange(i + 1, 5).setValue(params.permissions || '');
          return ContentService.createTextOutput(JSON.stringify({ success: true, permissions: params.permissions || '' }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '找不到使用者' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'delete_checkin') {
      var rows = progressSheet.getDataRange().getValues();
      var headers = rows[0];
      var userCol = headers.indexOf('user_id');
      var stationCol = headers.indexOf('station_id');
      for (var i = rows.length - 1; i >= 1; i--) {
        if (String(rows[i][userCol]) === String(params.target_user_id) && String(rows[i][stationCol]) === String(params.station_id)) {
          progressSheet.deleteRow(i + 1);
          return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '找不到紀錄' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'delete_photo') {
      var rows = progressSheet.getDataRange().getValues();
      var headers = rows[0];
      var userCol = headers.indexOf('user_id');
      var stationCol = headers.indexOf('station_id');
      var stampCol = headers.indexOf('stamp_url');
      var photoCol = headers.indexOf('photo_url');
      var extraCol = headers.indexOf('extra_photo_urls');
      var spotCol = headers.indexOf('spot_photo_urls');
      for (var i = 1; i < rows.length; i++) {
        if (String(rows[i][userCol]) === String(params.target_user_id) && String(rows[i][stationCol]) === String(params.station_id)) {
          if (params.photo_type === 'stamp') { progressSheet.getRange(i + 1, stampCol + 1).setValue(''); }
          else if (params.photo_type === 'main') { progressSheet.getRange(i + 1, photoCol + 1).setValue(''); }
          else if (params.photo_type === 'extra') {
            var arr = String(rows[i][extraCol]).split(',').filter(function(u){ return u.trim() && u.trim() !== params.photo_url.trim(); });
            progressSheet.getRange(i + 1, extraCol + 1).setValue(arr.join(','));
          } else if (params.photo_type === 'spot') {
            var arr = String(rows[i][spotCol]).split(',').filter(function(u){ return u.trim() && u.trim() !== params.photo_url.trim(); });
            progressSheet.getRange(i + 1, spotCol + 1).setValue(arr.join(','));
          }
          return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: false, message: '找不到紀錄' })).setMimeType(ContentService.MimeType.JSON);
    }

    if (params.action === 'delete_user') {
      var usersSheet = ss.getSheetByName('Users');
      var usersData = usersSheet.getDataRange().getValues();
      for (var i = usersData.length - 1; i >= 1; i--) {
        if (String(usersData[i][0]) === String(params.target_user_id)) {
          usersSheet.deleteRow(i + 1);
          break;
        }
      }
      var progData = progressSheet.getDataRange().getValues();
      for (var i = progData.length - 1; i >= 1; i--) {
        if (String(progData[i][0]) === String(params.target_user_id)) {
          progressSheet.deleteRow(i + 1);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: '未知的 action: ' + params.action }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    // 捕捉所有內部錯誤並回傳 JSON，徹底避免觸發 CORS 錯誤
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "後端錯誤: " + error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }


}

function uploadToDrive(base64Data, mimeType, fileName, userId) {
  const parentFolderId = "12SoeJwhGD9WU_fJSGr2xeYfCa60EmLiB";
  const parentFolder = DriveApp.getFolderById(parentFolderId);
  const userFolders = parentFolder.getFoldersByName(userId);
  const userFolder = userFolders.hasNext() ? userFolders.next() : parentFolder.createFolder(userId);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(base64Data.split(',')[1]),
    mimeType,
    fileName
  );
  const file = userFolder.createFile(blob);
  return "https://drive.google.com/uc?id=" + file.getId();
}

function testDriveAccess() {
  const folder = DriveApp.getFolderById("12SoeJwhGD9WU_fJSGr2xeYfCa60EmLiB");
  Logger.log("資料夾名稱: " + folder.getName());
}

function forceAuth() {
  // 這行沒有實質作用，純粹用來「騙」Google 觸發雲端硬碟權限審查
  DriveApp.getRootFolder(); 
}