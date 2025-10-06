/**
 * 設定ページ管理クラス
 */

class SettingsPage {
  constructor() {
    this.commissionSettings = null;
  }

  async init() {
    // 管理者の場合のみ報酬率設定を表示
    const user = authAPI.getCurrentUser();
    const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

    if (isAdmin) {
      await this.loadCommissionRates();
      // 報酬率設定セクションを表示
      const commissionSection = document.getElementById('commissionRatesSection');
      if (commissionSection) {
        commissionSection.style.display = 'block';
      }
    } else {
      // 代理店ユーザーの場合は報酬率設定セクションを非表示
      const commissionSection = document.getElementById('commissionRatesSection');
      if (commissionSection) {
        commissionSection.style.display = 'none';
      }
    }

    // 全ユーザーにアカウント設定を表示
    this.displayAccountSettings();
  }

  /**
   * 報酬率設定の読み込み
   */
  async loadCommissionRates() {
    try {
      const response = await window.commissionSettingsAPI.getCurrent();
      if (response.success && response.data) {
        this.commissionSettings = response.data;
        this.displayCommissionRates();
      }
    } catch (error) {
      console.error('Load commission rates error:', error);
    }
  }

  /**
   * 報酬率設定の表示
   */
  displayCommissionRates() {
    const container = document.getElementById('commissionRates');
    if (!container) return;

    container.innerHTML = `
      <div class="commission-rates-form">
        <form id="commissionRatesForm">
          <div class="form-section">
            <h4>階層ボーナス設定（上位代理店への還元率）</h4>
            <p class="setting-timing-note">📌 反映タイミング: <strong>売上登録時</strong>に確定（編集時・月次計算時は変更されません）</p>
            <div class="form-row">
              <div class="form-group">
                <label for="tier1_bonus">Tier1 ← Tier2 (%)</label>
                <input type="number" id="tier1_bonus"
                       value="${this.commissionSettings?.tier1_from_tier2_bonus || 2.00}"
                       min="0" max="100" step="0.01" required>
                <small>Tier2の売上からTier1への還元率</small>
              </div>
              <div class="form-group">
                <label for="tier2_bonus">Tier2 ← Tier3 (%)</label>
                <input type="number" id="tier2_bonus"
                       value="${this.commissionSettings?.tier2_from_tier3_bonus || 1.50}"
                       min="0" max="100" step="0.01" required>
                <small>Tier3の売上からTier2への還元率</small>
              </div>
              <div class="form-group">
                <label for="tier3_bonus">Tier3 ← Tier4 (%)</label>
                <input type="number" id="tier3_bonus"
                       value="${this.commissionSettings?.tier3_from_tier4_bonus || 1.00}"
                       min="0" max="100" step="0.01" required>
                <small>Tier4の売上からTier3への還元率</small>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>支払い設定</h4>
            <p class="setting-timing-note">📌 反映タイミング: <strong>月次計算時</strong></p>
            <div class="form-row">
              <div class="form-group">
                <label for="minimum_payment">最低支払額 (円)</label>
                <input type="number" id="minimum_payment"
                       value="${this.commissionSettings?.minimum_payment_amount || 10000}"
                       min="0" step="100" required>
                <small>この金額未満は繰り越し</small>
              </div>
              <div class="form-group">
                <label for="payment_cycle">支払いサイクル</label>
                <select id="payment_cycle" required>
                  <option value="monthly" ${this.commissionSettings?.payment_cycle === 'monthly' ? 'selected' : ''}>月次</option>
                  <option value="weekly" ${this.commissionSettings?.payment_cycle === 'weekly' ? 'selected' : ''}>週次</option>
                  <option value="biweekly" ${this.commissionSettings?.payment_cycle === 'biweekly' ? 'selected' : ''}>隔週</option>
                </select>
              </div>
              <div class="form-group">
                <label for="payment_day">支払日（日付）</label>
                <input type="number" id="payment_day"
                       value="${this.commissionSettings?.payment_day || 25}"
                       min="1" max="31" required>
                <small>月次の場合の支払日</small>
              </div>
              <div class="form-group">
                <label for="closing_day">締め日（日付）</label>
                <input type="number" id="closing_day"
                       value="${this.commissionSettings?.closing_day || 31}"
                       min="1" max="31" required>
                <small>月次の場合の締め日</small>
              </div>
            </div>
          </div>

          <div class="form-section">
            <h4>税務設定</h4>
            <p class="setting-timing-note">📌 反映タイミング: <strong>売上登録時</strong>に確定（編集時・月次計算時は変更されません）</p>
            <div class="form-row">
              <div class="form-group">
                <label for="withholding_tax">源泉徴収率 (%)</label>
                <input type="number" id="withholding_tax"
                       value="${this.commissionSettings?.withholding_tax_rate || 10.21}"
                       min="0" max="100" step="0.01" required>
                <small>個人事業主の場合に適用</small>
              </div>
              <div class="form-group">
                <label for="non_invoice_deduction">インボイス未登録控除率 (%)</label>
                <input type="number" id="non_invoice_deduction"
                       value="${this.commissionSettings?.non_invoice_deduction_rate || 2.00}"
                       min="0" max="100" step="0.01" required>
                <small>インボイス未登録の場合の控除</small>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn btn-primary">設定を保存</button>
            <button type="button" class="btn btn-secondary" onclick="window.settingsPage.loadCommissionRates()">リセット</button>
          </div>
        </form>
      </div>
    `;

    // フォーム送信イベント
    document.getElementById('commissionRatesForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveCommissionRates();
    });
  }

  /**
   * アカウント設定の表示
   */
  displayAccountSettings() {
    const container = document.getElementById('accountSettings');
    if (!container) return;

    const user = authAPI.getCurrentUser();
    if (!user) return;

    container.innerHTML = `
      <div class="account-settings-form">
        <div class="form-tabs">
          <button class="tab-button active" data-tab="email">メールアドレス変更</button>
          <button class="tab-button" data-tab="password">パスワード変更</button>
        </div>

        <!-- メールアドレス変更タブ -->
        <div class="tab-content active" id="emailTab">
          <form id="changeEmailForm">
            <div class="form-group">
              <label>現在のメールアドレス</label>
              <input type="email" value="${user.email}" readonly disabled class="form-control readonly-field">
            </div>
            <div class="form-group">
              <label for="newEmail">新しいメールアドレス*</label>
              <input type="email" id="newEmail" class="form-control" required>
              <small>変更後、新しいメールアドレスに確認メールが送信されます</small>
            </div>
            <div class="form-group">
              <label for="emailPassword">パスワード（確認用）*</label>
              <input type="password" id="emailPassword" class="form-control" required>
              <small>セキュリティのため、現在のパスワードを入力してください</small>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">メールアドレスを変更</button>
            </div>
          </form>
        </div>

        <!-- パスワード変更タブ -->
        <div class="tab-content" id="passwordTab">
          <form id="changePasswordForm">
            <div class="form-group">
              <label for="currentPassword">現在のパスワード*</label>
              <input type="password" id="currentPassword" class="form-control" required>
            </div>
            <div class="form-group">
              <label for="newPassword">新しいパスワード*</label>
              <input type="password" id="newPassword" class="form-control" required>
              <small>8文字以上、英数字を含む強力なパスワードを設定してください</small>
              <div id="passwordStrength" class="password-strength"></div>
            </div>
            <div class="form-group">
              <label for="confirmPassword">新しいパスワード（確認）*</label>
              <input type="password" id="confirmPassword" class="form-control" required>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">パスワードを変更</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // タブ切り替え
    const tabButtons = container.querySelectorAll('.tab-button');
    const tabContents = container.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetTab = button.dataset.tab;

        // ボタンのアクティブ状態を切り替え
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        // タブコンテンツの表示を切り替え
        tabContents.forEach(content => {
          if (content.id === targetTab + 'Tab') {
            content.classList.add('active');
          } else {
            content.classList.remove('active');
          }
        });
      });
    });

    // メールアドレス変更フォーム
    document.getElementById('changeEmailForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.changeEmail();
    });

    // パスワード変更フォーム
    document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.changePassword();
    });

    // パスワード強度チェック
    document.getElementById('newPassword')?.addEventListener('input', (e) => {
      this.checkPasswordStrength(e.target.value);
    });
  }

  /**
   * パスワード強度チェック
   */
  checkPasswordStrength(password) {
    const strengthElement = document.getElementById('passwordStrength');
    if (!strengthElement) return;

    let strength = 0;
    let message = '';
    let className = '';

    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    if (strength <= 2) {
      message = '弱い';
      className = 'weak';
    } else if (strength <= 4) {
      message = '普通';
      className = 'medium';
    } else {
      message = '強い';
      className = 'strong';
    }

    strengthElement.innerHTML = `<span class="strength-${className}">パスワード強度: ${message}</span>`;
  }

  /**
   * メールアドレス変更
   */
  async changeEmail() {
    const newEmail = document.getElementById('newEmail').value;
    const password = document.getElementById('emailPassword').value;

    try {
      const response = await apiClient.put('/auth/change-email', {
        new_email: newEmail,
        password: password
      });

      if (response.success) {
        alert('メールアドレス変更リクエストを送信しました。新しいメールアドレスに送信された確認メールをご確認ください。');
        document.getElementById('changeEmailForm').reset();
      } else {
        alert(response.message || 'メールアドレスの変更に失敗しました');
      }
    } catch (error) {
      console.error('Change email error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * パスワード変更
   */
  async changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // パスワード確認
    if (newPassword !== confirmPassword) {
      alert('新しいパスワードが一致しません');
      return;
    }

    // パスワード強度チェック
    if (newPassword.length < 8) {
      alert('パスワードは8文字以上である必要があります');
      return;
    }

    try {
      const response = await apiClient.put('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });

      if (response.success) {
        alert('パスワードを変更しました。セキュリティのため、再度ログインしてください。');
        // ログアウトして再ログインを促す
        await authAPI.logout();
        window.location.reload();
      } else {
        alert(response.message || 'パスワードの変更に失敗しました');
      }
    } catch (error) {
      console.error('Change password error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * 報酬率設定の保存
   */
  async saveCommissionRates() {
    const data = {
      tier1_from_tier2_bonus: parseFloat(document.getElementById('tier1_bonus').value),
      tier2_from_tier3_bonus: parseFloat(document.getElementById('tier2_bonus').value),
      tier3_from_tier4_bonus: parseFloat(document.getElementById('tier3_bonus').value),
      minimum_payment_amount: parseFloat(document.getElementById('minimum_payment').value),
      payment_cycle: document.getElementById('payment_cycle').value,
      payment_day: parseInt(document.getElementById('payment_day').value),
      closing_day: parseInt(document.getElementById('closing_day').value),
      withholding_tax_rate: parseFloat(document.getElementById('withholding_tax').value),
      non_invoice_deduction_rate: parseFloat(document.getElementById('non_invoice_deduction').value)
    };

    try {
      const response = await window.commissionSettingsAPI.update(data);
      if (response.success) {
        alert('報酬設定を更新しました');
        await this.loadCommissionRates();
      } else {
        alert(response.message || '保存に失敗しました');
      }
    } catch (error) {
      console.error('Save commission rates error:', error);
      alert('エラーが発生しました');
    }
  }

}

// グローバルスコープに登録
window.SettingsPage = SettingsPage;
window.settingsPage = new SettingsPage();