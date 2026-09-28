let isLoginMode = true;

const subtitle = document.getElementById('subtitle');
const usernameField = document.getElementById('username-field');
const usernameInput = document.getElementById('username');
const usernameHint = document.getElementById('username-hint');
const emailField = document.getElementById('email-field');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmInput = document.getElementById('confirm');
const confirmField = document.getElementById('confirm-field');
const rememberRow = document.getElementById('remember-row');
const rememberCheckbox = document.getElementById('remember-me');
const forgotRow = document.getElementById('forgot-row');
const forgotLink = document.getElementById('forgot-password-link');
const submitBtn = document.getElementById('submit-btn');
const switchText = document.getElementById('switch-text');
const switchLink = document.getElementById('switch-link');
const errorMsg = document.getElementById('error-msg');

function setMode(loginMode) {
  isLoginMode = loginMode;
  errorMsg.textContent = '';
  usernameInput.value = '';
  emailInput.value = '';
  passwordInput.value = '';
  confirmInput.value = '';

  if (loginMode) {
    subtitle.textContent = '請登入您的帳號';
    usernameField.style.display = 'block';
    usernameHint.textContent = '';
    emailField.style.display = 'none';
    confirmField.style.display = 'none';
    rememberRow.style.display = 'flex';
    forgotRow.style.display = 'block';
    submitBtn.textContent = '登入';
    switchText.textContent = '還沒有帳號？';
    switchLink.textContent = '註冊新帳號';
  } else {
    subtitle.textContent = '建立一個新帳號';
    usernameField.style.display = 'block';
    usernameHint.textContent = '2~20 個字元，可包含中英文、數字、_ 和 -';
    emailField.style.display = 'block';
    confirmField.style.display = 'block';
    rememberRow.style.display = 'none';
    forgotRow.style.display = 'none';
    submitBtn.textContent = '註冊';
    switchText.textContent = '已經有帳號？';
    switchLink.textContent = '返回登入';
  }
  usernameInput.focus();
}

switchLink.addEventListener('click', () => setMode(!isLoginMode));

// 忘記密碼
if (forgotLink) {
  forgotLink.addEventListener('click', async () => {
    const email = await customPrompt(
      '請輸入您的 Email（會寄送重設密碼信）：\n請確認與註冊時相同',
      { title: '忘記密碼', placeholder: 'you@example.com', type: 'email' }
    );

    if (!email) return;

    if (!email.includes('@')) {
      await customAlert('Email 格式不正確');
      return;
    }

    const result = await window.api.sendResetEmail(email);

    if (result.ok) {
      await customAlert('已寄送重設密碼信！\n\n請去收信，點信中連結設定新密碼。\n\n若沒收到：\n1. 檢查垃圾郵件\n2. 確認 Email 是否正確');
    } else {
      await customAlert('寄送失敗：' + (result.error || '未知錯誤'));
    }
  });
}

async function submit() {
  const username = usernameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!username) return showError('請輸入使用者名稱');
  if (username.length < 2) return showError('使用者名稱至少 2 個字元');

  if (!isLoginMode) {
    if (!/^[a-zA-Z0-9\u4e00-\u9fa5_-]+$/.test(username)) {
      return showError('使用者名稱只能包含中英數字、_ 和 -');
    }
    if (!email) return showError('請輸入電子郵件');
    if (!email.includes('@')) return showError('電子郵件格式不正確');
  }

  if (!password) return showError('請輸入密碼');
  if (password.length < 6) return showError('密碼至少 6 個字元');

  submitBtn.disabled = true;
  submitBtn.textContent = isLoginMode ? '登入中…' : '註冊中…';
  errorMsg.textContent = '';

  try {
    if (isLoginMode) {
      const remember = rememberCheckbox.checked;
      const result = await window.api.login(username, password, remember);
      if (result.ok) {
        window.api.goToMain();
      } else {
        showError(result.error || '登入失敗');
        submitBtn.disabled = false;
        submitBtn.textContent = '登入';
      }
    } else {
      const confirm = confirmInput.value;
      if (password !== confirm) {
        showError('兩次密碼不一致');
        submitBtn.disabled = false;
        submitBtn.textContent = '註冊';
        return;
      }

      const result = await window.api.register(username, email, password);
      if (result.ok) {
        window.api.goToMain();
      } else {
        showError(result.error || '註冊失敗');
        submitBtn.disabled = false;
        submitBtn.textContent = '註冊';
      }
    }
  } catch (err) {
    console.error(err);
    showError('發生錯誤：' + err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = isLoginMode ? '登入' : '註冊';
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
}

submitBtn.addEventListener('click', submit);

[usernameInput, emailInput, passwordInput, confirmInput].forEach(el => {
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') submit();
  });
});

window.addEventListener('DOMContentLoaded', () => usernameInput.focus());