const PAYMENT_METHODS = ["現金", "悠遊卡", "行動支付"];
const MOBILE_PAYMENTS = ["Samsung Pay", "Google Pay", "Line Pay", "悠遊付"];
const CATEGORIES = ["餐飲", "交通", "購物", "娛樂", "醫療", "教育", "居家", "其他"];
const INCOME_CATEGORIES = ["薪水", "獎金", "投資", "兼職", "其他收入"];

let records = [];
let selectedRows = new Set();
let lastSavedRecordsJson = '';
let editingId = null;   // 目前正在編輯的記錄物件參照

let filters = {
  keyword: '', type: '', category: '', payment: '', month: '',
  amountMin: null, amountMax: null
};

let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = null;

let budgetYear = new Date().getFullYear();
let budgetMonth = new Date().getMonth();
let budgets = {};

let saveTimer = null;

// ===================== 初始化 =====================
async function init() {
  try {
    const darkMode = await window.api.getDarkMode();
    applyDarkMode(darkMode);
  } catch (e) {}

  const user = await window.api.getCurrentUser();
  if (user) {
    const displayName = user.username || user.email || '使用者';
    document.getElementById('current-user-display').textContent = displayName;
  }

  await loadRecordsFromCloud();
  budgets = await window.api.getBudgets() || {};

  buildDateSelects();
  buildPaymentSelects();
  buildCategorySelects("支出");
  bindEvents();
  buildFilterOptions();
  buildCalendar();
  buildBudgetPage();
  buildReportPage();

  await loadSettings();
  await refreshAccountInfo();

  refreshTable();
  refreshStats();

  window.api.startWatchRecords();
  window.api.onRecordsUpdate((newRecords) => {
    const incomingJson = JSON.stringify(newRecords || []);
    if (incomingJson === lastSavedRecordsJson) return;
    records = newRecords || [];
    refreshTable();
    refreshStats();
    buildCalendar();
    buildBudgetPage();
    buildReportPage();
  });

  await initUpdateInfo();
}

async function loadRecordsFromCloud() {
  try {
    const result = await window.api.loadData();
    if (result.ok) {
      records = result.data || [];
      lastSavedRecordsJson = JSON.stringify(records);
    } else {
      records = [];
      console.error('載入資料失敗:', result.error);
      setTimeout(() => {
        customAlert('載入雲端資料失敗：' + (result.error || '未知錯誤'));
      }, 100);
    }
  } catch (e) {
    console.error('載入資料例外:', e);
    records = [];
  }
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      lastSavedRecordsJson = JSON.stringify(records);
      const result = await window.api.saveData(records);
      if (!result.ok) {
        console.error('儲存失敗:', result.error);
        customAlert('儲存失敗：' + (result.error || '未知錯誤'));
      }
    } catch (e) {
      console.error('儲存例外:', e);
      customAlert('儲存失敗：' + e.message);
    }
  }, 500);
}

// ===================== 設定 =====================
async function loadSettings() {
  try {
    const autoStart = await window.api.getAutoStart();
    document.getElementById('auto-start-toggle').checked = !!autoStart;
  } catch (e) {
    console.error('讀取自啟動失敗', e);
  }

  try {
    const darkMode = await window.api.getDarkMode();
    applyDarkMode(darkMode);
    document.getElementById('dark-mode-toggle').checked = darkMode;
  } catch (e) {
    console.error('讀取深色模式失敗', e);
  }

  const dir = await window.api.getDataDir();
  document.getElementById('data-dir-display').textContent = dir || '（尚未設定）';

  try {
    const reminder = await window.api.getReminderSettings();
    document.getElementById('reminder-enabled').checked = reminder.enabled;
    document.getElementById('reminder-interval').value = String(reminder.interval);
    document.getElementById('idle-threshold').value = String(reminder.idleThreshold);
    updateReminderRowsVisibility(reminder.enabled);
  } catch (e) {
    console.error('讀取提醒設定失敗', e);
  }
}

async function refreshAccountInfo() {
  const user = await window.api.getCurrentUser();
  if (!user) return;

  const usernameEl = document.getElementById('display-username');
  const emailEl = document.getElementById('display-email');

  if (usernameEl) usernameEl.textContent = user.username || '-';
  if (emailEl) emailEl.textContent = user.email || '-';
}

function updateReminderRowsVisibility(enabled) {
  const rows = ['row-reminder-interval', 'row-idle-threshold', 'row-test-reminder'];
  const hrs = ['hr-reminder-1', 'hr-reminder-2'];

  rows.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (enabled) el.classList.remove('disabled-row');
    else el.classList.add('disabled-row');
  });

  hrs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = enabled ? '' : 'none';
  });

  ['reminder-interval', 'idle-threshold'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
  const testBtn = document.getElementById('test-reminder-btn');
  if (testBtn) testBtn.disabled = !enabled;
}

function buildDateSelects() {
  const now = new Date();
  const yearSel = document.getElementById('year');
  const monthSel = document.getElementById('month');
  const daySel = document.getElementById('day');
  const hourSel = document.getElementById('hour');
  const minuteSel = document.getElementById('minute');

  for (let y = now.getFullYear() - 5; y <= now.getFullYear() + 1; y++) {
    yearSel.add(new Option(y, y));
  }
  for (let m = 1; m <= 12; m++) {
    monthSel.add(new Option(String(m).padStart(2, '0'), String(m).padStart(2, '0')));
  }
  for (let d = 1; d <= 31; d++) {
    daySel.add(new Option(String(d).padStart(2, '0'), String(d).padStart(2, '0')));
  }
  for (let h = 0; h < 24; h++) {
    hourSel.add(new Option(String(h).padStart(2, '0'), String(h).padStart(2, '0')));
  }
  for (let m = 0; m < 60; m++) {
    minuteSel.add(new Option(String(m).padStart(2, '0'), String(m).padStart(2, '0')));
  }

  yearSel.value = now.getFullYear();
  monthSel.value = String(now.getMonth() + 1).padStart(2, '0');
  daySel.value = String(now.getDate()).padStart(2, '0');
  hourSel.value = String(now.getHours()).padStart(2, '0');
  minuteSel.value = String(now.getMinutes()).padStart(2, '0');
}

