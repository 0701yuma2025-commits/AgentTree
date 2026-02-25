/**
 * グローバルHTMLエスケープ関数
 * XSS防止: ユーザー入力をinnerHTMLに挿入する前に必ず使用する
 */
function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

/**
 * メインアプリケーション
 */

class App {
  constructor() {
    this.currentPage = 'dashboard';
    this.pageLoadedFlags = {}; // ページロード状態管理
    // ページクラスのインスタンス化
    this.dashboardPage = new DashboardPage(this);
    this.agenciesPage = new AgenciesPage(this);
    this.salesPage = new SalesPage(this);
    // ローカルストレージからユーザー情報を取得
    const userStr = localStorage.getItem('agency_system_user');
    if (userStr) {
      this.user = JSON.parse(userStr);
    }
    this.init();
  }

  /**
   * 初期化
   */
  async init() {
    debugLog('App initializing...');

    // URLハッシュをチェックして、set-passwordルートの場合はリダイレクト
    const hash = window.location.hash;
    if (hash.startsWith('#/set-password')) {
      // set-password.htmlページにリダイレクト
      const params = hash.split('?')[1] || '';
      window.location.href = `/set-password.html?${params}`;
      return;
    }

    // イベントリスナー設定
    this.setupEventListeners();

    // 認証チェック
    if (authAPI.isLoggedIn()) {
      this.showMainApp();
      await this.loadInitialData();
    } else {
      this.showLoginScreen();
    }
  }

