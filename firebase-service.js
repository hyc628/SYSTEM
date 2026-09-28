// =========================================================
// Firebase 服務封裝
// =========================================================

const { initializeApp } = require('firebase/app');
const {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  sendPasswordResetEmail,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  EmailAuthProvider,
  reauthenticateWithCredential
} = require('firebase/auth');
const {
  getDatabase,
  ref,
  set,
  get,
  remove,
  onValue,
  off
} = require('firebase/database');

const firebaseConfig = require('./firebase-config');

// =========================================================
// 離線快取
// =========================================================
const CACHE_PATH = require('path').join(
  require('electron').app.getPath('userData'),
  'fb-cache.json'
);

let cacheData = {};
try {
  if (require('fs').existsSync(CACHE_PATH)) {
    cacheData = JSON.parse(require('fs').readFileSync(CACHE_PATH, 'utf-8'));
  }
} catch (e) { console.error('讀取快取失敗', e); }

function saveCache() {
  try {
    require('fs').writeFileSync(CACHE_PATH, JSON.stringify(cacheData), 'utf-8');
  } catch (e) { console.error('寫入快取失敗', e); }
}

global.localStorage = {
  getItem: (key) => cacheData[key] !== undefined ? cacheData[key] : null,
  setItem: (key, value) => {
    cacheData[key] = String(value);
    saveCache();
  },
  removeItem: (key) => {
    delete cacheData[key];
    saveCache();
  },
  clear: () => {
    cacheData = {};
    saveCache();
  }
};

// =========================================================
// 初始化
// =========================================================
let app = null;
let auth = null;
let db = null;

function initFirebase() {
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);

  setPersistence(auth, browserLocalPersistence).catch(e => {
    console.error('設定 Auth 持久化失敗:', e);
  });
}

initFirebase();

// =========================================================
// Authentication
// =========================================================

async function registerUser(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { ok: true, user: userCredential.user };
  } catch (e) {
    return { ok: false, error: parseAuthError(e) };
  }
}

async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, user: userCredential.user };
  } catch (e) {
    return { ok: false, error: parseAuthError(e) };
  }
}

async function logoutUser() {
  try {
    await signOut(auth);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function getCurrentUser() {
  return auth.currentUser;
}

function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

function parseAuthError(e) {
  const code = e.code || '';
  const map = {
    'auth/email-already-in-use': '此 Email 已被註冊',
    'auth/invalid-email': 'Email 格式不正確',
    'auth/weak-password': '密碼太弱（至少 6 個字元）',
    'auth/user-not-found': '此帳號不存在',
    'auth/wrong-password': '密碼錯誤',
    'auth/invalid-credential': '帳號或密碼錯誤',
    'auth/too-many-requests': '嘗試太多次，請稍後再試',
    'auth/network-request-failed': '網路連線失敗，請檢查網路',
    'auth/requires-recent-login': '請重新登入後再變更',
    'auth/missing-password': '請輸入密碼'
  };
  return map[code] || e.message || '發生錯誤';
}

// =========================================================
// Realtime Database
// =========================================================

function userRef(uid, path = '') {
  const base = `users/${uid}`;
  return ref(db, path ? `${base}/${path}` : base);
}

async function saveProfile(uid, profile) {
  try {
    await set(userRef(uid, 'profile'), profile);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getProfile(uid) {
  try {
    const snapshot = await get(userRef(uid, 'profile'));
    return { ok: true, data: snapshot.exists() ? snapshot.val() : null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function saveRecords(uid, records) {
  try {
    await set(userRef(uid, 'records'), records);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getRecords(uid) {
  try {
    const snapshot = await get(userRef(uid, 'records'));
    if (!snapshot.exists()) return { ok: true, data: [] };
    const data = snapshot.val();
    if (Array.isArray(data)) return { ok: true, data };
    return { ok: true, data: Object.values(data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function watchRecords(uid, callback) {
  const r = userRef(uid, 'records');
  const listener = (snapshot) => {
    if (!snapshot.exists()) {
      callback([]);
      return;
    }
    const data = snapshot.val();
    if (Array.isArray(data)) {
      callback(data);
    } else {
      callback(Object.values(data));
    }
  };
  onValue(r, listener, (error) => {
    console.error('[watchRecords] 錯誤:', error);
  });
  return () => off(r, 'value', listener);
}

// =========================================================
// 使用者名稱對照表
// =========================================================

async function isUsernameTaken(username) {
  try {
    const snapshot = await get(ref(db, `usernameMap/${username}`));
    return { ok: true, taken: snapshot.exists() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function bindUsername(username, uid) {
  try {
    await set(ref(db, `usernameMap/${username}`), uid);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getUidByUsername(username) {
  try {
    const snapshot = await get(ref(db, `usernameMap/${username}`));
    if (!snapshot.exists()) return { ok: true, uid: null };
    return { ok: true, uid: snapshot.val() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function emailKey(email) {
  return email.replace(/[.#$\[\]/]/g, '_');
}

async function bindEmail(email, uid) {
  try {
    await set(ref(db, `emailMap/${emailKey(email)}`), uid);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// =========================================================
// 密碼管理
// =========================================================

async function sendResetPasswordEmail(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: parseAuthError(e) };
  }
}

async function changePassword(email, oldPassword, newPassword) {
  try {
    const user = auth.currentUser;
    if (!user) return { ok: false, error: '未登入' };

    const credential = EmailAuthProvider.credential(email, oldPassword);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: parseAuthError(e) };
  }
}

// =========================================================
// 使用者資料管理
// =========================================================

async function changeUsername(oldUsername, newUsername, uid) {
  try {
    const checkResult = await isUsernameTaken(newUsername);
    if (!checkResult.ok) return { ok: false, error: '檢查失敗：' + checkResult.error };
    if (checkResult.taken) return { ok: false, error: '此使用者名稱已被使用' };

    await set(ref(db, `usernameMap/${newUsername}`), uid);

    try {
      await remove(ref(db, `usernameMap/${oldUsername}`));
    } catch (e) {
      console.log('刪除舊 usernameMap 失敗', e);
    }

    await set(userRef(uid, 'profile/username'), newUsername);

    const user = auth.currentUser;
    if (user) {
      await updateProfile(user, { displayName: newUsername });
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function changeEmail(newEmail, currentPassword, currentEmail) {
  try {
    const user = auth.currentUser;
    if (!user) return { ok: false, error: '未登入' };

    const credential = EmailAuthProvider.credential(currentEmail, currentPassword);
    await reauthenticateWithCredential(user, credential);

    await verifyBeforeUpdateEmail(user, newEmail);

    const uid = user.uid;
    await set(ref(db, `emailMap/${emailKey(newEmail)}`), uid);

    return { ok: true, newEmail };
  } catch (e) {
    return { ok: false, error: parseAuthError(e) };
  }
}

// =========================================================
// 匯出
// =========================================================
module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  onAuthChange,

  saveProfile,
  getProfile,
  saveRecords,
  getRecords,
  watchRecords,

  isUsernameTaken,
  bindUsername,
  getUidByUsername,
  bindEmail,

  sendResetPasswordEmail,
  changePassword,
  changeUsername,
  changeEmail
};