function buildPaymentSelects() {
  const paySel = document.getElementById('payment');
  PAYMENT_METHODS.forEach(p => paySel.add(new Option(p, p)));

  const mobSel = document.getElementById('mobile');
  MOBILE_PAYMENTS.forEach(m => mobSel.add(new Option(m, m)));
}

function buildCategorySelects(type) {
  const catSel = document.getElementById('category');
  catSel.innerHTML = '';
  const list = type === '收入' ? INCOME_CATEGORIES : CATEGORIES;
  list.forEach(c => catSel.add(new Option(c, c)));
}

function buildFilterOptions() {
  const categorySel = document.getElementById('filter-category');
  categorySel.innerHTML = '<option value="">全部</option>';
  const allCats = [...new Set([...CATEGORIES, ...INCOME_CATEGORIES])];
  allCats.forEach(c => categorySel.add(new Option(c, c)));
  buildFilterMonths();
}

function buildFilterMonths() {
  const monthSel = document.getElementById('filter-month');
  const current = monthSel.value;
  const months = [...new Set(records.map(r => r.date.slice(0, 7)))].sort().reverse();

  monthSel.innerHTML = '<option value="">全部</option>';
  months.forEach(m => monthSel.add(new Option(m, m)));

  if (months.includes(current)) monthSel.value = current;
}

function bindEvents() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');

      if (btn.dataset.tab === 'settings') loadSettings();
      if (btn.dataset.tab === 'calendar') buildCalendar();
      if (btn.dataset.tab === 'budget') buildBudgetPage();
      if (btn.dataset.tab === 'report') buildReportPage();
    });
  });

  document.querySelectorAll('input[name="type"]').forEach(r => {
    r.addEventListener('change', onTypeChange);
  });

  document.getElementById('payment').addEventListener('change', onPaymentChange);

  document.getElementById('add-btn').addEventListener('click', addRecord);
  document.getElementById('delete-btn').addEventListener('click', deleteSelected);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('export-btn').addEventListener('click', exportCSV);

  document.getElementById('refresh-stats').addEventListener('click', refreshStats);
  document.getElementById('stats-month').addEventListener('change', refreshStats);

  document.getElementById('auto-start-toggle').addEventListener('change', onAutoStartToggle);
  document.getElementById('dark-mode-toggle').addEventListener('change', onDarkModeToggle);
  document.getElementById('change-dir-btn').addEventListener('click', onChangeDir);

  document.getElementById('reminder-enabled').addEventListener('change', onReminderSettingsChange);
  document.getElementById('reminder-interval').addEventListener('change', onReminderSettingsChange);
  document.getElementById('idle-threshold').addEventListener('change', onReminderSettingsChange);
  document.getElementById('test-reminder-btn').addEventListener('click', onTestReminder);

  document.getElementById('logout-btn').addEventListener('click', async () => {
    const ok = await customConfirm('確定要登出嗎？');
    if (ok) {
      await window.api.logout();
      window.api.goToLogin();
    }
  });

  if (window.api.onFocusAddRecord) {
    window.api.onFocusAddRecord(() => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="input"]').classList.add('active');
      document.getElementById('tab-input').classList.add('active');
      const itemInput = document.getElementById('item');
      if (itemInput) {
        itemInput.focus();
        itemInput.select();
      }
    });
  }

  document.getElementById('filter-keyword').addEventListener('input', onFilterChange);
  document.getElementById('filter-type').addEventListener('change', onFilterChange);
  document.getElementById('filter-category').addEventListener('change', onFilterChange);
  document.getElementById('filter-payment').addEventListener('change', onFilterChange);
  document.getElementById('filter-month').addEventListener('change', onFilterChange);
  document.getElementById('filter-amount-min').addEventListener('input', onFilterChange);
  document.getElementById('filter-amount-max').addEventListener('input', onFilterChange);
  document.getElementById('clear-filter-btn').addEventListener('click', clearFilters);

  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    calSelectedDate = null;
    buildCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calSelectedDate = null;
    buildCalendar();
  });
  document.getElementById('cal-today').addEventListener('click', () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = null;
    buildCalendar();
  });

  document.getElementById('budget-prev').addEventListener('click', () => {
    budgetMonth--;
    if (budgetMonth < 0) { budgetMonth = 11; budgetYear--; }
    buildBudgetPage();
  });
  document.getElementById('budget-next').addEventListener('click', () => {
    budgetMonth++;
    if (budgetMonth > 11) { budgetMonth = 0; budgetYear++; }
    buildBudgetPage();
  });
  document.getElementById('budget-today').addEventListener('click', () => {
    const now = new Date();
    budgetYear = now.getFullYear();
    budgetMonth = now.getMonth();
    buildBudgetPage();
  });
  document.getElementById('budget-total-save').addEventListener('click', saveTotalBudget);
  document.getElementById('budget-save-all').addEventListener('click', saveAllBudgets);

  document.getElementById('report-year').addEventListener('change', buildReportPage);

  const changeUsernameBtn = document.getElementById('change-username-btn');
  if (changeUsernameBtn) {
    changeUsernameBtn.addEventListener('click', onChangeUsername);
  }

  const changeEmailBtn = document.getElementById('change-email-btn');
  if (changeEmailBtn) {
    changeEmailBtn.addEventListener('click', onChangeEmail);
  }

  const changePwdBtn = document.getElementById('change-password-btn');
  if (changePwdBtn) {
    changePwdBtn.addEventListener('click', onChangePassword);
  }

  const checkUpdateBtn = document.getElementById('check-update-btn');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', onCheckUpdate);
  }

  const autoUpdateToggle = document.getElementById('auto-update-toggle');
  if (autoUpdateToggle) {
    autoUpdateToggle.addEventListener('change', onAutoUpdateToggle);
  }

  // 編輯彈窗事件
  bindEditModalEvents();
}

// ===================== 編輯記錄 =====================
function bindEditModalEvents() {
  // 類型切換
  document.querySelectorAll('input[name="edit-type"]').forEach(r => {
    r.addEventListener('change', (e) => {
      const type = e.target.value;
      buildEditCategorySelects(type);
      updateEditPaymentVisibility(type, document.getElementById('edit-payment').value);
    });
  });

  // 付款方式切換
  document.getElementById('edit-payment').addEventListener('change', (e) => {
    updateEditPaymentVisibility(
      document.querySelector('input[name="edit-type"]:checked').value,
      e.target.value
    );
  });

  // 取消
  document.getElementById('edit-cancel').addEventListener('click', closeEditModal);

  // 點背景關閉
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });

  // 儲存
  document.getElementById('edit-save').addEventListener('click', saveEditRecord);
}

