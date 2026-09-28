const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { autoUpdater } = require('electron-updater');
const fb = require('./firebase-service');

// =========================================================
// 自動更新設定
// =========================================================
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let updateDownloaded = false;
let downloadWindow = null;
let updateInfoCache = null;
let isManualCheck = false;

// =========================================================
// 下載進度視窗
// =========================================================
function showDownloadWindow(info) {
  if (downloadWindow && !downloadWindow.isDestroyed()) {
    downloadWindow.focus();
    return;
  }

  const iconPath = path.join(__dirname, 'icon.ico');

  downloadWindow = new BrowserWindow({
    width: 420,
    height: 240,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    center: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: { contextIsolation: true }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; font-family: "Microsoft JhengHei", Arial, sans-serif; }
        html, body {
          margin: 0; padding: 0;
          width: 100%; height: 100%;
          display: flex; align-items: center; justify-content: center;
          background: transparent;
          overflow: hidden;
        }
        .box {
          width: 100%; height: 100%;
          background: linear-gradient(135deg, #1B2A4E, #0F1B33);
          border-radius: 16px;
          padding: 24px 28px;
          color: white;
          box-shadow: 0 12px 40px rgba(0,0,0,0.4);
          border: 2px solid #2ECC71;
          display: flex; flex-direction: column;
          justify-content: center;
        }
        .title {
          font-size: 18px;
          font-weight: bold;
          color: #2ECC71;
          margin-bottom: 6px;
          text-align: center;
        }
        .version {
          font-size: 13px;
          color: #a8b5cc;
          text-align: center;
          margin-bottom: 14px;
        }
        .percent {
          font-size: 26px;
          font-weight: bold;
          color: #2ECC71;
          text-align: center;
          margin-bottom: 10px;
        }
        .progress-container {
          width: 100%;
          height: 16px;
          background: rgba(46,204,113,0.2);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 10px;
          position: relative;
        }
        .progress-bar {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #2ECC71, #27AE60);
          border-radius: 8px;
          transition: width 0.3s ease;
        }
        .progress-text {
          font-size: 13px;
          color: #cfd8dc;
          display: flex;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .hint {
          font-size: 12px;
          color: #8095b0;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="box">
        <div class="title">正在下載更新</div>
        <div class="version">版本 ${info.version}</div>
        <div class="percent" id="percent">0%</div>
        <div class="progress-container">
          <div class="progress-bar" id="bar"></div>
        </div>
        <div class="progress-text">
          <span id="downloaded">0 MB</span>
          <span id="total">0 MB</span>
        </div>
        <div class="hint">下載完成後會通知您重啟</div>
      </div>
      <script>
        window.updateProgress = function(percent, downloaded, total) {
          document.getElementById('percent').textContent = percent + '%';
          document.getElementById('bar').style.width = percent + '%';
          document.getElementById('downloaded').textContent = (downloaded / 1024 / 1024).toFixed(1) + ' MB';
          document.getElementById('total').textContent = (total / 1024 / 1024).toFixed(1) + ' MB';
        };
      </script>
    </body>
    </html>
  `;

  downloadWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  downloadWindow.on('closed', () => {
    downloadWindow = null;
  });

  return downloadWindow;
}

// =========================================================
// 自動更新事件
// =========================================================
autoUpdater.on('checking-for-update', () => {
  console.log('[更新] 檢查中...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[更新] 發現新版本：', info.version);
  updateInfoCache = info;

  // 顯示下載進度視窗
  showDownloadWindow(info);

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-available', info.version);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[更新] 已是最新版本');

  // 只有「手動檢查」才彈窗
  if (isManualCheck && mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '檢查更新',
      message: '已是最新版本',
      detail: `目前版本：v${app.getVersion()}\n\n沒有可用的更新。`,
      buttons: ['確定'],
      defaultId: 0
    });
  }
  isManualCheck = false;
});

autoUpdater.on('error', (err) => {
  console.error('[更新] 錯誤：', err);

  // 關閉下載進度視窗
  if (downloadWindow && !downloadWindow.isDestroyed()) {
    downloadWindow.close();
    downloadWindow = null;
  }

  // 只有「手動檢查」才彈窗
  if (isManualCheck && mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '檢查更新失敗',
      message: '無法檢查更新',
      detail: `錯誤訊息：${err.message || err}\n\n請確認網路連線，或稍後再試。`,
      buttons: ['確定'],
      defaultId: 0
    });
  }
  isManualCheck = false;
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent);
  const downloaded = progressObj.transferred;
  const total = progressObj.total;

  console.log(`[更新] 下載進度：${percent}% (${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB)`);

  // 更新下載視窗的進度條
  if (downloadWindow && !downloadWindow.isDestroyed()) {
    downloadWindow.webContents.executeJavaScript(
      `window.updateProgress(${percent}, ${downloaded}, ${total})`
    ).catch(() => {});
  }

  // 也更新主視窗狀態
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-progress', percent);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[更新] 下載完成，版本：', info.version);
  updateDownloaded = true;

  // 先關閉下載進度視窗
  if (downloadWindow && !downloadWindow.isDestroyed()) {
    downloadWindow.close();
    downloadWindow = null;
  }

  if (!mainWindow || mainWindow.isDestroyed()) return;

  // 跳出「下載完成」對話框
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '更新完成',
    message: `新版本 ${info.version} 已下載完成！`,
    detail: '點擊「立即重啟」以套用更新。\n（或關閉程式後，下次開啟會自動套用）',
    buttons: ['立即重啟', '稍後'],
    defaultId: 0,
    cancelId: 1
  }).then((result) => {
    if (result.response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });
});

async function checkForUpdates(manual = false) {
  isManualCheck = manual;
  try {
    console.log('[更新] 開始檢查...', manual ? '（手動）' : '（自動）');
    await autoUpdater.checkForUpdates();
  } catch (e) {
    console.error('[更新] 檢查失敗：', e);
    if (manual && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '檢查更新失敗',
        message: '無法檢查更新',
        detail: `錯誤訊息：${e.message || e}`,
        buttons: ['確定']
      });
    }
    isManualCheck = false;
  }
}

// =========================================================
// 單一實例鎖定
// =========================================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// =========================================================
// 路徑管理
// =========================================================
const appDataDir = app.getPath('userData');
const pointerPath = path.join(appDataDir, 'location.json');
const flagPath = path.join(appDataDir, 'initialized.flag');
const termsPath = path.join(appDataDir, 'terms.json');

const DEFAULT_DATA_DIR = path.join(app.getPath('documents'), '會計系統資料');

let mainWindow = null;
let tray = null;
let hourlyTimer = null;
let currentUser = null;
let isQuitting = false;
let lastReminderTime = 0;
let splashWindow = null;
let recordsUnsubscribe = null;
let hasRestoredLogin = false;

// ---------- flag ----------
function isInitialized() {
  return fs.existsSync(flagPath);
}

function markInitialized() {
  fs.writeFileSync(flagPath, new Date().toISOString(), 'utf-8');
}

// ---------- 合約同意狀態 ----------
function isTermsAccepted() {
  try {
    if (fs.existsSync(termsPath)) {
      const data = JSON.parse(fs.readFileSync(termsPath, 'utf-8'));
      return data.accepted === true;
    }
  } catch (e) { console.error(e); }
  return false;
}

function markTermsAccepted() {
  fs.writeFileSync(termsPath, JSON.stringify({
    accepted: true,
    acceptedAt: new Date().toISOString()
  }, null, 2), 'utf-8');
}

// ---------- 資料夾 ----------
function getDataDirFromPointer() {
  try {
    if (fs.existsSync(pointerPath)) {
      const p = JSON.parse(fs.readFileSync(pointerPath, 'utf-8'));
      if (p.dataDir) return p.dataDir;
    }
  } catch (e) { console.error(e); }
  return null;
}

function getDataDir() {
  const dir = getDataDirFromPointer();
  return dir || DEFAULT_DATA_DIR;
}

function setDataDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(pointerPath, JSON.stringify({ dataDir: dir }, null, 2), 'utf-8');
}

// ---------- 設定檔 ----------
function getConfigPath() {
  const dir = getDataDir();
  return path.join(dir, 'config.json');
}

function loadConfig() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { console.error(e); }
  return {};
}

function saveConfig(config) {
  try {
    const p = getConfigPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) { console.error(e); }
}

function updateConfig(partial) {
  const config = loadConfig();
  Object.assign(config, partial);
  saveConfig(config);
  return config;
}

function getReminderInterval() {
  const config = loadConfig();
  const minutes = config.reminderInterval || 60;
  return minutes * 60 * 1000;
}

function getIdleThreshold() {
  const config = loadConfig();
  const minutes = config.idleThreshold || 30;
  return minutes * 60 * 1000;
}

// ---------- 恢復登入狀態 ----------
async function restoreLoginState() {
  const config = loadConfig();
  if (config.rememberLogin && config.lastUser) {
    currentUser = {
      uid: config.lastUser.uid,
      email: config.lastUser.email,
      username: config.lastUser.username
    };

    if (hasRestoredLogin) {
      console.log('[登入恢復] 已恢復過，略過');
      return true;
    }

    if (config.savedPassword) {
      try {
        const result = await fb.loginUser(config.lastUser.email, config.savedPassword);
        if (result.ok) {
          console.log('[登入恢復] Firebase Auth 已重新登入:', result.user.uid);
          hasRestoredLogin = true;
        } else {
          console.error('[登入恢復] 重新登入失敗:', result.error);
        }
      } catch (e) {
        console.error('[登入恢復] 例外:', e);
      }
    } else {
      console.log('[登入恢復] 沒有儲存密碼，無法自動重新登入 Firebase');
    }

    return true;
  }
  return false;
}

// ---------- 等 Firebase Auth 恢復 ----------
function waitForAuthReady(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const u = fb.getCurrentUser();
    if (u) {
      resolve(u);
      return;
    }

    const timeout = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    const unsubscribe = fb.onAuthChange((user) => {
      if (user) {
        clearTimeout(timeout);
        if (typeof unsubscribe === 'function') unsubscribe();
        resolve(user);
      }
    });
  });
}

// ---------- 開始監聽 ----------
async function startRecordsWatch() {
  if (recordsUnsubscribe) {
    recordsUnsubscribe();
    recordsUnsubscribe = null;
  }
  if (!currentUser) return;

  const authUser = await waitForAuthReady(10000);
  const uid = authUser ? authUser.uid : currentUser.uid;

  recordsUnsubscribe = fb.watchRecords(uid, (newRecords) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('records-updated', newRecords);
    }
  });
}

function stopRecordsWatch() {
  if (recordsUnsubscribe) {
    recordsUnsubscribe();
    recordsUnsubscribe = null;
  }
}

// =========================================================
// 開機自啟動
// =========================================================
const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APP_REG_NAME = 'AccountingSystem';

function getAutoStartFromRegistry() {
  try {
    const result = spawnSync('reg', [
      'query',
      REG_KEY,
      '/v', APP_REG_NAME
    ], { encoding: 'utf-8', windowsHide: true });

    if (result.error) return false;
    if (result.status !== 0) return false;

    return (result.stdout || '').includes(APP_REG_NAME);
  } catch (e) {
    return false;
  }
}

function setAutoStartToRegistry(enabled) {
  if (enabled) {
    try {
      const exePath = process.execPath;
      const args = process.defaultApp ? [path.resolve(process.argv[1])] : [];
      const fullCommand = args.length > 0
        ? `"${exePath}" --hidden ${args.map(a => `"${a}"`).join(' ')}`
        : `"${exePath}" --hidden`;

      const result = spawnSync('reg', [
        'add',
        REG_KEY,
        '/v', APP_REG_NAME,
        '/t', 'REG_SZ',
        '/d', fullCommand,
        '/f'
      ], { encoding: 'utf-8', windowsHide: true });

      if (result.error) {
        console.error('[開機啟動] 執行錯誤', result.error);
        return false;
      }
      if (result.status !== 0) {
        console.error('[開機啟動] reg add 失敗', result.stderr);
        return false;
      }

      console.log('[開機啟動] 已寫入:', fullCommand);
      return true;
    } catch (e) {
      console.error('[開機啟動] 寫入失敗', e);
      return false;
    }
  } else {
    try {
      const result = spawnSync('reg', [
        'delete',
        REG_KEY,
        '/v', APP_REG_NAME,
        '/f'
      ], { encoding: 'utf-8', windowsHide: true });

      if (result.error) {
        console.error('[開機啟動] 刪除錯誤', result.error);
      } else if (result.status !== 0) {
        console.log('[開機啟動] 項目不存在，視為已關閉');
      } else {
        console.log('[開機啟動] 已移除');
      }
    } catch (e) {
      console.log('[開機啟動] 刪除失敗（項目可能不存在）', e);
    }
    return true;
  }
}

// =========================================================
// 歡迎畫面
// =========================================================
function showWelcomeSplash() {
  const iconPath = path.join(__dirname, 'icon.ico');
  splashWindow = new BrowserWindow({
    width: 420, height: 260,
    frame: false, transparent: true, alwaysOnTop: true,
    resizable: false, skipTaskbar: true, center: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: { contextIsolation: true }
  });

  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    html,body{margin:0;height:100%;font-family:"Microsoft JhengHei",Arial,sans-serif;
    display:flex;align-items:center;justify-content:center;background:transparent;overflow:hidden;}
    .box{width:380px;height:220px;background:linear-gradient(135deg,#1B2A4E,#0F1B33);
    border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,0.4);display:flex;flex-direction:column;
    align-items:center;justify-content:center;color:white;animation:pop .4s ease;
    border:2px solid #2ECC71;}
    @keyframes pop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}
    .icon{width:56px;height:56px;margin-bottom:10px;animation:float 1.5s ease-in-out infinite;
    border-radius:12px;}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
    .title{font-size:24px;font-weight:bold;letter-spacing:2px;margin-bottom:6px;
    color:#2ECC71;}
    .subtitle{font-size:14px;opacity:.85;}
    .loading{margin-top:18px;width:160px;height:5px;background:rgba(46,204,113,.2);
    border-radius:3px;overflow:hidden;position:relative;}
    .loading::after{content:"";position:absolute;top:0;left:0;width:40%;height:100%;
    background:#2ECC71;border-radius:3px;animation:load 1.5s ease-in-out infinite;}
    @keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}
    </style></head><body>
    <div class="box">
      <img class="icon" src="logo.png" onerror="this.style.display='none'">
      <div class="title">歡迎使用會計系統</div>
      <div class="subtitle">正在為您載入資料…</div>
      <div class="loading"></div>
    </div></body></html>
  `;

  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  splashWindow.on('closed', () => {
    splashWindow = null;
  });

  return splashWindow;
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// =========================================================
// 首次啟動合約視窗
// =========================================================
function showTermsDialog() {
  return new Promise((resolve) => {
    const iconPath = path.join(__dirname, 'icon.ico');

    const termsWin = new BrowserWindow({
      width: 540,
      height: 620,
      resizable: false,
      minimizable: false,
      maximizable: false,
      show: false,
      center: true,
      title: '授權合約',
      icon: fs.existsSync(iconPath) ? iconPath : undefined,
      webPreferences: {
        preload: path.join(__dirname, 'terms-preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    termsWin.setMenuBarVisibility(false);

    const html = `
      <!DOCTYPE html>
      <html lang="zh-TW">
      <head>
        <meta charset="UTF-8">
        <style>
          * { box-sizing: border-box; font-family: "Microsoft JhengHei", Arial, sans-serif; }
          body { margin: 0; height: 100vh; display: flex; flex-direction: column; background: #f5f7fa; }
          .header {
            background: linear-gradient(135deg, #1B2A4E, #0F1B33);
            color: white; padding: 20px 24px 16px;
            border-bottom: 3px solid #2ECC71;
          }
          .header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 1px; }
          .header p { margin: 0; font-size: 12.5px; color: #a8b5cc; }
          .content {
            flex: 1; overflow-y: auto; padding: 20px 24px;
            background: white; margin: 16px; border-radius: 10px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            font-size: 13.5px; line-height: 1.8; color: #333;
            white-space: pre-wrap;
          }
          .footer { padding: 0 24px 20px; }
          .check-row {
            display: flex; align-items: center; gap: 10px;
            padding: 14px 16px;
            background: #fff8e1;
            border: 2px solid #ffd54f;
            border-radius: 10px; margin-bottom: 14px;
            cursor: pointer; transition: all 0.2s;
          }
          .check-row:hover { background: #fff3c4; }
          .check-row.checked { background: #e8f5e9; border-color: #2ECC71; }
          .check-row input[type="checkbox"] {
            width: 20px; height: 20px; cursor: pointer;
            accent-color: #2ECC71;
          }
          .check-row label {
            font-size: 14px; font-weight: bold; color: #1B2A4E;
            cursor: pointer; user-select: none;
          }
          .buttons { display: flex; gap: 10px; }
          .btn {
            flex: 1; padding: 12px; border: none; border-radius: 8px;
            font-size: 15px; font-weight: bold; cursor: pointer;
            transition: all 0.2s; letter-spacing: 1px;
          }
          .btn-agree {
            background: linear-gradient(135deg, #2ECC71, #27AE60);
            color: white;
            box-shadow: 0 4px 12px rgba(46,204,113,0.35);
          }
          .btn-agree:hover:not(:disabled) {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(46,204,113,0.5);
          }
          .btn-agree:disabled {
            background: #cbd5e1; color: #94a3b8;
            cursor: not-allowed; box-shadow: none;
          }
          .btn-decline { background: #e74c3c; color: white; }
          .btn-decline:hover { background: #c0392b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>授權合約</h1>
          <p>請閱讀以下條款，並勾選同意才能繼續使用</p>
        </div>

        <div class="content" id="termsContent"></div>

        <div class="footer">
          <div class="check-row" id="checkRow">
            <input type="checkbox" id="agreeCheck">
            <label for="agreeCheck">我已閱讀並同意以上授權條款</label>
          </div>

          <div class="buttons">
            <button class="btn btn-agree" id="agreeBtn" disabled>同意並繼續</button>
            <button class="btn btn-decline" id="declineBtn">不同意並結束</button>
          </div>
        </div>

        <script>
          const termsText = "會計系統 軟體授權合約\\n\\n" +
            "一、授權範圍\\n" +
            "本軟體為個人使用之記帳工具，授權使用者於個人電腦上安裝與使用。\\n\\n" +
            "二、使用限制\\n" +
            "1. 不得將本軟體用於任何商業用途。\\n" +
            "2. 不得對本軟體進行反向工程、修改或散布。\\n" +
            "3. 不得移除本軟體中之著作權聲明。\\n\\n" +
            "三、資料儲存\\n" +
            "本軟體之所有記帳資料均儲存於雲端（Firebase）。\\n" +
            "使用本軟體需要網路連線以同步資料。\\n\\n" +
            "四、免責聲明\\n" +
            "本軟體係依「現狀」提供，不提供任何明示或暗示之保證。\\n" +
            "使用者應自行備份重要資料，開發者不對任何資料遺失負責。\\n\\n" +
            "五、同意條款\\n" +
            "勾選下方方塊並按下「同意並繼續」，\\n" +
            "即表示您已閱讀並同意上述所有條款。\\n\\n" +
            "Copyright © 2026 hyc. All rights reserved.";

          document.getElementById('termsContent').textContent = termsText;

          const agreeCheck = document.getElementById('agreeCheck');
          const agreeBtn = document.getElementById('agreeBtn');
          const declineBtn = document.getElementById('declineBtn');
          const checkRow = document.getElementById('checkRow');

          function updateState() {
            if (agreeCheck.checked) {
              agreeBtn.disabled = false;
              checkRow.classList.add('checked');
            } else {
              agreeBtn.disabled = true;
              checkRow.classList.remove('checked');
            }
          }

          agreeCheck.addEventListener('change', updateState);
          checkRow.addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
              agreeCheck.checked = !agreeCheck.checked;
              updateState();
            }
          });

          agreeBtn.addEventListener('click', function() {
            if (agreeCheck.checked && window.termsAPI) {
              window.termsAPI.agree();
            }
          });

          declineBtn.addEventListener('click', function() {
            if (window.termsAPI) {
              window.termsAPI.decline();
            }
          });

          updateState();
        </script>
      </body>
      </html>
    `;

    termsWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    ipcMain.once('terms-agree', () => {
      markTermsAccepted();
      resolve(true);
      if (!termsWin.isDestroyed()) termsWin.close();
    });

    ipcMain.once('terms-decline', () => {
      resolve(false);
      if (!termsWin.isDestroyed()) termsWin.close();
    });

    termsWin.once('ready-to-show', () => termsWin.show());

    termsWin.on('closed', () => {
      resolve(false);
    });
  });
}

// =========================================================
// 主視窗
// =========================================================
async function createWindow() {
  const iconPath = path.join(__dirname, 'icon.ico');
  mainWindow = new BrowserWindow({
    width: 1050, height: 780,
    resizable: false,
    show: false,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  await restoreLoginState();

  if (currentUser) {
    mainWindow.loadFile('index.html');
    mainWindow.webContents.once('did-finish-load', () => {
      startRecordsWatch();
    });
  } else {
    mainWindow.loadFile('login.html');
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// =========================================================
// 歡迎畫面 → 主視窗
// =========================================================
function showSplashThenWindow(options = {}) {
  const { hideAfter = false } = options;

  if (mainWindow) mainWindow.hide();

  const splash = showWelcomeSplash();

  setTimeout(async () => {
    closeSplash();

    if (mainWindow) {
      await restoreLoginState();

      if (currentUser) {
        startHourlyReminder();
        startRecordsWatch();
      }

      if (hideAfter) {
        // 縮到系統匣
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }, 5000);
}

// =========================================================
// 系統匣
// =========================================================
function createTray() {
  const iconPath = path.join(__dirname, 'icon.ico');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } else {
    trayIcon = nativeImage.createEmpty();
  }

  try {
    tray = new Tray(trayIcon);
    tray.setToolTip('會計系統');
    console.log('[系統匣] 建立成功');
  } catch (e) {
    console.error('[系統匣] 建立失敗:', e);
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '開啟會計系統',
      click: () => {
        if (mainWindow && !mainWindow.isVisible()) {
          showSplashThenWindow();
        } else if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: '立即記錄消費',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('focus-add-record');
        }
      }
    },
    { type: 'separator' },
    {
      label: '檢查更新',
      click: () => {
        checkForUpdates(true);
      }
    },
    { type: 'separator' },
    {
      label: '結束程式',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      showSplashThenWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// =========================================================
// 消費提醒
// =========================================================
const CHECK_INTERVAL = 60 * 1000;

function startHourlyReminder() {
  if (hourlyTimer) {
    console.log('[提醒] Timer 已存在，不重建');
    return;
  }

  const config = loadConfig();
  if (config.reminderEnabled !== true) return;

  lastReminderTime = config.lastReminderTime || 0;

  if (!lastReminderTime) {
    lastReminderTime = Date.now();
    updateConfig({ lastReminderTime });
    console.log('[提醒] 首次啟動，將於', Math.round(getReminderInterval() / 60000), '分鐘後提醒');
  } else {
    const remaining = getReminderInterval() - (Date.now() - lastReminderTime);
    if (remaining > 0) {
      console.log('[提醒] 距離下次提醒還有', Math.round(remaining / 60000), '分鐘');
    } else {
      console.log('[提醒] 已超過設定間隔，下次檢查時將提醒');
    }
  }

  hourlyTimer = setInterval(() => {
    checkAndRemind();
  }, CHECK_INTERVAL);
}

function checkAndRemind() {
  if (!currentUser) return;

  const config = loadConfig();
  if (config.reminderEnabled !== true) return;

  const interval = getReminderInterval();
  const now = Date.now();
  const elapsed = now - lastReminderTime;

  if (elapsed < interval) return;

  let systemIdleMs = 0;
  try {
    systemIdleMs = powerMonitor.getSystemIdleTime() * 1000;
  } catch (e) {
    systemIdleMs = 0;
  }

  const idleThreshold = getIdleThreshold();
  if (systemIdleMs >= idleThreshold) {
    console.log(`[提醒略過] 系統已閒置 ${Math.round(systemIdleMs / 60000)} 分鐘`);
    return;
  }

  lastReminderTime = now;
  updateConfig({ lastReminderTime });

  showReminderDialog(interval);
}

function showReminderDialog(interval) {
  if (!currentUser) return;

  const intervalLabel = interval >= 3600000
    ? `${Math.round(interval / 3600000)} 小時`
    : `${Math.round(interval / 60000)} 分鐘`;

  const displayName = currentUser.username || currentUser.email || '使用者';

  const options = {
    type: 'question',
    title: '消費提醒',
    message: `過去 ${intervalLabel} 內有消費嗎？`,
    detail: `使用者：${displayName}\n\n如果有消費，點「立即記錄」打開記帳畫面。`,
    buttons: ['立即記錄', '沒有消費', '稍後再說'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  };

  dialog.showMessageBox(options).then((result) => {
    if (result.response === 0) {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('focus-add-record');
      }
    }
  });
}

// =========================================================
// IPC：註冊
// =========================================================
ipcMain.handle('fb-register', async (event, username, email, password) => {
  username = (username || '').trim();
  email = (email || '').trim().toLowerCase();

  if (!username) return { ok: false, error: '請輸入使用者名稱' };
  if (username.length < 2) return { ok: false, error: '使用者名稱至少 2 個字元' };
  if (username.length > 20) return { ok: false, error: '使用者名稱最多 20 個字元' };
  if (!/^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/.test(username)) {
    return { ok: false, error: '使用者名稱只能包含中英數字、_ 和 -' };
  }

  const checkResult = await fb.isUsernameTaken(username);
  if (!checkResult.ok) return { ok: false, error: '檢查使用者名稱失敗：' + checkResult.error };
  if (checkResult.taken) return { ok: false, error: '此使用者名稱已被使用' };

  const result = await fb.registerUser(email, password);
  if (!result.ok) return result;

  const uid = result.user.uid;

  const bindResult = await fb.bindUsername(username, uid);
  if (!bindResult.ok) {
    return { ok: false, error: '綁定使用者名稱失敗：' + bindResult.error };
  }

  await fb.bindEmail(email, uid);

  await fb.saveProfile(uid, {
    username,
    email,
    createdAt: new Date().toISOString()
  });

  currentUser = { uid, email, username };
  hasRestoredLogin = true;

  return {
    ok: true,
    user: { uid, email, username }
  };
});

// =========================================================
// IPC：登入
// =========================================================
ipcMain.handle('fb-login', async (event, username, password, remember) => {
  username = (username || '').trim();

  if (!username) return { ok: false, error: '請輸入使用者名稱' };
  if (!password) return { ok: false, error: '請輸入密碼' };

  const uidResult = await fb.getUidByUsername(username);
  if (!uidResult.ok) return { ok: false, error: '查詢失敗：' + uidResult.error };
  if (!uidResult.uid) return { ok: false, error: '此使用者名稱不存在' };

  const profileResult = await fb.getProfile(uidResult.uid);
  if (!profileResult.ok) return { ok: false, error: '讀取資料失敗' };
  if (!profileResult.data) return { ok: false, error: '使用者資料不存在' };

  const email = profileResult.data.email;
  if (!email) return { ok: false, error: '使用者 Email 遺失' };

  const loginResult = await fb.loginUser(email, password);
  if (!loginResult.ok) {
    return { ok: false, error: loginResult.error };
  }

  currentUser = {
    uid: loginResult.user.uid,
    email: loginResult.user.email,
    username: profileResult.data.username
  };

  hasRestoredLogin = true;

  if (remember) {
    updateConfig({
      rememberLogin: true,
      lastUser: {
        uid: currentUser.uid,
        email: currentUser.email,
        username: currentUser.username
      },
      savedPassword: password
    });
  } else {
    updateConfig({ rememberLogin: false, lastUser: null, savedPassword: null });
  }

  return {
    ok: true,
    user: {
      uid: currentUser.uid,
      email: currentUser.email,
      username: currentUser.username
    }
  };
});

ipcMain.handle('fb-logout', async () => {
  stopRecordsWatch();
  await fb.logoutUser();
  currentUser = null;
  hasRestoredLogin = false;
  updateConfig({ rememberLogin: false, lastUser: null, savedPassword: null });
  if (hourlyTimer) {
    clearInterval(hourlyTimer);
    hourlyTimer = null;
  }
  return { ok: true };
});

ipcMain.handle('fb-get-current-user', () => {
  if (!currentUser) return null;
  return {
    uid: currentUser.uid,
    email: currentUser.email,
    username: currentUser.username
  };
});

// =========================================================
// IPC：密碼管理
// =========================================================
ipcMain.handle('fb-send-reset-email', async (event, email) => {
  if (!email) return { ok: false, error: '請輸入 Email' };
  return await fb.sendResetPasswordEmail(email);
});

ipcMain.handle('fb-change-password', async (event, oldPassword, newPassword) => {
  if (!currentUser) return { ok: false, error: '未登入' };
  if (!oldPassword) return { ok: false, error: '請輸入舊密碼' };
  if (!newPassword) return { ok: false, error: '請輸入新密碼' };
  if (newPassword.length < 6) return { ok: false, error: '新密碼至少 6 個字元' };
  if (oldPassword === newPassword) return { ok: false, error: '新密碼不能與舊密碼相同' };

  const result = await fb.changePassword(currentUser.email, oldPassword, newPassword);

  if (result.ok) {
    updateConfig({ savedPassword: newPassword });
  }

  return result;
});

ipcMain.handle('fb-change-username', async (event, newUsername) => {
  if (!currentUser) return { ok: false, error: '未登入' };

  newUsername = (newUsername || '').trim();
  if (!newUsername) return { ok: false, error: '請輸入新使用者名稱' };
  if (newUsername.length < 2) return { ok: false, error: '使用者名稱至少 2 個字元' };
  if (newUsername.length > 20) return { ok: false, error: '使用者名稱最多 20 個字元' };
  if (!/^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/.test(newUsername)) {
    return { ok: false, error: '使用者名稱只能包含中英數字、_ 和 -' };
  }
  if (newUsername === currentUser.username) {
    return { ok: false, error: '新使用者名稱與目前相同' };
  }

  const result = await fb.changeUsername(currentUser.username, newUsername, currentUser.uid);
  if (result.ok) {
    currentUser.username = newUsername;
    const config = loadConfig();
    if (config.rememberLogin && config.lastUser) {
      config.lastUser.username = newUsername;
      saveConfig(config);
    }
  }
  return result;
});

ipcMain.handle('fb-change-email', async (event, newEmail, password) => {
  if (!currentUser) return { ok: false, error: '未登入' };

  newEmail = (newEmail || '').trim().toLowerCase();
  if (!newEmail) return { ok: false, error: '請輸入新 Email' };
  if (!newEmail.includes('@')) return { ok: false, error: 'Email 格式不正確' };
  if (!password) return { ok: false, error: '請輸入目前密碼' };

  return await fb.changeEmail(newEmail, password, currentUser.email);
});

// =========================================================
// IPC：記帳資料
// =========================================================
ipcMain.handle('fb-load-records', async () => {
  if (!currentUser) return { ok: false, error: '未登入' };

  const authUser = await waitForAuthReady(10000);
  const uid = authUser ? authUser.uid : currentUser.uid;

  return await fb.getRecords(uid);
});

ipcMain.handle('fb-save-records', async (event, records) => {
  if (!currentUser) return { ok: false, error: '未登入' };

  const authUser = await waitForAuthReady(10000);
  const uid = authUser ? authUser.uid : currentUser.uid;

  return await fb.saveRecords(uid, records);
});

ipcMain.on('start-watch-records', () => {
  startRecordsWatch();
});

// =========================================================
// IPC：其他
// =========================================================
ipcMain.on('go-to-main', () => {
  if (mainWindow) mainWindow.loadFile('index.html');
  setTimeout(() => startRecordsWatch(), 500);
});

ipcMain.on('go-to-login', () => {
  stopRecordsWatch();
  if (mainWindow) mainWindow.loadFile('login.html');
});

ipcMain.handle('export-csv', async (event, csvContent) => {
  const dir = getDataDir() || app.getPath('documents');
  const safeName = currentUser
    ? (currentUser.username || currentUser.email).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')
    : 'unknown';
  const result = await dialog.showSaveDialog({
    defaultPath: path.join(dir,
      `記帳明細_${safeName}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`),
    filters: [{ name: 'CSV 檔案', extensions: ['csv'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false };
  try {
    fs.writeFileSync(result.filePath, '\uFEFF' + csvContent, 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('get-data-dir', () => getDataDir());

ipcMain.handle('change-data-dir', async () => {
  const current = getDataDir();
  const dir = await dialog.showOpenDialog({
    title: '選擇新的設定存放資料夾',
    defaultPath: current || undefined,
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: '選這個資料夾'
  });
  if (dir.canceled || dir.filePaths.length === 0) return { ok: false };

  const newDir = dir.filePaths[0];
  const oldDir = getDataDir();

  const newConfigPath = path.join(newDir, 'config.json');
  if (fs.existsSync(newConfigPath)) {
    const ans = await dialog.showMessageBox({
      type: 'question',
      title: '資料夾已有資料',
      message: '此資料夾內已有會計系統設定',
      detail: '請問要如何使用？',
      buttons: ['沿用該資料', '取消'],
      defaultId: 0,
      cancelId: 1
    });
    if (ans.response === 1) return { ok: false };
  } else if (oldDir && oldDir !== newDir && fs.existsSync(oldDir)) {
    const oldConfig = path.join(oldDir, 'config.json');
    if (fs.existsSync(oldConfig)) {
      try {
        fs.copyFileSync(oldConfig, newConfigPath);
      } catch (e) { console.error(e); }
    }
  }

  setDataDir(newDir);
  return { ok: true, dataDir: newDir };
});

ipcMain.handle('get-auto-start', () => getAutoStartFromRegistry());
ipcMain.handle('set-auto-start', (event, enabled) => {
  setAutoStartToRegistry(enabled);
  return getAutoStartFromRegistry();
});

ipcMain.handle('get-dark-mode', () => {
  const config = loadConfig();
  return config.darkMode === true;
});

ipcMain.handle('set-dark-mode', (event, enabled) => {
  updateConfig({ darkMode: enabled });
  return { ok: true };
});

ipcMain.handle('get-reminder-settings', () => {
  const config = loadConfig();
  return {
    interval: config.reminderInterval || 60,
    idleThreshold: config.idleThreshold || 30,
    enabled: config.reminderEnabled === true
  };
});

ipcMain.handle('set-reminder-settings', (event, settings) => {
  const oldConfig = loadConfig();
  const intervalChanged = oldConfig.reminderInterval !== settings.interval;

  updateConfig({
    reminderInterval: settings.interval,
    idleThreshold: settings.idleThreshold,
    reminderEnabled: settings.enabled
  });

  if (intervalChanged) {
    updateConfig({ lastReminderTime: Date.now() });
    console.log('[提醒] 頻率已變更為', settings.interval, '分鐘，重新計時');
  }

  if (!oldConfig.reminderEnabled && settings.enabled) {
    updateConfig({ lastReminderTime: Date.now() });
    console.log('[提醒] 剛啟用提醒，從現在開始計時');
  }

  if (hourlyTimer) {
    clearInterval(hourlyTimer);
    hourlyTimer = null;
  }

  if (settings.enabled && currentUser) {
    startHourlyReminder();
  }

  return { ok: true };
});

ipcMain.handle('test-reminder', () => {
  if (!currentUser) return { ok: false, error: '尚未登入' };
  showReminderDialog(getReminderInterval());
  return { ok: true };
});

ipcMain.handle('get-budgets', () => {
  const config = loadConfig();
  return config.budgets || {};
});

ipcMain.handle('set-budgets', (event, budgets) => {
  updateConfig({ budgets });
  return { ok: true };
});

// =========================================================
// IPC：自動更新
// =========================================================
ipcMain.handle('check-for-updates', async () => {
  try {
    isManualCheck = true;
    const result = await autoUpdater.checkForUpdates();
    if (result && result.updateInfo) {
      const currentVersion = app.getVersion();
      const newVersion = result.updateInfo.version;
      if (newVersion !== currentVersion) {
        return { ok: true, hasUpdate: true, version: newVersion };
      }
    }
    return { ok: true, hasUpdate: false };
  } catch (e) {
    isManualCheck = false;
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('install-update', () => {
  if (updateDownloaded) {
    isQuitting = true;
    autoUpdater.quitAndInstall();
    return { ok: true };
  }
  return { ok: false, error: '更新尚未下載完成' };
});

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-auto-check-update', () => {
  const config = loadConfig();
  return config.autoCheckUpdate !== false;
});

ipcMain.handle('set-auto-check-update', (event, enabled) => {
  updateConfig({ autoCheckUpdate: enabled });
  return { ok: true };
});

// =========================================================
// 啟動流程
// =========================================================
const isHiddenStart = process.argv.includes('--hidden');

async function checkDataDir() {
  const initialized = isInitialized();
  const pointerDir = getDataDirFromPointer();
  const dirExists = pointerDir && fs.existsSync(pointerDir);

  if (!initialized) {
    await askDataDir('歡迎使用會計系統！\n\n請先選擇一個資料夾來存放設定檔。');
    markInitialized();
    return;
  }

  if (pointerDir && !dirExists) {
    await askDataDir(`原本的資料夾已不存在：\n${pointerDir}\n\n請重新選擇一個資料夾。`);
    return;
  }
}

async function askDataDir(detail) {
  const result = await dialog.showMessageBox({
    type: 'info',
    title: '選擇設定存放位置',
    message: '請選擇設定檔存放資料夾',
    detail: detail + '\n\n建議選擇 D 槽或其他非系統槽的資料夾。\n（記帳資料已存在雲端，這裡只存設定檔）',
    buttons: ['選擇資料夾', '使用預設位置'],
    defaultId: 0,
    cancelId: 1
  });

  if (result.response === 0) {
    const dir = await dialog.showOpenDialog({
      title: '選擇設定存放資料夾',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '選這個資料夾'
    });
    if (!dir.canceled && dir.filePaths.length > 0) {
      setDataDir(dir.filePaths[0]);
    } else {
      setDataDir(DEFAULT_DATA_DIR);
    }
  } else {
    setDataDir(DEFAULT_DATA_DIR);
  }
}

app.whenReady().then(async () => {
  if (isHiddenStart) {
    console.log('[開機啟動] 等待 15 秒讓系統匣就緒...');
    await new Promise(r => setTimeout(r, 15000));
    console.log('[開機啟動] 開始初始化');
  }

  if (!isTermsAccepted()) {
    const accepted = await showTermsDialog();
    if (!accepted) {
      app.quit();
      return;
    }
  }

  createTray();
  await checkDataDir();
  await restoreLoginState();
  await createWindow();
  showSplashThenWindow({ hideAfter: isHiddenStart });

  const cfg = loadConfig();
  const autoCheckUpdate = cfg.autoCheckUpdate !== false;

  if (autoCheckUpdate) {
    setTimeout(() => {
      console.log('[更新] 自動檢查更新（可於設定關閉）');
      checkForUpdates(false);
    }, 5000);
  } else {
    console.log('[更新] 自動檢查已關閉');
  }
});

app.on('window-all-closed', () => {
  // 縮到系統匣
});

app.on('before-quit', () => {
  stopRecordsWatch();
  isQuitting = true;
});