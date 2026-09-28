// =========================================================
// 自訂對話框工具（取代 prompt / alert / confirm）
// =========================================================

function createModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      ${html}
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Custom Alert
function customAlert(message, title = '提示') {
  return new Promise((resolve) => {
    const overlay = createModal(`
      <div class="modal-header">${title}</div>
      <div class="modal-body">${message.replace(/\n/g, '<br>')}</div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-primary" id="modal-ok">確定</button>
      </div>
    `);

    const okBtn = overlay.querySelector('#modal-ok');
    okBtn.addEventListener('click', () => {
      overlay.remove();
      resolve();
    });

    setTimeout(() => okBtn.focus(), 50);
  });
}

// Custom Confirm
function customConfirm(message, title = '確認') {
  return new Promise((resolve) => {
    const overlay = createModal(`
      <div class="modal-header">${title}</div>
      <div class="modal-body">${message.replace(/\n/g, '<br>')}</div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-secondary" id="modal-cancel">取消</button>
        <button class="modal-btn modal-btn-primary" id="modal-ok">確定</button>
      </div>
    `);

    overlay.querySelector('#modal-ok').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
  });
}

// Custom Prompt
function customPrompt(message, options = {}) {
  const {
    title = '輸入',
    placeholder = '',
    defaultValue = '',
    type = 'text',
    okText = '確定',
    cancelText = '取消'
  } = options;

  return new Promise((resolve) => {
    const overlay = createModal(`
      <div class="modal-header">${title}</div>
      <div class="modal-body">
        <div style="margin-bottom:10px;color:#526180;">${message.replace(/\n/g, '<br>')}</div>
        <input type="${type}" id="modal-input" placeholder="${placeholder}" value="${defaultValue}"
               style="width:100%;padding:10px 12px;border:2px solid #d3dbe8;border-radius:8px;font-size:14px;outline:none;">
        <div id="modal-error" style="color:#e74c3c;font-size:12.5px;margin-top:6px;min-height:16px;"></div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-secondary" id="modal-cancel">${cancelText}</button>
        <button class="modal-btn modal-btn-primary" id="modal-ok">${okText}</button>
      </div>
    `);

    const input = overlay.querySelector('#modal-input');
    const errorEl = overlay.querySelector('#modal-error');

    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector('#modal-ok').addEventListener('click', () => {
      const val = input.value.trim();
      if (!val) {
        errorEl.textContent = '請輸入內容';
        return;
      }
      close(val);
    });

    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      close(null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#modal-ok').click();
      } else if (e.key === 'Escape') {
        close(null);
      }
    });
  });
}

// Custom Form
function customForm(title, fields, options = {}) {
  const { okText = '確定', cancelText = '取消' } = options;

  return new Promise((resolve) => {
    const fieldsHtml = fields.map(f => `
      <div style="margin-bottom:12px;">
        <label style="display:block;font-size:13px;color:#1B2A4E;font-weight:600;margin-bottom:5px;">${f.label}</label>
        <input type="${f.type || 'text'}" id="modal-field-${f.id}"
               placeholder="${f.placeholder || ''}"
               value="${f.defaultValue || ''}"
               style="width:100%;padding:10px 12px;border:2px solid #d3dbe8;border-radius:8px;font-size:14px;outline:none;">
      </div>
    `).join('');

    const overlay = createModal(`
      <div class="modal-header">${title}</div>
      <div class="modal-body">
        ${fieldsHtml}
        <div id="modal-error" style="color:#e74c3c;font-size:12.5px;margin-top:6px;min-height:16px;"></div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn modal-btn-secondary" id="modal-cancel">${cancelText}</button>
        <button class="modal-btn modal-btn-primary" id="modal-ok">${okText}</button>
      </div>
    `);

    const errorEl = overlay.querySelector('#modal-error');

    setTimeout(() => {
      const firstInput = overlay.querySelector(`#modal-field-${fields[0].id}`);
      if (firstInput) firstInput.focus();
    }, 50);

    const close = (value) => {
      overlay.remove();
      resolve(value);
    };

    overlay.querySelector('#modal-ok').addEventListener('click', () => {
      const values = {};
      for (const f of fields) {
        const el = overlay.querySelector(`#modal-field-${f.id}`);
        values[f.id] = el.value.trim();
        if (!values[f.id]) {
          errorEl.textContent = `請輸入${f.label}`;
          el.focus();
          return;
        }
      }
      close(values);
    });

    overlay.querySelector('#modal-cancel').addEventListener('click', () => {
      close(null);
    });

    fields.forEach((f, idx) => {
      const el = overlay.querySelector(`#modal-field-${f.id}`);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (idx === fields.length - 1) {
            overlay.querySelector('#modal-ok').click();
          } else {
            const nextEl = overlay.querySelector(`#modal-field-${fields[idx + 1].id}`);
            if (nextEl) nextEl.focus();
          }
        } else if (e.key === 'Escape') {
          close(null);
        }
      });
    });
  });
}

window.customAlert = customAlert;
window.customConfirm = customConfirm;
window.customPrompt = customPrompt;
window.customForm = customForm;