function openEditModal(record) {
  if (!record) return;
  editingId = record;

  document.querySelector(`input[name="edit-type"][value="${record.type}"]`).checked = true;
  document.getElementById('edit-date').value = record.date;
  document.getElementById('edit-time').value = record.time || '00:00';
  document.getElementById('edit-item').value = record.item || '';
  document.getElementById('edit-amount').value = record.amount;

  buildEditCategorySelects(record.type, record.category);
  buildEditPaymentSelects();
  document.getElementById('edit-payment').value = record.payment || '現金';
  document.getElementById('edit-mobile').value = record.mobile || MOBILE_PAYMENTS[0];

  updateEditPaymentVisibility(record.type, record.payment);

  document.getElementById('edit-modal').style.display = 'flex';
}

function buildEditCategorySelects(type, selectedCat) {
  const sel = document.getElementById('edit-category');
  sel.innerHTML = '';
  const list = type === '收入' ? INCOME_CATEGORIES : CATEGORIES;
  list.forEach(c => sel.add(new Option(c, c)));
  if (selectedCat && list.includes(selectedCat)) {
    sel.value = selectedCat;
  }
}

function buildEditPaymentSelects() {
  const paySel = document.getElementById('edit-payment');
  if (paySel.options.length === 0) {
    PAYMENT_METHODS.forEach(p => paySel.add(new Option(p, p)));
  }

  const mobSel = document.getElementById('edit-mobile');
  if (mobSel.options.length === 0) {
    MOBILE_PAYMENTS.forEach(m => mobSel.add(new Option(m, m)));
  }
}

function updateEditPaymentVisibility(type, payment) {
  const payLabel = document.getElementById('edit-payment-label');
  const paySel = document.getElementById('edit-payment');
  const mobLabel = document.getElementById('edit-mobile-label');
  const mobSel = document.getElementById('edit-mobile');

  if (type === '收入') {
    payLabel.classList.add('hidden');
    paySel.classList.add('hidden');
    mobLabel.classList.add('hidden');
    mobSel.classList.add('hidden');
  } else {
    payLabel.classList.remove('hidden');
    paySel.classList.remove('hidden');

    if (payment === '行動支付') {
      mobLabel.classList.remove('hidden');
      mobSel.classList.remove('hidden');
    } else {
      mobLabel.classList.add('hidden');
      mobSel.classList.add('hidden');
    }
  }
}

function closeEditModal() {
  document.getElementById('edit-modal').style.display = 'none';
  editingId = null;
}

async function saveEditRecord() {
  if (!editingId) return;

  const type = document.querySelector('input[name="edit-type"]:checked').value;
  const date = document.getElementById('edit-date').value;
  const time = document.getElementById('edit-time').value || '00:00';
  const category = document.getElementById('edit-category').value;
  const item = document.getElementById('edit-item').value.trim();
  const amountStr = document.getElementById('edit-amount').value.trim();

  if (!date) return customAlert('請選擇日期');
  if (!item) return customAlert('請輸入項目內容');
  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return customAlert('請輸入正確的金額（正數字）');

  let payment = '';
  let mobile = '';
  if (type === '支出') {
    payment = document.getElementById('edit-payment').value;
    if (payment === '行動支付') {
      mobile = document.getElementById('edit-mobile').value;
    }
  }

  // 詢問是否確定編輯
  const detailText =
    `類型：${type}\n` +
    `日期：${date} ${time}\n` +
    `類別：${category}\n` +
    `項目：${item}\n` +
    `金額：${amount}` +
    (payment ? `\n付款：${payment}${mobile ? ' / ' + mobile : ''}` : '');

  const ok = await customConfirm('確定要儲存這筆編輯嗎？\n\n' + detailText);
  if (!ok) return;

  const idx = records.indexOf(editingId);
  if (idx === -1) {
    await customAlert('找不到要編輯的記錄（可能已被刪除）');
    closeEditModal();
    return;
  }

  records[idx] = {
    ...records[idx],
    type,
    date,
    time,
    category,
    item,
    amount,
    payment,
    mobile
  };

  scheduleSave();

  refreshTable();
  refreshStats();
  buildCalendar();
  buildBudgetPage();
  buildReportPage();

  closeEditModal();
}

// ===================== 自動更新 =====================
async function onCheckUpdate() {
  const btn = document.getElementById('check-update-btn');
  const status = document.getElementById('update-status');

  btn.disabled = true;
  btn.textContent = '檢查中…';
  status.textContent = '正在檢查更新…';

  try {
    const result = await window.api.checkForUpdates();

    if (!result.ok) {
      status.textContent = '檢查失敗：' + (result.error || '未知錯誤');
      btn.disabled = false;
      btn.textContent = '檢查更新';
      return;
    }

    if (result.hasUpdate) {
      status.textContent = `發現新版本 ${result.version}，正在下載…`;
      btn.textContent = '下載中…';
    } else {
      const v = await window.api.getVersion();
      status.textContent = `已是最新版本（v${v}）`;
      btn.disabled = false;
      btn.textContent = '檢查更新';
    }
  } catch (e) {
    status.textContent = '檢查失敗：' + e.message;
    btn.disabled = false;
    btn.textContent = '檢查更新';
  }
}

async function initUpdateInfo() {
  const versionEl = document.getElementById('app-version');
  if (versionEl) {
    try {
      const v = await window.api.getVersion();
      versionEl.textContent = 'v' + v;
    } catch (e) {
      versionEl.textContent = '未知';
    }
  }

  const autoUpdateToggle = document.getElementById('auto-update-toggle');
  if (autoUpdateToggle) {
    try {
      const enabled = await window.api.getAutoCheckUpdate();
      autoUpdateToggle.checked = enabled;
    } catch (e) {
      console.error('讀取自動檢查設定失敗', e);
    }
  }

  if (window.api.onUpdateProgress) {
    window.api.onUpdateProgress((percent) => {
      const status = document.getElementById('update-status');
      if (status) status.textContent = `下載中… ${percent}%`;
    });
  }

  if (window.api.onUpdateAvailable) {
    window.api.onUpdateAvailable((version) => {
      const status = document.getElementById('update-status');
      if (status) status.textContent = `發現新版本 ${version}，正在下載…`;
    });
  }
}

