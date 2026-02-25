/**
 * 報酬設定管理ページ
 */

// 現在の設定データ
let currentSettings = null;
let settingsHistory = [];

/**
 * ページ初期化
 */
async function initCommissionSettings() {
  // 管理者権限チェック
  const user = JSON.parse(localStorage.getItem('agency_system_user') || '{}');
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    showErrorMessage('報酬設定を管理する権限がありません');
    navigateTo('dashboard');
    return;
  }

  await Promise.all([
    loadCurrentSettings(),
    loadSettingsHistory(),
    loadNextPaymentDate()
  ]);

  setupEventListeners();
}

/**
 * 現在の設定を読み込み
 */
async function loadCurrentSettings() {
  try {
    showLoading();
    const response = await commissionSettingsAPI.getCurrent();

    if (response.success) {
      currentSettings = response.data;
      displayCurrentSettings(currentSettings);
      populateEditForm(currentSettings);
    } else {
      showErrorMessage('設定の取得に失敗しました');
    }
  } catch (error) {
    console.error('Load current settings error:', error);
    showErrorMessage('設定の取得中にエラーが発生しました');
  } finally {
    hideLoading();
  }
}

/**
 * 設定履歴を読み込み
 */
async function loadSettingsHistory() {
  try {
    const response = await commissionSettingsAPI.getHistory();

    if (response.success) {
      settingsHistory = response.data || [];
      displaySettingsHistory(settingsHistory);
    }
  } catch (error) {
    console.error('Load settings history error:', error);
  }
}

/**
 * 次回支払い予定日を読み込み
 */
async function loadNextPaymentDate() {
  try {
    const response = await commissionSettingsAPI.getNextPaymentDate();

    if (response.success) {
      displayNextPaymentDate(response.data);
    }
  } catch (error) {
    console.error('Load next payment date error:', error);
  }
}

/**
 * 現在の設定を表示
 */
function displayCurrentSettings(settings) {
  const container = document.getElementById('current-settings-display');
  if (!container) return;

  container.innerHTML = `
    <div class="settings-grid">
      <div class="setting-item">
        <div class="setting-label">最低支払額</div>
        <div class="setting-value">¥${parseInt(settings.minimum_payment_amount || 10000).toLocaleString()}</div>
      </div>

      <div class="setting-item">
        <div class="setting-label">支払いサイクル</div>
        <div class="setting-value">${getPaymentCycleLabel(settings.payment_cycle)}</div>
      </div>

      <div class="setting-item">
        <div class="setting-label">支払い日</div>
        <div class="setting-value">毎月${settings.payment_day || 25}日</div>
      </div>

      <div class="setting-item">
        <div class="setting-label">締め日</div>
        <div class="setting-value">毎月${settings.closing_day || 31}日</div>
      </div>
    </div>

    <div class="settings-grid mt-3">
      <div class="setting-item">
        <div class="setting-label">Tier1 → Tier2ボーナス</div>
        <div class="setting-value">${parseFloat(settings.tier1_from_tier2_bonus || 2.00).toFixed(2)}%</div>
      </div>

      <div class="setting-item">
        <div class="setting-label">Tier2 → Tier3ボーナス</div>
        <div class="setting-value">${parseFloat(settings.tier2_from_tier3_bonus || 1.50).toFixed(2)}%</div>
      </div>

      <div class="setting-item">
        <div class="setting-label">Tier3 → Tier4ボーナス</div>
        <div class="setting-value">${parseFloat(settings.tier3_from_tier4_bonus || 1.00).toFixed(2)}%</div>
      </div>
    </div>

    <div class="settings-grid mt-3">
      <div class="setting-item">
        <div class="setting-label">源泉徴収率（個人）</div>
        <div class="setting-value">${parseFloat(settings.withholding_tax_rate || 10.21).toFixed(2)}%</div>
      </div>

      <div class="setting-item">
        <div class="setting-label">インボイス控除率</div>
        <div class="setting-value">${parseFloat(settings.non_invoice_deduction_rate || 2.00).toFixed(2)}%</div>
      </div>
    </div>

    ${settings.valid_from ? `
      <div class="mt-3">
        <small class="text-muted">適用開始日: ${formatDate(settings.valid_from)}</small>
      </div>
    ` : ''}
  `;
}

/**
 * 編集フォームに値を設定
 */
function populateEditForm(settings) {
  document.getElementById('edit-minimum-payment').value = settings.minimum_payment_amount || 10000;
  document.getElementById('edit-payment-cycle').value = settings.payment_cycle || 'monthly';
  document.getElementById('edit-payment-day').value = settings.payment_day || 25;
  document.getElementById('edit-closing-day').value = settings.closing_day || 31;

  document.getElementById('edit-tier1-bonus').value = parseFloat(settings.tier1_from_tier2_bonus || 2.00).toFixed(2);
  document.getElementById('edit-tier2-bonus').value = parseFloat(settings.tier2_from_tier3_bonus || 1.50).toFixed(2);
  document.getElementById('edit-tier3-bonus').value = parseFloat(settings.tier3_from_tier4_bonus || 1.00).toFixed(2);

  document.getElementById('edit-withholding-rate').value = parseFloat(settings.withholding_tax_rate || 10.21).toFixed(2);
  document.getElementById('edit-invoice-deduction').value = parseFloat(settings.non_invoice_deduction_rate || 2.00).toFixed(2);
}

/**
 * 次回支払い予定日を表示
 */