  /**
   * イベントリスナー設定
   */
  setupEventListeners() {
    // ログイン
    document.getElementById('loginBtn')?.addEventListener('click', () => this.handleLogin());
    document.getElementById('loginPassword')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });

    // 2FA認証
    document.getElementById('verify2FABtn')?.addEventListener('click', () => this.handle2FAVerification());
    document.getElementById('twoFactorCode')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handle2FAVerification();
    });


    // 2FA画面から戻る
    document.getElementById('back2FALink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.show2FAForm(false);
      this.showMessage('loginMessage', '', 'info');
    });

    // パスワードリセットリンク
    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showPasswordResetModal();
    });

    // ログアウト
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());

    // メニュートグル
    document.getElementById('menuToggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('sidebar')?.classList.toggle('active');
    });

    // サイドバー外クリックで閉じる
    document.addEventListener('click', (e) => {
      const sidebar = document.getElementById('sidebar');
      const menuToggle = document.getElementById('menuToggle');

      if (sidebar && sidebar.classList.contains('active')) {
        // サイドバーとメニューボタン以外をクリックした場合
        if (!sidebar.contains(e.target) && !menuToggle?.contains(e.target)) {
          sidebar.classList.remove('active');
        }
      }
    });

    // サイドバー内のクリックは伝播を止める
    document.getElementById('sidebar')?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // ナビゲーション
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (page) this.navigateToPage(page);
      });
    });

    // モーダル閉じる
    document.querySelector('.modal-close')?.addEventListener('click', () => {
      this.hideModal();
    });


    // 新規代理店ボタン
    document.getElementById('createAgencyBtn')?.addEventListener('click', () => {
      this.showCreateAgencyModal();
    });

    // 新規売上ボタン
    document.getElementById('createSaleBtn')?.addEventListener('click', () => {
      this.showCreateSaleModal();
    });

    // 売上CSVエクスポートボタン
    document.getElementById('exportSalesCsvBtn')?.addEventListener('click', async () => {
      try {
        const startDate = document.getElementById('startDate')?.value;
        const endDate = document.getElementById('endDate')?.value;

        await salesAPI.exportCSV({
          start_date: startDate,
          end_date: endDate
        });

        alert('CSVエクスポートが完了しました');
      } catch (error) {
        alert('CSVエクスポートに失敗しました');
      }
    });

    // 報酬CSVエクスポートボタン
    document.getElementById('exportCommissionsCsvBtn')?.addEventListener('click', async () => {
      try {
        const month = document.getElementById('commissionMonth')?.value;

        await commissionsAPI.exportCSV({
          month: month
        });

        alert('CSVエクスポートが完了しました');
      } catch (error) {
        alert('CSVエクスポートに失敗しました');
      }
    });

    // 代理店CSVエクスポートボタン
    document.getElementById('exportAgenciesCsvBtn')?.addEventListener('click', async () => {
      try {
        const tierFilter = document.getElementById('tierFilter')?.value;

        await agenciesAPI.exportCSV({
          tier: tierFilter
        });

        alert('CSVエクスポートが完了しました');
      } catch (error) {
        alert('CSVエクスポートに失敗しました');
      }
    });

    // 新規キャンペーンボタン
    document.getElementById('createCampaignBtn')?.addEventListener('click', () => {
      campaignsPage.showCreateCampaignModal();
    });

    // 売上フィルターボタン
    document.getElementById('filterSalesBtn')?.addEventListener('click', () => {
      const startDate = document.getElementById('startDate')?.value;
      const endDate = document.getElementById('endDate')?.value;

      const filters = {};
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;

      this.loadSales(true, filters);
    });

    // 代理店フィルター
    document.getElementById('tierFilter')?.addEventListener('change', () => {
      this.filterAgencies();
    });
    document.getElementById('statusFilter')?.addEventListener('change', () => {
      this.filterAgencies();
    });
    document.getElementById('agencySearch')?.addEventListener('input', () => {
      this.filterAgencies();
    });

  }

  /**
   * ログイン処理
   */
  async handleLogin() {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;

    if (!email || !password) {
      this.showMessage('loginMessage', 'メールアドレスとパスワードを入力してください', 'error');
      return;
    }

    try {
      this.showMessage('loginMessage', 'ログイン中...', 'info');

      const response = await authAPI.login(email, password);

      if (response.success) {
        // 2FA有効チェック
        if (response.requires2FA || response.user?.two_factor_enabled) {
          // 2FA入力画面を表示
          this.loginEmail = email; // 2FA認証時に使用するため保存
          this.show2FAForm(true);
          this.showMessage('loginMessage', '', 'info');
          this.showMessage('twoFactorMessage', 'メールに認証コードを送信しました。確認してください。', 'info');
          return;
        }

        // 2FAが不要な場合は通常通りログイン成功
        this.showMessage('loginMessage', 'ログイン成功', 'success');
        // セキュリティ対策: ページを完全リロードして前ユーザーのデータを確実に削除
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (error) {
      this.showMessage('loginMessage', error.message || 'ログインに失敗しました', 'error');
    }
  }

  /**
   * ログアウト処理
   */
  async handleLogout() {
    if (confirm('ログアウトしますか？')) {
      await authAPI.logout();
      // ページ遷移で完全にメモリをクリア（他ユーザーの情報が残らないように）
      window.location.href = '/';
    }
  }

  /**
   * ログイン画面表示
   */
  showLoginScreen() {
    document.getElementById('loginScreen')?.classList.remove('hidden');
    document.getElementById('mainApp')?.classList.add('hidden');

    // フォームクリア
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';

  }

  /**
   * 2FAフォーム表示切り替え
   */
  show2FAForm(show) {
    if (show) {
      document.getElementById('loginForm')?.classList.add('hidden');
      document.getElementById('twoFactorForm')?.classList.remove('hidden');
      // フォームクリア
      document.getElementById('twoFactorCode').value = '';
      // 認証コード入力にフォーカス
      setTimeout(() => {
        document.getElementById('twoFactorCode')?.focus();
      }, 100);
    } else {
      document.getElementById('loginForm')?.classList.remove('hidden');
      document.getElementById('twoFactorForm')?.classList.add('hidden');
      this.loginEmail = null;
    }
  }

  /**
   * 2FA認証処理
   */
  async handle2FAVerification() {
    const token = document.getElementById('twoFactorCode')?.value;

    if (!token || token.length !== 6) {
      this.showMessage('twoFactorMessage', '6桁の認証コードを入力してください', 'error');
      return;
    }

    try {
      this.showMessage('twoFactorMessage', '認証中...', 'info');

      const response = await authAPI.login2FAEmail(this.loginEmail, token);

      if (response.success) {
        this.showMessage('twoFactorMessage', '認証成功', 'success');
        // セキュリティ対策: ページを完全リロード
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    } catch (error) {
      this.showMessage('twoFactorMessage', error.message || '認証に失敗しました', 'error');
    }
  }


  /**
   * メインアプリ表示
   */
  showMainApp() {
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('mainApp')?.classList.remove('hidden');


    // ログイン後は全ページのロードフラグをリセット
    this.pageLoadedFlags = {};

    // currentPageをダッシュボードにリセット
    this.currentPage = 'dashboard';
    // 全ページを非表示にし、ダッシュボードページを表示
    document.querySelectorAll('.page').forEach(page => {
      page.classList.add('hidden');
    });
    document.getElementById('dashboardPage')?.classList.remove('hidden');
    // ナビゲーションもダッシュボードに戻す
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.page === 'dashboard') {
        item.classList.add('active');
      }
    });

    // ユーザー情報表示
    const user = authAPI.getCurrentUser();
    if (user) {
      // ロールを日本語表示
      const roleText = (user.role === 'admin' || user.role === 'super_admin') ? '管理者' :
                       user.role === 'agency' ? '代理店' : user.role;
      document.getElementById('userInfo').textContent = `${user.full_name || user.email} (${roleText})`;
    }

    // 管理者メニュー表示/非表示
    const isAdmin = authAPI.isAdmin();
    document.querySelectorAll('.admin-only').forEach(el => {
      if (isAdmin) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    });

    // ダッシュボードを表示
    this.navigateToPage('dashboard');
  }

  /**
   * ページ遷移
   */
  navigateToPage(pageName) {
    // 現在のページを非表示
    document.getElementById(`${this.currentPage}Page`)?.classList.add('hidden');

    // 新しいページを表示
    document.getElementById(`${pageName}Page`)?.classList.remove('hidden');

    // ナビゲーションのアクティブ状態更新
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.dataset.page === pageName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    this.currentPage = pageName;

    // ページごとのデータ読み込み
    this.loadPageData(pageName);
  }

  /**
   * ページデータ読み込み
   */
  async loadPageData(pageName) {
    try {
      // 初回アクセスまたはフラグがリセットされた場合は強制リロード
      const forceReload = !this.pageLoadedFlags[pageName];

      switch (pageName) {
        case 'dashboard':
          await this.dashboardPage.init();
          break;
        case 'agencies':
          await this.agenciesPage.loadAgencies(forceReload);
          break;
        case 'sales':
          await this.salesPage.loadSales(forceReload);
          break;
        case 'commissions':
          await this.loadCommissions(forceReload);
          break;
        case 'invoices':
          this.loadInvoices(forceReload);
          break;
        case 'invitations':
          await this.loadInvitations(forceReload);
          break;
        case 'settings':
          await this.loadSettings(forceReload);
          break;
        case 'products':
          await this.loadProducts(forceReload);
          break;
        case 'campaigns':
          await campaignsPage.loadCampaigns();
          // キャンペーンページのボタンにイベントリスナーを設定
          document.getElementById('createCampaignBtn')?.addEventListener('click', () => {
            campaignsPage.showCreateCampaignModal();
          });
          break;
        case 'network':
          await networkPage.init();
          break;
        case 'auditLogs':
          await auditLogsPage.init();
          break;
        case 'commissionSettings':
          await initCommissionSettings();
          break;
      }

      // ロード完了を記録
      this.pageLoadedFlags[pageName] = true;
    } catch (error) {
      errorLog('Load page data error:', error);
      this.showMessage('message', 'データの読み込みに失敗しました', 'error');
    }
  }

  /**
   * 初期データ読み込み
   */
  async loadInitialData() {
    await this.dashboardPage.loadDashboard();
  }

  // --- Dashboard delegation stubs ---
  async loadDashboard() { return this.dashboardPage.loadDashboard(); }

  // --- Agencies delegation stubs ---
  async loadAgencies(...args) { return this.agenciesPage.loadAgencies(...args); }
  filterAgencies() { this.agenciesPage.applyAgenciesFilters(); }

  // --- Sales delegation stubs ---
  async loadSales(...args) { return this.salesPage.loadSales(...args); }
  applySalesFilters() { this.salesPage.applySalesFilters(); }
  getCommissionStatusBadge(commission) { return this.salesPage.getCommissionStatusBadge(commission); }

  /**
   * 報酬一覧読み込み
   */
  async loadCommissions(forceReload = false) {
    try {
      // CommissionsPageクラスを初期化（変数名を変更してDOM要素との衝突を回避）
      if (!window.commissionsPageInstance) {
        if (window.CommissionsPage) {
          window.commissionsPageInstance = new window.CommissionsPage();
        } else {
          console.error('CommissionsPage class not loaded yet');
          return;
        }
      }
      await window.commissionsPageInstance.init();
    } catch (error) {
      errorLog('Load commissions error:', error);
    }
  }

  /**
   * 請求書一覧読み込み
   */
  loadInvoices(forceReload = false) {
    try {
      // 請求書ページを初期化
      if (typeof initInvoicesPage === 'function') {
        initInvoicesPage();
      }
    } catch (error) {
      errorLog('Load invoices error:', error);
    }
  }

  /**
   * 招待一覧読み込み
   */
  async loadInvitations(forceReload = false) {
    try {
      const invitations = await apiClient.get('/invitations');
      const tbody = document.querySelector('#invitationsTable tbody');

      tbody.innerHTML = '';

      if (invitations.success && invitations.data) {
        invitations.data.forEach(invitation => {
          const isExpired = new Date(invitation.expires_at) < new Date();
          const status = invitation.accepted_at ? 'accepted' : (isExpired ? 'expired' : 'pending');

          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${invitation.email}</td>
            <td>${invitation.agencies?.company_name || '-'}</td>
            <td>${new Date(invitation.expires_at).toLocaleDateString()}</td>
            <td><span class="badge badge-${status}">${status}</span></td>
            <td>${new Date(invitation.created_at).toLocaleDateString()}</td>
            <td>
              ${status === 'pending' ?
                `<button class="btn btn-sm" onclick="app.copyInviteLink('${invitation.token}')">リンクコピー</button>` : '-'}
            </td>
          `;
          tbody.appendChild(row);
        });
      }
    } catch (error) {
      errorLog('Load invitations error:', error);
    }
  }

  /**
   * 設定読み込み
   */
  async loadSettings(forceReload = false) {
    debugLog('Loading settings...');
    try {
      // 設定ページの初期化
      if (window.settingsPage) {
        await window.settingsPage.init();
      }
    } catch (error) {
      errorLog('Load settings error:', error);
    }
  }

  /**
   * 商品管理読み込み
   */
  async loadProducts(forceReload = false) {
    debugLog('Loading products...');
    try {
      // 商品ページの初期化
      if (window.productsPage) {
        await window.productsPage.init();
      }
    } catch (error) {
      errorLog('Load products error:', error);
    }
  }

  // --- More Agencies delegation stubs ---
  async viewAgency(...args) { return this.agenciesPage.viewAgency(...args); }
  async loadRegistrationHistory(...args) { return this.agenciesPage.loadRegistrationHistory(...args); }

  /**
   * モーダルを開く
   */
  openModal() {
    const modal = document.getElementById('modal');
    if (modal) {
      modal.classList.remove('hidden');
      // エスケープキーで閉じる
      document.addEventListener('keydown', this.handleModalEscape);
    }
  }

  /**
   * モーダルを閉じる
   */
  closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
      modal.classList.add('hidden');
      document.removeEventListener('keydown', this.handleModalEscape);
      // モーダルの中身をクリア
      const modalBody = document.getElementById('modalBody');
      if (modalBody) {
        modalBody.innerHTML = '';
      }
    }
  }

  /**
   * ESCキーでモーダルを閉じる
   */
  handleModalEscape = (event) => {
    if (event.key === 'Escape') {
      this.closeModal();
    }
  }

  /**
   * モーダルを閉じる（hideModal互換性のため）
   */
  hideModal() {
    this.closeModal();
  }

  async editAgency(...args) { return this.agenciesPage.editAgency(...args); }
  async saveAgencyChanges(...args) { return this.agenciesPage.saveAgencyChanges(...args); }
  async deleteAgency(...args) { return this.agenciesPage.deleteAgency(...args); }
  async approveAgency(...args) { return this.agenciesPage.approveAgency(...args); }
  async rejectAgency(...args) { return this.agenciesPage.rejectAgency(...args); }
  async suspendAgency(...args) { return this.agenciesPage.suspendAgency(...args); }
  async reactivateAgency(...args) { return this.agenciesPage.reactivateAgency(...args); }

  /**
   * 全ページのデータクリア
   */
  clearAllPageData() {
    // currentPageをダッシュボードにリセット
    this.currentPage = 'dashboard';

    // 代理店テーブル
    const agenciesTable = document.querySelector('#agenciesTable tbody');
    if (agenciesTable) agenciesTable.innerHTML = '';

    // 売上テーブル
    const salesTable = document.querySelector('#salesTable tbody');
    if (salesTable) salesTable.innerHTML = '';

    // 報酬テーブル
    const commissionsTable = document.querySelector('#commissionsTable tbody');
    if (commissionsTable) commissionsTable.innerHTML = '';

    // 報酬サマリー
    const baseCommission = document.getElementById('baseCommission');
    if (baseCommission) baseCommission.textContent = '¥0';
    const tierBonus = document.getElementById('tierBonus');
    if (tierBonus) tierBonus.textContent = '¥0';
    const campaignBonus = document.getElementById('campaignBonus');
    if (campaignBonus) campaignBonus.textContent = '¥0';
    const totalCommissionAmount = document.getElementById('totalCommissionAmount');
    if (totalCommissionAmount) totalCommissionAmount.textContent = '¥0';

    // 招待テーブル
    const invitationsTable = document.querySelector('#invitationsTable tbody');
    if (invitationsTable) invitationsTable.innerHTML = '';

    // 設定ページ
    const commissionRates = document.getElementById('commissionRates');
    if (commissionRates) commissionRates.innerHTML = '';
    const productsSettings = document.getElementById('productsSettings');
    if (productsSettings) productsSettings.innerHTML = '';

    // 組織売上サマリーをクリア＆非表示
    const organizationSalesCard = document.getElementById('organizationSalesCard');
    if (organizationSalesCard) {
      organizationSalesCard.classList.add('hidden');

      // 今月タブのデータをクリア
      document.getElementById('orgCurrentTotalAmount').textContent = '¥0';
      document.getElementById('orgCurrentOwnAmount').textContent = '¥0';
      document.getElementById('orgCurrentSubordinateAmount').textContent = '¥0';
      document.getElementById('orgCurrentTopAgenciesList').innerHTML = '';

      // 先月タブのデータをクリア
      document.getElementById('orgPreviousTotalAmount').textContent = '¥0';
      document.getElementById('orgPreviousOwnAmount').textContent = '¥0';
      document.getElementById('orgPreviousSubordinateAmount').textContent = '¥0';
      document.getElementById('orgPreviousTopAgenciesList').innerHTML = '';

      // タブを初期状態に戻す
      const tabButtons = document.querySelectorAll('.org-tab-button');
      const tabContents = document.querySelectorAll('.org-tab-content');
      tabButtons.forEach((btn, index) => {
        if (index === 0) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      tabContents.forEach((content, index) => {
        if (index === 0) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    }

    // ページロード済みフラグをリセット
    this.pageLoadedFlags = {};
  }

  /**
   * ダッシュボード要素のリセット
   */
  resetDashboardElements() {
    // KPI要素をリセット
    const totalSales = document.getElementById('totalSales');
    if (totalSales) totalSales.textContent = '¥0';

    const totalCommission = document.getElementById('totalCommission');
    if (totalCommission) totalCommission.textContent = '¥0';

    const activeAgencies = document.getElementById('activeAgencies');
    if (activeAgencies) activeAgencies.textContent = '0';

    const pendingCount = document.getElementById('pendingCount');
    if (pendingCount) pendingCount.textContent = '0';

    const totalSalesCount = document.getElementById('totalSalesCount');
    if (totalSalesCount) totalSalesCount.textContent = '0件';

    const growthRate = document.getElementById('growthRate');
    if (growthRate) {
      growthRate.textContent = '0%';
      growthRate.className = '';
    }

    const pendingCommission = document.getElementById('pendingCommission');
    if (pendingCommission) pendingCommission.textContent = '¥0';

    // 最近の売上リストをクリア
    const recentSalesList = document.getElementById('recentSalesList');
    if (recentSalesList) recentSalesList.innerHTML = '';

    // グラフをクリア
    const monthlyChart = document.getElementById('monthlyChart');
    if (monthlyChart) monthlyChart.innerHTML = '';

    // 報酬サマリーをリセット
    const baseCommission = document.getElementById('baseCommission');
    if (baseCommission) baseCommission.textContent = '¥0';

    const tierBonus = document.getElementById('tierBonus');
    if (tierBonus) tierBonus.textContent = '¥0';

    const campaignBonus = document.getElementById('campaignBonus');
    if (campaignBonus) campaignBonus.textContent = '¥0';

    const totalCommissionAmount = document.getElementById('totalCommissionAmount');
    if (totalCommissionAmount) totalCommissionAmount.textContent = '¥0';
  }

  /**
   * 招待リンクコピー
   */
  copyInviteLink(token) {
    const url = `${window.location.origin}/invite-accept.html?token=${token}`;
    navigator.clipboard.writeText(url);
    alert('招待リンクをコピーしました');
  }

  /**
   * 新規招待モーダル表示
   */
  showCreateInvitationModal() {
    invitationsPage.showCreateInvitationModal();
  }

  /**
   * 報酬を支払済にする
   */
  async markCommissionAsPaid(commissionId) {
    const paymentDate = prompt('支払日を入力してください (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!paymentDate) return;

    const paymentMethod = prompt('支払方法を入力してください (bank_transfer/cash/other)', 'bank_transfer');
    const transactionId = prompt('取引ID・振込番号（任意）');

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/commissions/${commissionId}/pay`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('agency_system_token') || localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          payment_date: paymentDate,
          payment_method: paymentMethod,
          transaction_id: transactionId
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || '支払完了として記録しました');
        await this.loadCommissions();
      } else {
        alert(data.message || '支払記録に失敗しました');
      }
    } catch (error) {
      console.error('Mark as paid error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * 報酬計算実行
   */
  async calculateCommissions() {
    const month = prompt('計算対象月を入力してください (例: 2025-09)', new Date().toISOString().slice(0, 7));
    if (!month) return;

    // 月フォーマットの検証
    if (!/^\d{4}-\d{2}$/.test(month)) {
      alert('正しい形式で入力してください（例: 2025-09）');
      return;
    }

    if (!confirm(`${month}の報酬を計算・確定します。既存の報酬データは上書きされます。よろしいですか？`)) {
      return;
    }

    try {
      const response = await apiClient.post('/commissions/calculate', { month });

      if (response.success) {
        const data = response.data;
        alert(`報酬計算・確定が完了しました！\n対象月: ${data.month}\n確定件数: ${data.total_commissions}件\n確定金額: ¥${data.total_amount.toLocaleString()}`);

        // 報酬ページの再読み込み
        if (this.currentPage === 'commissions') {
          await this.loadCommissions();
        }
      } else {
        alert(response.message || '報酬計算に失敗しました');
      }
    } catch (error) {
      alert('報酬計算中にエラーが発生しました: ' + error.message);
    }
  }

  // --- More Sales delegation stubs ---
  async showSaleDetail(...args) { return this.salesPage.showSaleDetail(...args); }
  async editSale(...args) { return this.salesPage.editSale(...args); }
  async deleteSale(...args) { return this.salesPage.deleteSale(...args); }
  async showSaleHistory(...args) { return this.salesPage.showSaleHistory(...args); }

  /**
   * 日本式通貨フォーマット
   */
  formatCurrency(amount) {
    if (amount >= 100000000) {
      // 1億以上は「億円」
      return `¥${(amount / 100000000).toFixed(1)}億`;
    } else if (amount >= 10000) {
      // 1万以上は「万円」
      return `¥${(amount / 10000).toFixed(0)}万`;
    } else {
      // 1万未満は「円」
      return `¥${amount.toLocaleString()}`;
    }
  }

  /**
   * モーダル表示
   */
  showModal(content) {
    const modalBody = document.getElementById('modalBody');
    const modal = document.getElementById('modal');

    if (!modalBody || !modal) {
      console.error('Modal elements not found');
      return;
    }

    modalBody.innerHTML = content || '';
    modal.classList.remove('hidden');
  }

  /**
   * モーダル非表示
   */
  hideModal() {
    document.getElementById('modal').classList.add('hidden');
  }

  /**
   * パスワードリセットモーダル表示
   */
  showPasswordResetModal() {
    const modalContent = `
      <div class="modal-header">
        <h2>パスワードリセット</h2>
      </div>
      <div class="modal-body">
        <form id="passwordResetForm">
          <div class="form-group">
            <label for="resetEmail">登録メールアドレス</label>
            <input type="email" id="resetEmail" name="email" required
                   placeholder="メールアドレスを入力してください">
            <small class="form-text">パスワードリセット用のリンクを送信します</small>
          </div>
          <div class="modal-buttons">
            <button type="submit" class="btn btn-primary">リセットメールを送信</button>
            <button type="button" class="btn btn-secondary" onclick="app.hideModal()">キャンセル</button>
          </div>
        </form>
      </div>
    `;

    this.showModal(modalContent);

    // フォーム送信イベント設定
    document.getElementById('passwordResetForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('resetEmail').value;

      try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/reset-password-request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        });

        const result = await response.json();

        if (result.success) {
          alert('パスワードリセットメールを送信しました。メールをご確認ください。');
          this.hideModal();
        } else {
          alert(result.message || 'リセットメールの送信に失敗しました');
        }
      } catch (error) {
        console.error('Password reset request error:', error);
        alert('エラーが発生しました。もう一度お試しください。');
      }
    });
  }

  /**
   * メッセージ表示
   */
  showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = message;
      element.className = `message ${type}`;
      element.style.display = 'block';

      if (type === 'success') {
        setTimeout(() => {
          element.style.display = 'none';
        }, 3000);
      }
    }
  }

  // --- More Agencies/Sales delegation stubs ---
  async showCreateAgencyModal() { return this.agenciesPage.showCreateAgencyModal(); }
  async createAgency() { return this.agenciesPage.createAgency(); }
  async showCreateSaleModal() { return this.salesPage.showCreateSaleModal(); }
  async createSale() { return this.salesPage.createSale(); }
}

// アプリケーション起動
const app = new App();
window.app = app;