async function onAutoUpdateToggle(e) {
  const enabled = e.target.checked;
  await window.api.setAutoCheckUpdate(enabled);

  const status = document.getElementById('update-status');
  if (status) {
    status.textContent = enabled
      ? '已開啟自動檢查更新'
      : '已關閉自動檢查更新';
  }
}

// ===================== 深色模式 =====================
function applyDarkMode(enabled) {
  if (enabled) {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

async function onDarkModeToggle(e) {
  const enabled = e.target.checked;
  applyDarkMode(enabled);
  await window.api.setDarkMode(enabled);
}

// ===================== 帳號安全 =====================
async function onChangeUsername() {
  const user = await window.api.getCurrentUser();
  if (!user) return;

  const newUsername = await customPrompt(
    `目前的稱號：${user.username}\n\n請輸入新的使用者名稱（2~20 個字元）：`,
    { title: '變更使用者名稱', placeholder: '例如：小明、alice' }
  );

  if (!newUsername) return;

  const result = await window.api.changeUsername(newUsername);

  if (result.ok) {
    await customAlert('✅ 使用者名稱已變更成功！\n\n下次登入請用新的名稱。');
    document.getElementById('current-user-display').textContent = newUsername;
    refreshAccountInfo();
  } else {
    await customAlert('❌ 變更失敗：' + (result.error || '未知錯誤'));
  }
}

async function onChangeEmail() {
  const user = await window.api.getCurrentUser();
  if (!user) return;

  const values = await customForm(
    '變更 Email',
    [
      { id: 'newEmail', label: '新 Email', type: 'email', placeholder: 'new@example.com' },
      { id: 'password', label: '目前密碼（驗證身份）', type: 'password', placeholder: '請輸入目前密碼' }
    ]
  );

  if (!values) return;

  const result = await window.api.changeEmail(values.newEmail, values.password);

  if (result.ok) {
    await customAlert(
      `✅ 已寄送驗證信到：${result.newEmail}\n\n` +
      `請去新 Email 收信，點擊信中連結完成變更。\n\n` +
      `⚠️ 在驗證完成前，登入仍使用舊 Email。`
    );
  } else {
    await customAlert('❌ 變更失敗：' + (result.error || '未知錯誤'));
  }
}

async function onChangePassword() {
  const values = await customForm(
    '變更密碼',
    [
      { id: 'oldPwd', label: '目前密碼', type: 'password', placeholder: '請輸入目前密碼' },
      { id: 'newPwd', label: '新密碼（至少 6 個字元）', type: 'password', placeholder: '請輸入新密碼' },
      { id: 'confirmPwd', label: '確認新密碼', type: 'password', placeholder: '請再輸入一次新密碼' }
    ]
  );

  if (!values) return;

  if (values.newPwd.length < 6) {
    await customAlert('新密碼至少 6 個字元');
    return;
  }

  if (values.newPwd !== values.confirmPwd) {
    await customAlert('兩次新密碼不一致');
    return;
  }

  if (values.oldPwd === values.newPwd) {
    await customAlert('新密碼不能與舊密碼相同');
    return;
  }

  const result = await window.api.changePassword(values.oldPwd, values.newPwd);

  if (result.ok) {
    await customAlert('✅ 密碼已變更成功！\n\n下次登入請用新密碼。');
  } else {
    await customAlert('❌ 變更失敗：' + (result.error || '未知錯誤'));
  }
}

// ===================== 篩選 =====================
function onFilterChange() {
  filters.keyword = document.getElementById('filter-keyword').value.trim().toLowerCase();
  filters.type = document.getElementById('filter-type').value;
  filters.category = document.getElementById('filter-category').value;
  filters.payment = document.getElementById('filter-payment').value;
  filters.month = document.getElementById('filter-month').value;

  const minStr = document.getElementById('filter-amount-min').value.trim();
  const maxStr = document.getElementById('filter-amount-max').value.trim();
  filters.amountMin = minStr === '' ? null : parseFloat(minStr);
  filters.amountMax = maxStr === '' ? null : parseFloat(maxStr);

  refreshTable();
}

function clearFilters() {
  document.getElementById('filter-keyword').value = '';
  document.getElementById('filter-type').value = '';
  document.getElementById('filter-category').value = '';
  document.getElementById('filter-payment').value = '';
  document.getElementById('filter-month').value = '';
  document.getElementById('filter-amount-min').value = '';
  document.getElementById('filter-amount-max').value = '';

  filters = {
    keyword: '', type: '', category: '', payment: '', month: '',
    amountMin: null, amountMax: null
  };

  refreshTable();
}

function applyFilters(list) {
  return list.filter(r => {
    if (filters.keyword) {
      const text = (r.item || '').toLowerCase();
      if (!text.includes(filters.keyword)) return false;
    }
    if (filters.type && r.type !== filters.type) return false;
    if (filters.category && r.category !== filters.category) return false;
    if (filters.payment) {
      if (r.type !== '支出') return false;
      if (r.payment !== filters.payment) return false;
    }
    if (filters.month && !r.date.startsWith(filters.month)) return false;
    if (filters.amountMin !== null && r.amount < filters.amountMin) return false;
    if (filters.amountMax !== null && r.amount > filters.amountMax) return false;
    return true;
  });
}

// ===================== 日曆 =====================
function buildCalendar() {
  const yearEl = document.getElementById('cal-year');
  const monthEl = document.getElementById('cal-month');
  const grid = document.getElementById('calendar-grid');
  if (!yearEl || !grid) return;

  yearEl.textContent = calYear;
  monthEl.textContent = String(calMonth + 1).padStart(2, '0');
  grid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1);
  const lastDay = new Date(calYear, calMonth + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();

  const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const monthRecords = records.filter(r => r.date.startsWith(monthPrefix));

  const dailyStats = {};
  monthRecords.forEach(r => {
    const d = r.date;
    if (!dailyStats[d]) dailyStats[d] = { income: 0, expense: 0, count: 0 };
    if (r.type === '收入') dailyStats[d].income += r.amount;
    else dailyStats[d].expense += r.amount;
    dailyStats[d].count++;
  });

  const expenseValues = Object.values(dailyStats).map(s => s.expense).filter(v => v > 0);
  const maxExpense = Math.max(...expenseValues, 1);

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  const todayStr = formatDate(new Date());

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    const stats = dailyStats[dateStr];
    const dayOfWeek = new Date(calYear, calMonth, d).getDay();

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    cell.dataset.date = dateStr;

    if (dayOfWeek === 0 || dayOfWeek === 6) cell.classList.add('weekend');
    if (dateStr === todayStr) cell.classList.add('today');
    if (dateStr === calSelectedDate) cell.classList.add('selected');

    if (stats) {
      if (stats.income > 0) cell.classList.add('has-income');
      if (stats.expense > 0) cell.classList.add('has-expense');

      if (stats.expense > 0) {
        const ratio = stats.expense / maxExpense;
        let level;
        if (ratio <= 0.15) level = 1;
        else if (ratio <= 0.35) level = 2;
        else if (ratio <= 0.55) level = 3;
        else if (ratio <= 0.8) level = 4;
        else level = 5;
        cell.classList.add('level-' + level);
      }
    }

    let inner = `<div class="cal-date">${d}</div>`;
    if (stats) {
      inner += `<div class="cal-amount expense">-${stats.expense.toFixed(0)}</div>`;
      if (stats.income > 0) {
        inner += `<div class="cal-amount income">+${stats.income.toFixed(0)}</div>`;
      }
      inner += `<div class="cal-count">${stats.count} 筆</div>`;
    }
    cell.innerHTML = inner;

    cell.addEventListener('click', () => {
      calSelectedDate = dateStr;
      buildCalendar();
      showDayDetail(dateStr);
    });

    grid.appendChild(cell);
  }

  const totalCells = startWeekday + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    grid.appendChild(empty);
  }

  const monthIncome = monthRecords.filter(r => r.type === '收入').reduce((s, r) => s + r.amount, 0);
  const monthExpense = monthRecords.filter(r => r.type === '支出').reduce((s, r) => s + r.amount, 0);
  const monthBalance = monthIncome - monthExpense;

  const sumEl = document.getElementById('cal-summary');
  if (sumEl) {
    sumEl.innerHTML = `
      <span class="income">收入：${monthIncome.toFixed(0)} 元</span>
      ｜
      <span class="expense">支出：${monthExpense.toFixed(0)} 元</span>
      ｜
      <span class="balance">結餘：${monthBalance.toFixed(0)} 元</span>
      ｜
      共 ${monthRecords.length} 筆
    `;
  }

  if (calSelectedDate) showDayDetail(calSelectedDate);
  else {
    const card = document.getElementById('cal-day-detail-card');
    if (card) card.style.display = 'none';
  }
}