function displayNextPaymentDate(data) {
  const container = document.getElementById('next-payment-info');
  if (!container) return;

  container.innerHTML = `
    <div class="alert alert-info">
      <i class="fas fa-calendar-alt"></i>
      <strong>次回支払い予定日:</strong> ${formatDate(data.next_payment_date)}
      <br>
      <small>支払いサイクル: ${getPaymentCycleLabel(data.payment_cycle)} | 締め日: 毎月${data.closing_day}日</small>
    </div>
  `;
}

/**
 * 設定履歴を表示
 */
function displaySettingsHistory(history) {
  const tbody = document.getElementById('settings-history-tbody');
  if (!tbody) return;

  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">設定履歴がありません</td></tr>';
    return;
  }

  tbody.innerHTML = history.map(setting => `
    <tr>
      <td>${formatDateTime(setting.created_at)}</td>
      <td>¥${parseInt(setting.minimum_payment_amount).toLocaleString()}</td>
      <td>${parseFloat(setting.tier1_from_tier2_bonus).toFixed(2)}%</td>
      <td>${parseFloat(setting.tier2_from_tier3_bonus).toFixed(2)}%</td>
      <td>${parseFloat(setting.tier3_from_tier4_bonus).toFixed(2)}%</td>
      <td>${parseFloat(setting.withholding_tax_rate).toFixed(2)}%</td>
      <td>
        <span class="badge badge-${setting.is_active ? 'success' : 'secondary'}">
          ${setting.is_active ? '有効' : '無効'}
        </span>
      </td>
    </tr>
  `).join('');
}

/**
 * イベントリスナー設定
 */
function setupEventListeners() {
  // 設定更新フォーム
  const form = document.getElementById('commission-settings-form');
  if (form) {
    form.addEventListener('submit', handleUpdateSettings);
  }

  // 編集モード切替
  const editBtn = document.getElementById('toggle-edit-mode');
  if (editBtn) {
    editBtn.addEventListener('click', toggleEditMode);
  }

  // キャンセルボタン
  const cancelBtn = document.getElementById('cancel-edit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      toggleEditMode();
      populateEditForm(currentSettings);
    });
  }
}

/**
 * 編集モード切替
 */
function toggleEditMode() {
  const displaySection = document.getElementById('settings-display-section');
  const editSection = document.getElementById('settings-edit-section');
  const editBtn = document.getElementById('toggle-edit-mode');

  if (editSection.style.display === 'none') {
    displaySection.style.display = 'none';
    editSection.style.display = 'block';
    editBtn.innerHTML = '<i class="fas fa-eye"></i> 表示モード';
  } else {
    displaySection.style.display = 'block';
    editSection.style.display = 'none';
    editBtn.innerHTML = '<i class="fas fa-edit"></i> 編集モード';
  }
}

/**
 * 設定更新処理
 */
async function handleUpdateSettings(e) {
  e.preventDefault();

  const formData = {
    minimum_payment_amount: parseFloat(document.getElementById('edit-minimum-payment').value),
    payment_cycle: document.getElementById('edit-payment-cycle').value,
    payment_day: parseInt(document.getElementById('edit-payment-day').value),
    closing_day: parseInt(document.getElementById('edit-closing-day').value),
    tier1_from_tier2_bonus: parseFloat(document.getElementById('edit-tier1-bonus').value),
    tier2_from_tier3_bonus: parseFloat(document.getElementById('edit-tier2-bonus').value),
    tier3_from_tier4_bonus: parseFloat(document.getElementById('edit-tier3-bonus').value),
    withholding_tax_rate: parseFloat(document.getElementById('edit-withholding-rate').value),
    non_invoice_deduction_rate: parseFloat(document.getElementById('edit-invoice-deduction').value)
  };

  // バリデーション
  if (formData.minimum_payment_amount < 0) {
    showErrorMessage('最低支払額は0以上である必要があります');
    return;
  }

  if (formData.payment_day < 1 || formData.payment_day > 31) {
    showErrorMessage('支払い日は1〜31の範囲で指定してください');
    return;
  }

  if (formData.closing_day < 1 || formData.closing_day > 31) {
    showErrorMessage('締め日は1〜31の範囲で指定してください');
    return;
  }

  // 確認ダイアログ
  const confirmed = confirm('報酬設定を更新しますか？\n\n注意: 更新後の設定は新規売上から適用されます。既存の報酬計算には影響しません。');
  if (!confirmed) return;

  try {
    showLoading();
    const response = await commissionSettingsAPI.update(formData);

    if (response.success) {
      showSuccessMessage('報酬設定を更新しました');
      await loadCurrentSettings();
      await loadSettingsHistory();
      await loadNextPaymentDate();
      toggleEditMode();
    } else {
      showErrorMessage(response.message || '設定の更新に失敗しました');
    }
  } catch (error) {
    console.error('Update settings error:', error);
    showErrorMessage('設定の更新中にエラーが発生しました');
  } finally {
    hideLoading();
  }
}

/**
 * 支払いサイクルラベル取得
 */
function getPaymentCycleLabel(cycle) {
  const labels = {
    'monthly': '月次',
    'weekly': '週次',
    'biweekly': '隔週'
  };
  return labels[cycle] || cycle;
}

/**
 * ユーティリティ関数
 */
function formatDate(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateTime(dateString) {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function showLoading() {
  const btn = document.querySelector('#commission-settings-form button[type="submit"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 更新中...';
  }
}

function hideLoading() {
  const btn = document.querySelector('#commission-settings-form button[type="submit"]');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> 設定を更新';
  }
}

function showSuccessMessage(message) {
  alert(message);
}

function showErrorMessage(message) {
  alert(message);
}
