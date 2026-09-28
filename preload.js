const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // === Firebase Auth ===
  register: (username, email, password) => ipcRenderer.invoke('fb-register', username, email, password),
  login: (username, password, remember) => ipcRenderer.invoke('fb-login', username, password, remember),
  logout: () => ipcRenderer.invoke('fb-logout'),
  getCurrentUser: () => ipcRenderer.invoke('fb-get-current-user'),

  // === 帳號管理 ===
  sendResetEmail: (email) => ipcRenderer.invoke('fb-send-reset-email', email),
  changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('fb-change-password', oldPassword, newPassword),
  changeUsername: (newUsername) => ipcRenderer.invoke('fb-change-username', newUsername),
  changeEmail: (newEmail, password) => ipcRenderer.invoke('fb-change-email', newEmail, password),

  // === Firebase 資料 ===
  loadData: () => ipcRenderer.invoke('fb-load-records'),
  saveData: (records) => ipcRenderer.invoke('fb-save-records', records),

  // === 即時監聽 ===
  startWatchRecords: () => ipcRenderer.send('start-watch-records'),
  onRecordsUpdate: (callback) => {
    ipcRenderer.on('records-updated', (event, records) => callback(records));
  },

  // === 其他 ===
  exportCSV: (csv) => ipcRenderer.invoke('export-csv', csv),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  changeDataDir: () => ipcRenderer.invoke('change-data-dir'),

  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enabled) => ipcRenderer.invoke('set-auto-start', enabled),

  getDarkMode: () => ipcRenderer.invoke('get-dark-mode'),
  setDarkMode: (enabled) => ipcRenderer.invoke('set-dark-mode', enabled),

  getReminderSettings: () => ipcRenderer.invoke('get-reminder-settings'),
  setReminderSettings: (s) => ipcRenderer.invoke('set-reminder-settings', s),
  testReminder: () => ipcRenderer.invoke('test-reminder'),

  getBudgets: () => ipcRenderer.invoke('get-budgets'),
  setBudgets: (budgets) => ipcRenderer.invoke('set-budgets', budgets),

  goToMain: () => ipcRenderer.send('go-to-main'),
  goToLogin: () => ipcRenderer.send('go-to-login'),

  onFocusAddRecord: (callback) => {
    ipcRenderer.on('focus-add-record', () => callback());
  },

  // === 自動更新 ===
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  getAutoCheckUpdate: () => ipcRenderer.invoke('get-auto-check-update'),
  setAutoCheckUpdate: (enabled) => ipcRenderer.invoke('set-auto-check-update', enabled),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, version) => callback(version));
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update-progress', (event, percent) => callback(percent));
  }
});