function showDayDetail(dateStr) {
  const dayRecords = records.filter(r => r.date === dateStr);

  const card = document.getElementById('cal-day-detail-card');
  if (!card) return;
  card.style.display = 'block';

  const [y, m, d] = dateStr.split('-');
  document.getElementById('cal-day-detail-title').textContent =
    `${y} 年 ${parseInt(m)} 月 ${parseInt(d)} 日 的記錄`;

  const tbody = document.querySelector('#cal-day-table tbody');
  tbody.innerHTML = '';

  let income = 0, expense = 0;
  const sorted = [...dayRecords].sort((a, b) => a.time.localeCompare(b.time));

  sorted.forEach(r => {
    const tr = document.createElement('tr');
    tr.className = r.type === '收入' ? 'income' : 'expense';
    tr.innerHTML = `
      <td>${r.type}</td>
      <td>${r.time}</td>
      <td>${r.category}</td>
      <td>${r.item}</td>
      <td>${r.amount.toFixed(0)}</td>
      <td>${r.payment || ''}</td>
      <td>${r.mobile || ''}</td>
    `;
    tbody.appendChild(tr);

    if (r.type === '收入') income += r.amount;
    else expense += r.amount;
  });

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:#999">這天沒有記錄</td></tr>';
  }

  const balance = income - expense;
  const sumEl = document.getElementById('cal-day-summary');
  sumEl.textContent = `收入：${income.toFixed(0)} 元　支出：${expense.toFixed(0)} 元　結餘：${balance.toFixed(0)} 元　（共 ${sorted.length} 筆）`;
  sumEl.className = 'summary ' + (balance >= 0 ? 'positive' : 'negative');
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ===================== 預算 =====================
function getBudgetKey() {
  return `${budgetYear}-${String(budgetMonth + 1).padStart(2, '0')}`;
}

function buildBudgetPage() {
  const yearEl = document.getElementById('budget-year');
  const monthEl = document.getElementById('budget-month');
  if (!yearEl) return;

  yearEl.textContent = budgetYear;
  monthEl.textContent = String(budgetMonth + 1).padStart(2, '0');

  const key = getBudgetKey();
  const thisMonthBudget = budgets[key] || { total: 0, categories: {} };

  const monthRecords = records.filter(r => r.date.startsWith(key) && r.type === '支出');
  const totalSpent = monthRecords.reduce((s, r) => s + r.amount, 0);

  const totalBudget = thisMonthBudget.total || 0;
  document.getElementById('budget-total-input').value = totalBudget || '';
  document.getElementById('budget-total-spent').textContent = totalSpent.toFixed(0);

  const remain = totalBudget - totalSpent;
  const remainEl = document.getElementById('budget-total-remain');
  remainEl.textContent = remain.toFixed(0);
  remainEl.style.color = remain < 0 ? '#C0392B' : '#27AE60';

  const percent = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
  const bar = document.getElementById('budget-total-bar');
  bar.style.width = Math.min(percent, 100) + '%';
  bar.className = 'progress-fill';
  if (percent >= 100) bar.classList.add('danger');
  else if (percent >= 80) bar.classList.add('warn-2');
  else if (percent >= 60) bar.classList.add('warn-1');

  const percentEl = document.getElementById('budget-total-percent');
  percentEl.textContent = `${percent.toFixed(1)}%`;
  percentEl.style.color = percent >= 100 ? '#C0392B' : (percent >= 80 ? '#E67E22' : 'var(--text-secondary)');

  buildCategoryBudgets(thisMonthBudget.categories || {}, monthRecords);
}

