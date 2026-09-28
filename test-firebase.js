const fb = require('./firebase-service');

(async () => {
  console.log('測試 Firebase 連線...');

  // 測試註冊
  const testEmail = `test${Date.now()}@example.com`;
  const testPass = 'test123456';

  console.log('嘗試註冊:', testEmail);
  const reg = await fb.registerUser(testEmail, testPass);

  if (reg.ok) {
    console.log('✅ 註冊成功！UID:', reg.user.uid);

    // 測試寫入
    await fb.saveProfile(reg.user.uid, { username: '測試帳號' });
    console.log('✅ Profile 寫入成功');

    // 測試讀取
    const profile = await fb.getProfile(reg.user.uid);
    console.log('✅ Profile 讀取成功:', profile.data);

    // 登出
    await fb.logoutUser();
    console.log('✅ 登出成功');
  } else {
    console.log('❌ 註冊失敗:', reg.error);
  }

  process.exit(0);
})();