function buildCategoryBudgets(catBudgets, monthRecords) {
  const container = document.getElementById('budget-categories-list');
  container.innerHTML = '';

  const catSpent = {};
  monthRecords.forEach(r => {
    catSpent[r.category] = (catSpent[r.category] || 0) + r.amount;
  });

  CATEGORIES.forEach(cat => {
    const budgetVal = catBudgets[cat] || 0;
    const spent = catSpent[cat] || 0;
    const percent = budgetVal > 0 ? (spent / budgetVal) * 100 : 0;
    const isOver = budgetVal > 0 && spent > budgetVal;

    const row = document.createElement('div');
    row.className = 'budget-cat-row' + (isOver ? ' over-budget' : '');

    let barClass = 'budget-cat-bar-fill';
    if (percent >= 100) barClass += ' danger';
    else if (percent >= 80) barClass += ' warn-2';
    else if (percent >= 60) barClass += ' warn-1';

    row.innerHTML = `
      <div class="budget-cat-name">${cat}</div>
      <input type="number" class="budget-cat-input"
             data-category="${cat}"
             placeholder="不限制" min="0" step="1"
             value="${budgetVal || ''}">
      <div class="budget-cat-info">
        已花 <b>${spent.toFixed(0)}</b> 元
        ${budgetVal > 0 ? ` / ${budgetVal} 元（${percent.toFixed(0)}%）` : ''}
      </div>
      <div></div>
      <div class="budget-cat-bar">
        <div class="${barClass}" style="width:${Math.min(percent, 100)}%;"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

async function saveTotalBudget() {
  const val = parseFloat(document.getElementById('budget-total-input').value) || 0;
  const key = getBudgetKey();

  if (!budgets[key]) budgets[key] = { total: 0, categories: {} };
  budgets[key].total = val;

  await window.api.setBudgets(budgets);
  buildBudgetPage();
  await customAlert(`已儲存 ${key} 的總預算：${val} 元`);
}

async function saveAllBudgets() {
  const key = getBudgetKey();
  if (!budgets[key]) budgets[key] = { total: 0, categories: {} };

  const inputs = document.querySelectorAll('.budget-cat-input');
  const newCats = {};
  inputs.forEach(input => {
    const cat = input.dataset.category;
    const val = parseFloat(input.value) || 0;
    if (val > 0) newCats[cat] = val;
  });

  budgets[key].categories = newCats;
  await window.api.setBudgets(budgets);
  buildBudgetPage();
  await customAlert(`已儲存 ${key} 的分類預算`);
}

// ===================== 年度報告 =====================
function buildReportPage() {
  const yearSel = document.getElementById('report-year');
  if (!yearSel) return;

  if (yearSel.options.length === 0) {
    const now = new Date().getFullYear();
    for (let y = now; y >= now - 5; y--) {
      yearSel.add(new Option(y + ' 年', y));
    }
    yearSel.value = now;
  }

  const selectedYear = parseInt(yearSel.value, 10);
  const lastYear = selectedYear - 1;

  document.getElementById('report-year-label-1').textContent = selectedYear + ' 年';
  document.getElementById('report-year-label-2').textContent = lastYear + ' 年';

  const thisYearRecords = records.filter(r => r.date.startsWith(String(selectedYear)));
  const lastYearRecords = records.filter(r => r.date.startsWith(String(lastYear)));

  const thisIncome = thisYearRecords.filter(r => r.type === '收入').reduce((s, r) => s + r.amount, 0);
  const thisExpense = thisYearRecords.filter(r => r.type === '支出').reduce((s, r) => s + r.amount, 0);
  const thisBalance = thisIncome - thisExpense;

  const lastIncome = lastYearRecords.filter(r => r.type === '收入').reduce((s, r) => s + r.amount, 0);
  const lastExpense = lastYearRecords.filter(r => r.type === '支出').reduce((s, r) => s + r.amount, 0);
  const lastBalance = lastIncome - lastExpense;

  document.getElementById('r-income-1').textContent = thisIncome.toFixed(0);
  document.getElementById('r-income-2').textContent = lastIncome.toFixed(0);
  document.getElementById('r-income-diff').innerHTML = formatDiff(thisIncome, lastIncome);

  document.getElementById('r-expense-1').textContent = thisExpense.toFixed(0);
  document.getElementById('r-expense-2').textContent = lastExpense.toFixed(0);
  document.getElementById('r-expense-diff').innerHTML = formatDiff(thisExpense, lastExpense);

  document.getElementById('r-balance-1').textContent = thisBalance.toFixed(0);
  document.getElementById('r-balance-2').textContent = lastBalance.toFixed(0);
  document.getElementById('r-balance-diff').innerHTML = formatDiff(thisBalance, lastBalance);

  document.getElementById('r-count-1').textContent = thisYearRecords.length;
  document.getElementById('r-count-2').textContent = lastYearRecords.length;
  document.getElementById('r-count-diff').innerHTML = formatDiff(thisYearRecords.length, lastYearRecords.length);

  buildMonthlyChart(selectedYear, thisYearRecords);

  const expenses = thisYearRecords.filter(r => r.type === '支出');
  fillStatsTable('year-cat-stats', expenses, r => r.category, 5);
  fillStatsTable('year-pay-stats', expenses, r => r.payment || '未指定');

  buildTopMonthInfo(expenses);
}

function formatDiff(current, previous) {
  if (previous === 0 && current === 0) return '<span class="diff-flat">—</span>';
  if (previous === 0) return '<span class="diff-up">新增</span>';

  const diff = current - previous;
  const percent = (diff / previous) * 100;

  if (Math.abs(percent) < 0.5) return '<span class="diff-flat">持平</span>';

  const sign = diff > 0 ? '+' : '';
  const cls = diff > 0 ? 'diff-up' : 'diff-down';
  return `<span class="${cls}">${sign}${diff.toFixed(0)}（${sign}${percent.toFixed(1)}%）</span>`;
}

function buildMonthlyChart(year, yearRecords) {
  const container = document.getElementById('monthly-chart');
  container.innerHTML = '';

  const monthly = [];
  for (let m = 0; m < 12; m++) {
    monthly.push({ income: 0, expense: 0 });
  }

  yearRecords.forEach(r => {
    const month = parseInt(r.date.slice(5, 7), 10) - 1;
    if (month >= 0 && month < 12) {
      if (r.type === '收入') monthly[month].income += r.amount;
      else monthly[month].expense += r.amount;
    }
  });

  let maxVal = 1;
  monthly.forEach(m => {
    maxVal = Math.max(maxVal, m.income, m.expense);
  });

  for (let m = 0; m < 12; m++) {
    const data = monthly[m];
    const incomeHeight = (data.income / maxVal) * 100;
    const expenseHeight = (data.expense / maxVal) * 100;

    const col = document.createElement('div');
    col.className = 'month-col';

    col.innerHTML = `
      <div class="month-bars">
        <div class="month-bar income" style="height:${incomeHeight}%;" title="收入 ${data.income.toFixed(0)} 元"></div>
        <div class="month-bar expense" style="height:${expenseHeight}%;" title="支出 ${data.expense.toFixed(0)} 元"></div>
      </div>
      <div class="month-label">${m + 1}月</div>
    `;
    container.appendChild(col);
  }
}

function buildTopMonthInfo(expenses) {
  const container = document.getElementById('top-month-info');

  if (expenses.length === 0) {
    container.textContent = '無資料';
    return;
  }

  const monthly = {};
  expenses.forEach(r => {
    const m = r.date.slice(0, 7);
    monthly[m] = (monthly[m] || 0) + r.amount;
  });

  const sorted = Object.entries(monthly).sort((a, b) => b[1] - a[1]);
  const [topMonth, topAmount] = sorted[0];
  const count = expenses.filter(r => r.date.startsWith(topMonth)).length;
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  const avg = totalExpense / 12;

  const [y, m] = topMonth.split('-');

  container.innerHTML = `
    <div>花最多的月份是</div>
    <div class="highlight">${y} 年 ${parseInt(m)} 月</div>
    <div>總共花了 <b>${topAmount.toFixed(0)}</b> 元（${count} 筆）</div>
    <div style="font-size:13px;color:var(--text-muted);margin-top:8px;">
      月平均：${avg.toFixed(0)} 元
    </div>
  `;
}

// ===================== 提醒設定 =====================
async function onReminderSettingsChange() {
  const enabled = document.getElementById('reminder-enabled').checked;
  const interval = parseInt(document.getElementById('reminder-interval').value, 10);
  const idleThreshold = parseInt(document.getElementById('idle-threshold').value, 10);

  await window.api.setReminderSettings({ enabled, interval, idleThreshold });
  updateReminderRowsVisibility(enabled);
}

async function onTestReminder() {
  const r = await window.api.testReminder();
  if (!r.ok) await customAlert(r.error || '測試失敗');
}

// ===================== 開機啟動 =====================
async function onAutoStartToggle(e) {
  const requested = e.target.checked;
  try {
    const actual = await window.api.setAutoStart(requested);
    e.target.checked = actual;

    if (actual === requested) {
      if (requested) {
        await customAlert('已設定開機自動啟動！\n\n開機後程式會在系統匣（右下角）背景執行，不會跳出視窗。');
      } else {
        await customAlert('已取消開機自動啟動。');
      }
    } else {
      await customAlert('設定失敗！可能原因：\n\n' +
            '1. 開啟程式時沒有按「是」（管理員權限）\n' +
            '2. 防毒軟體攔截登錄檔寫入\n' +
            '3. 公司/學校電腦有群組原則限制');
    }
  } catch (err) {
    console.error(err);
    e.target.checked = !requested;
    await customAlert('設定失敗：' + err.message);
  }
}

// ===================== 更換資料夾 =====================
async function onChangeDir() {
  const result = await window.api.changeDataDir();
  if (result.ok) {
    document.getElementById('data-dir-display').textContent = result.dataDir;
    await customAlert('已更換資料夾到：\n' + result.dataDir + '\n\n程式將重新載入設定。');
    budgets = await window.api.getBudgets() || {};
    buildBudgetPage();
    await loadSettings();
  }
}

// ---------- 收支 / 付款切換 ----------
function onTypeChange(e) {
  const type = e.target.value;
  buildCategorySelects(type);

  const payLabel = document.getElementById('payment-label');
  const paySel = document.getElementById('payment');
  const mobLabel = document.getElementById('mobile-label');
  const mobSel = document.getElementById('mobile');

  if (type === '收入') {
    payLabel.classList.add('hidden');
    paySel.classList.add('hidden');
    mobLabel.classList.add('hidden');
    mobSel.classList.add('hidden');
  } else {
    payLabel.classList.remove('hidden');
    paySel.classList.remove('hidden');
    onPaymentChange();
  }
}

function onPaymentChange() {
  const pay = document.getElementById('payment').value;
  const mobLabel = document.getElementById('mobile-label');
  const mobSel = document.getElementById('mobile');
  if (pay === '行動支付') {
    mobLabel.classList.remove('hidden');
    mobSel.classList.remove('hidden');
  } else {
    mobLabel.classList.add('hidden');
    mobSel.classList.add('hidden');
  }
}

// ===================== 新增 / 刪除 =====================
async function addRecord() {
  const type = document.querySelector('input[name="type"]:checked').value;
  const item = document.getElementById('item').value.trim();
  const amountStr = document.getElementById('amount').value.trim();

  if (!item) return customAlert('請輸入項目內容');

  const amount = parseFloat(amountStr);
  if (isNaN(amount) || amount <= 0) return customAlert('請輸入正確的金額（正數字）');

  const date = `${document.getElementById('year').value}-${document.getElementById('month').value}-${document.getElementById('day').value}`;
  const time = `${document.getElementById('hour').value}:${document.getElementById('minute').value}`;
  const category = document.getElementById('category').value;

  let payment = '', mobile = '';
  if (type === '支出') {
    payment = document.getElementById('payment').value;
    if (payment === '行動支付') mobile = document.getElementById('mobile').value;
  }

  records.push({ type, date, time, category, item, amount, payment, mobile });
  scheduleSave();

  refreshTable();
  refreshStats();
  buildCalendar();
  buildBudgetPage();
  buildReportPage();

  document.getElementById('item').value = '';
  document.getElementById('amount').value = '';
  document.getElementById('item').focus();
}

async function deleteSelected() {
  if (selectedRows.size === 0) return customAlert('請先選取要刪除的記錄');
  const ok = await customConfirm('確定要刪除選取的記錄嗎？');
  if (!ok) return;

  const filtered = applyFilters(records);
  const sorted = [...filtered].sort((a, b) => {
    const ka = a.date + a.time;
    const kb = b.date + b.time;
    return kb.localeCompare(ka);
  });

  const toDelete = new Set();
  selectedRows.forEach(displayIdx => {
    const rec = sorted[displayIdx];
    if (!rec) return;
    const origIdx = records.indexOf(rec);
    if (origIdx >= 0) toDelete.add(origIdx);
  });

  records = records.filter((_, i) => !toDelete.has(i));
  selectedRows.clear();
  scheduleSave();
  refreshTable();
  refreshStats();
  buildCalendar();
  buildBudgetPage();
  buildReportPage();
}

async function clearAll() {
  if (records.length === 0) return;
  const ok = await customConfirm('確定要清除所有記錄嗎？此動作無法復原！');
  if (!ok) return;
  records = [];
  selectedRows.clear();
  scheduleSave();
  refreshTable();
  refreshStats();
  buildCalendar();
  buildBudgetPage();
  buildReportPage();
}

// ===================== 明細表 =====================
function refreshTable() {
  const tbody = document.querySelector('#records-table tbody');
  tbody.innerHTML = '';

  buildFilterMonths();

  const filtered = applyFilters(records);
  const sorted = [...filtered].sort((a, b) => {
    const ka = a.date + a.time;
    const kb = b.date + b.time;
    return kb.localeCompare(ka);
  });

  let income = 0, expense = 0;

  sorted.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.className = r.type === '收入' ? 'income' : 'expense';
    tr.innerHTML = `
      <td>${r.type}</td>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.category}</td>
      <td>${r.item}</td>
      <td>${r.amount.toFixed(0)}</td>
      <td>${r.payment || ''}</td>
      <td>${r.mobile || ''}</td>
      <td>
        <button class="edit-btn" data-edit-idx="${idx}">✏️ 編輯</button>
      </td>
    `;

    // 點整列 → 選取 / 取消選取（編輯按鈕除外）
    tr.addEventListener('click', (e) => {
      if (e.target.classList.contains('edit-btn')) return;
      if (selectedRows.has(idx)) {
        selectedRows.delete(idx);
        tr.classList.remove('selected');
      } else {
        selectedRows.add(idx);
        tr.classList.add('selected');
      }
    });

    tbody.appendChild(tr);

    if (r.type === '收入') income += r.amount;
    else expense += r.amount;
  });

  // 綁定編輯按鈕
  tbody.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const displayIdx = parseInt(btn.dataset.editIdx, 10);
      openEditModal(sorted[displayIdx]);
    });
  });

  document.getElementById('filter-result').textContent =
    `顯示 ${filtered.length} / ${records.length} 筆`;

  const balance = income - expense;
  const sumEl = document.getElementById('summary');
  sumEl.textContent = `收入：${income.toFixed(0)} 元　支出：${expense.toFixed(0)} 元　結餘：${balance.toFixed(0)} 元　（顯示 ${filtered.length} 筆）`;
  sumEl.className = 'summary ' + (balance >= 0 ? 'positive' : 'negative');
}

// ===================== 匯出 CSV =====================
async function exportCSV() {
  if (records.length === 0) return customAlert('沒有資料可匯出');

  const header = ['類型', '日期', '時間', '類別', '項目內容', '金額', '付款方式', '行動支付'];
  const rows = [...records]
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(r => [r.type, r.date, r.time, r.category, r.item, r.amount, r.payment || '', r.mobile || '']);

  const csv = [header, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  const result = await window.api.exportCSV(csv);
  if (result.ok) await customAlert('已匯出到：\n' + result.path);
  else if (result.error) await customAlert('匯出失敗：' + result.error);
}

// ===================== 統計 =====================
function refreshStats() {
  const monthSel = document.getElementById('stats-month');
  const months = [...new Set(records.map(r => r.date.slice(0, 7)))].sort().reverse();
  const current = monthSel.value;
  monthSel.innerHTML = '';
  monthSel.add(new Option('全部', '全部'));
  months.forEach(m => monthSel.add(new Option(m, m)));
  monthSel.value = months.includes(current) ? current : '全部';

  const selected = monthSel.value;
  const data = selected === '全部' ? records : records.filter(r => r.date.startsWith(selected));
  const title = selected === '全部' ? '全部期間' : selected;

  const income = data.filter(r => r.type === '收入').reduce((s, r) => s + r.amount, 0);
  const expense = data.filter(r => r.type === '支出').reduce((s, r) => s + r.amount, 0);
  const balance = income - expense;

  document.getElementById('stats-summary').textContent =
    `【${title}】 收入：${income.toFixed(0)} 元 | 支出：${expense.toFixed(0)} 元 | 結餘：${balance.toFixed(0)} 元 | 筆數：${data.length}`;

  const expenses = data.filter(r => r.type === '支出');

  fillStatsTable('cat-stats', expenses, r => r.category);
  fillStatsTable('pay-stats', expenses, r => r.payment || '未指定');
  fillStatsTable('mob-stats',
    expenses.filter(r => r.payment === '行動支付' && r.mobile),
    r => r.mobile);
}

function fillStatsTable(tableId, list, keyFn, limit) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = '';

  const map = {};
  list.forEach(r => {
    const k = keyFn(r);
    map[k] = (map[k] || 0) + r.amount;
  });

  const total = Object.values(map).reduce((s, v) => s + v, 0) || 1;
  let sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);

  if (limit && sorted.length > limit) {
    sorted = sorted.slice(0, limit);
  }

  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="color:#999">無資料</td></tr>';
    return;
  }

  sorted.forEach(([k, v]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k}</td><td>${v.toFixed(0)}</td><td>${(v / total * 100).toFixed(1)}%</td>`;
    tbody.appendChild(tr);
  });
}

// ===================== 啟動 =====================
init();