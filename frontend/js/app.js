/**
 * メインアプリケーション
 */

class App {
  constructor() {
    this.currentPage = 'dashboard';
    this.pageLoadedFlags = {}; // ページロード状態管理
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
          await this.loadDashboard();
          break;
        case 'agencies':
          await this.loadAgencies(forceReload);
          break;
        case 'sales':
          await this.loadSales(forceReload);
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
    console.log('loadInitialData called');
    await this.loadDashboard();
    console.log('loadDashboard completed');
  }

  /**
   * 招待一覧読み込み
   */
  async loadInvitations() {
    await invitationsPage.loadInvitations();
  }

  /**
   * ダッシュボード読み込み
   */
  async loadDashboard() {
    try {
      console.log('loadDashboard: Fetching dashboard stats...');
      // ダッシュボード統計データ取得
      const dashboardStats = await apiClient.get('/dashboard/stats');
      console.log('Dashboard stats response:', dashboardStats);

      if (dashboardStats.success && dashboardStats.data) {
        const stats = dashboardStats.data;

        // 売上情報
        if (stats.sales) {
          document.getElementById('totalSales').textContent = `¥${stats.sales.currentMonth.toLocaleString()}`;
          document.getElementById('totalSalesCount').textContent = `${stats.sales.currentMonthCount}件`;

          // 成長率表示
          if (stats.sales.growthRate !== undefined) {
            const growthElement = document.getElementById('growthRate');
            if (growthElement) {
              growthElement.textContent = `${stats.sales.growthRate > 0 ? '+' : ''}${stats.sales.growthRate}%`;
              growthElement.className = stats.sales.growthRate >= 0 ? 'text-success' : 'text-danger';
            }
          }
        }

        // 報酬情報
        if (stats.commissions) {
          document.getElementById('totalCommission').textContent = `¥${stats.commissions.currentMonth.toLocaleString()}`;
          document.getElementById('pendingCommission').textContent = `¥${stats.commissions.pending.toLocaleString()}`;
        }

        // 代理店情報（管理者のみ）
        if (stats.agencies) {
          document.getElementById('activeAgencies').textContent = stats.agencies.active;
          document.getElementById('pendingCount').textContent = stats.agencies.inactive;
        } else {
          // 代理店ユーザーの場合は非表示を示す
          document.getElementById('activeAgencies').textContent = '-';
          document.getElementById('pendingCount').textContent = '-';
        }

        // 最近の売上表示
        if (stats.recentSales && stats.recentSales.length > 0) {
          const recentSalesContainer = document.getElementById('recentSalesList');
          if (recentSalesContainer) {
            recentSalesContainer.innerHTML = stats.recentSales.map(sale => `
              <div class="recent-sale-item">
                <span class="sale-number">${sale.sale_number}</span>
                <span class="customer">${sale.customer_name}</span>
                <span class="amount">¥${sale.total_amount.toLocaleString()}</span>
                <span class="date">${sale.sale_date}</span>
              </div>
            `).join('');
          }
        }

        // 月別推移グラフ用データ
        if (stats.monthlyTrend) {
            this.renderMonthlyChart(stats.monthlyTrend);
        } else {
          console.log('No monthly trend data in stats');
        }

        // 組織売上サマリー（代理店のみ）
        if (stats.organizationSales) {
          this.renderOrganizationSales(stats.organizationSales);
          this.setupOrganizationTabs();
        } else {
          // 管理者の場合は組織売上サマリーを非表示
          const organizationSalesCard = document.getElementById('organizationSalesCard');
          if (organizationSalesCard) {
            organizationSalesCard.classList.add('hidden');
          }
        }
      }

    } catch (error) {
      errorLog('Load dashboard error:', error);
    }
  }

  /**
   * 組織売上サマリー表示
   */
  renderOrganizationSales(orgSales) {
    const card = document.getElementById('organizationSalesCard');
    if (!card) return;

    // カードを表示
    card.classList.remove('hidden');

    // 今月と先月のデータを分離
    this.currentOrgSales = orgSales.current || orgSales; // 今月のデータ（後方互換性のため）
    this.previousOrgSales = orgSales.previous || null; // 先月のデータ

    // 今月データの表示（デフォルト）
    this.renderOrgSalesData('current');
  }

  /**
   * 組織売上データを特定のタブに表示
   */
  renderOrgSalesData(period) {
    const data = period === 'current' ? this.currentOrgSales : this.previousOrgSales;

    if (!data) {
      // データがない場合の処理
      this.renderEmptyOrgSalesData(period);
      return;
    }

    // 金額表示
    const prefix = period === 'current' ? 'orgCurrent' : 'orgPrevious';

    document.getElementById(`${prefix}TotalAmount`).textContent =
      `¥${data.total_amount.toLocaleString()}`;
    document.getElementById(`${prefix}OwnAmount`).textContent =
      `¥${data.own_amount.toLocaleString()}`;
    document.getElementById(`${prefix}SubordinateAmount`).textContent =
      `¥${data.subordinate_amount.toLocaleString()}`;

    // TOP代理店リスト
    const topAgenciesList = document.getElementById(`${prefix}TopAgenciesList`);
    if (topAgenciesList && data.top_agencies) {
      if (data.top_agencies.length > 0) {
        topAgenciesList.innerHTML = data.top_agencies.map((agency, index) => `
          <div class="top-agency-item">
            <span class="rank">${index + 1}</span>
            <span class="name">${agency.agency_name}</span>
            <span class="amount">¥${agency.total_amount.toLocaleString()}</span>
            <span class="count">${agency.sale_count}件</span>
          </div>
        `).join('');
      } else {
        topAgenciesList.innerHTML = '<p class="no-data">データがありません</p>';
      }
    }
  }

  /**
   * データがない場合の表示
   */
  renderEmptyOrgSalesData(period) {
    const prefix = period === 'current' ? 'orgCurrent' : 'orgPrevious';

    document.getElementById(`${prefix}TotalAmount`).textContent = '¥0';
    document.getElementById(`${prefix}OwnAmount`).textContent = '¥0';
    document.getElementById(`${prefix}SubordinateAmount`).textContent = '¥0';

    const topAgenciesList = document.getElementById(`${prefix}TopAgenciesList`);
    if (topAgenciesList) {
      topAgenciesList.innerHTML = '<p class="no-data">データがありません</p>';
    }
  }

  /**
   * 組織売上タブの設定
   */
  setupOrganizationTabs() {
    // タブに正確な月名を設定
    this.updateTabLabels();

    const tabButtons = document.querySelectorAll('.org-tab-button');
    const tabContents = document.querySelectorAll('.org-tab-content');

    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const targetTab = e.target.dataset.tab;

        // アクティブクラスの切り替え
        tabButtons.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));

        e.target.classList.add('active');
        document.getElementById(`org${targetTab === 'current' ? 'Current' : 'Previous'}Month`).classList.add('active');

        // データを表示
        this.renderOrgSalesData(targetTab);
      });
    });
  }

  /**
   * タブのラベルを現在の月に合わせて更新
   */
  updateTabLabels() {
    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 0ベースなので+1
    const currentYear = now.getFullYear();

    // 先月の計算
    const previousMonth = now.getMonth() === 0 ? 12 : now.getMonth();
    const previousYear = now.getMonth() === 0 ? currentYear - 1 : currentYear;

    // タブのテキストを更新
    const currentMonthTab = document.getElementById('currentMonthTab');
    const previousMonthTab = document.getElementById('previousMonthTab');

    if (currentMonthTab) {
      currentMonthTab.textContent = `${currentYear}年${currentMonth}月`;
    }
    if (previousMonthTab) {
      previousMonthTab.textContent = `${previousYear}年${previousMonth}月`;
    }
  }

  /**
   * 月別売上グラフ描画
   */
  renderMonthlyChart(monthlyData) {
    const chartContainer = document.getElementById('monthlyChart');
    if (chartContainer && monthlyData && monthlyData.length > 0) {
      // 簡易的な棒グラフ表示
      const maxValue = Math.max(...monthlyData.map(d => d.sales), 100000); // 最小値100,000円を設定

      chartContainer.innerHTML = `
        <div class="simple-chart">
          ${monthlyData.map(data => {
            const heightPercent = data.sales > 0 ? Math.max((data.sales / maxValue * 100), 5) : 0;
            return `
              <div class="chart-bar">
                ${data.sales > 0 ?
                  `<div class="value">${this.formatCurrency(data.sales)}</div>` :
                  ''
                }
                <div class="bar" style="height: ${heightPercent}%; ${data.sales === 0 ? 'background: #e0e0e0;' : ''}"></div>
                <div class="label">${parseInt(data.month.split('-')[1])}月</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      if (chartContainer) {
        chartContainer.innerHTML = '<p style="text-align: center; color: #999;">データがありません</p>';
      }
    }
  }

  /**
   * 代理店一覧読み込み
   */
  async loadAgencies(forceReload = false) {
    try {
      const agencies = await agenciesAPI.getAgencies();
      console.log('Agencies data from API:', agencies);

      // TableHelperの初期化（初回のみ）
      if (!this.agenciesTableHelper) {
        const containerElement = document.querySelector('#agenciesPage .table-container');

        this.agenciesTableHelper = new TableHelper({
          itemsPerPage: 25,
          defaultSortColumn: 'created_at',
          defaultSortDirection: 'desc',
          containerElement: containerElement,
          renderCallback: (pageData) => this.renderAgenciesTable(pageData)
        });

        // イベントリスナー設定
        const setupEventListeners = () => {
          // 検索フィルター
          const searchInput = document.getElementById('agencySearch');
          if (searchInput) {
            const newSearchInput = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearchInput, searchInput);
            newSearchInput.addEventListener('input', () => {
              this.applyAgenciesFilters();
            });
          }

          // Tierフィルター
          const tierFilter = document.getElementById('tierFilter');
          if (tierFilter) {
            const newTierFilter = tierFilter.cloneNode(true);
            tierFilter.parentNode.replaceChild(newTierFilter, tierFilter);
            newTierFilter.addEventListener('change', () => {
              this.applyAgenciesFilters();
            });
          }

          // ステータスフィルター
          const statusFilter = document.getElementById('statusFilter');
          if (statusFilter) {
            const newStatusFilter = statusFilter.cloneNode(true);
            statusFilter.parentNode.replaceChild(newStatusFilter, statusFilter);
            newStatusFilter.addEventListener('change', () => {
              this.applyAgenciesFilters();
            });
          }

          // ソート可能なヘッダー
          document.querySelectorAll('#agenciesTable th.sortable').forEach(header => {
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);
            newHeader.addEventListener('click', () => {
              const column = newHeader.dataset.column;

              // 既存のソートクラスをクリア
              document.querySelectorAll('#agenciesTable th.sortable').forEach(h => {
                h.classList.remove('sorted-asc', 'sorted-desc');
              });

              this.agenciesTableHelper.setSort(column);

              // 新しいソート状態を反映
              const direction = this.agenciesTableHelper.sortDirection;
              newHeader.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            });
          });
        };

        setupEventListeners();

        // デフォルトのソート表示を設定
        const defaultSortHeader = document.querySelector(`#agenciesTable th.sortable[data-column="created_at"]`);
        if (defaultSortHeader) {
          defaultSortHeader.classList.add('sorted-desc');
        }
      }

      // データを正規化
      const normalizedData = agencies.map(agency => ({
        ...agency,
        created_at: new Date(agency.created_at),
        created_at_timestamp: new Date(agency.created_at).getTime()
      }));

      this.agenciesTableHelper.setData(normalizedData);
      this.applyAgenciesFilters();

    } catch (error) {
      errorLog('Load agencies error:', error);
    }
  }

  /**
   * 代理店フィルタを適用
   */
  applyAgenciesFilters() {
    const searchText = document.getElementById('agencySearch')?.value || '';
    const tierFilter = document.getElementById('tierFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    this.agenciesTableHelper.setFilters({
      search: (agency) => {
        if (!searchText) return true;
        const text = searchText.toLowerCase();
        return agency.company_name?.toLowerCase().includes(text) ||
               agency.representative_name?.toLowerCase().includes(text) ||
               agency.agency_code?.toLowerCase().includes(text);
      },
      tier: (agency) => {
        if (!tierFilter) return true;
        return agency.tier_level.toString() === tierFilter;
      },
      status: (agency) => {
        if (!statusFilter) return true;
        return agency.status === statusFilter;
      }
    });
  }

  /**
   * 代理店テーブル描画
   */
  renderAgenciesTable(agencies) {
    const tbody = document.querySelector('#agenciesTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    agencies.forEach(agency => {
      const row = document.createElement('tr');

      // 階層レベルに応じてインデント
      const hierarchyLevel = agency.hierarchy_level || 0;
      const indent = hierarchyLevel > 0 ? `${'　'.repeat(hierarchyLevel)}└ ` : '';
      const nameStyle = hierarchyLevel > 0 ? 'style="padding-left: ' + (hierarchyLevel * 20) + 'px;"' : '';

      // 親代理店名の表示
      const parentDisplay = agency.parent_agency_name ?
        `<small class="text-muted">(親: ${agency.parent_agency_name})</small>` : '';

      row.innerHTML = `
        <td>${agency.agency_code || '-'}</td>
        <td ${nameStyle}>
          ${indent}${agency.company_name}
          ${parentDisplay}
        </td>
        <td>Tier ${agency.tier_level}</td>
        <td>${agency.representative_name || '-'}</td>
        <td><span class="badge badge-${agency.status}">${agency.status}</span></td>
        <td>${new Date(agency.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm" onclick="app.viewAgency('${agency.id}')">詳細</button>
          ${authAPI.isAdmin() && agency.status === 'pending' ?
            `<button class="btn btn-sm btn-primary" onclick="app.approveAgency('${agency.id}')">承認</button>
             <button class="btn btn-sm btn-danger" onclick="app.rejectAgency('${agency.id}')">拒否</button>` : ''}
          ${authAPI.isAdmin() && agency.status === 'active' ?
            `<button class="btn btn-sm btn-warning" onclick="app.suspendAgency('${agency.id}')">停止</button>` : ''}
          ${authAPI.isAdmin() && agency.status === 'suspended' ?
            `<button class="btn btn-sm btn-success" onclick="app.reactivateAgency('${agency.id}')">再有効化</button>` : ''}
        </td>
      `;

      // 階層レベルに応じて背景色を調整
      if (hierarchyLevel > 0) {
        row.style.backgroundColor = `rgba(0, 0, 0, ${0.02 * hierarchyLevel})`;
      }

      tbody.appendChild(row);
    });
  }

  /**
   * 売上一覧読み込み
   */
  async loadSales(forceReload = false, filters = {}) {
    try {
      const sales = await apiClient.get('/sales', filters);

      if (!sales.success || !sales.data) return;

      // TableHelperインスタンスを作成
      if (!this.salesTableHelper) {
        this.salesTableHelper = new TableHelper({
          itemsPerPage: 25,
          defaultSortColumn: 'sale_date',
          defaultSortDirection: 'desc',
          containerElement: document.getElementById('salesTableContainer'),
          renderCallback: (pageData) => {
            const tbody = document.querySelector('#salesTable tbody');
            tbody.innerHTML = '';

            pageData.forEach(sale => {
              const row = document.createElement('tr');
              row.innerHTML = `
                <td>${sale.sale_number}</td>
                <td>${new Date(sale.sale_date).toLocaleDateString()}</td>
                <td>${sale.customer_name}</td>
                <td>${sale.product?.name || sale.products?.name || '-'}</td>
                <td>${sale.quantity}</td>
                <td>¥${sale.total_amount.toLocaleString()}</td>
                <td>
                  <button class="btn btn-secondary" onclick="app.showSaleDetail('${sale.id}')">詳細</button>
                </td>
              `;
              tbody.appendChild(row);
            });
          }
        });

        // TableHelper用にグローバル参照を設定
        window.salesTableHelper = this.salesTableHelper;
      }

      // イベントリスナーを設定（重複を避けるため、一度削除してから再設定）
      const setupEventListeners = () => {
        const searchInput = document.getElementById('salesSearch');
        const ownerFilter = document.getElementById('salesOwnerFilter');
        const filterBtn = document.getElementById('filterSalesBtn');
        const clearBtn = document.getElementById('clearFilterBtn');
        const sortableHeaders = document.querySelectorAll('#salesTable th.sortable');

        // 既存のイベントを削除するため、新しい要素で置き換え
        if (searchInput) {
          const newSearchInput = searchInput.cloneNode(true);
          searchInput.parentNode.replaceChild(newSearchInput, searchInput);
          newSearchInput.addEventListener('input', () => {
            this.applySalesFilters();
          });
        }

        if (ownerFilter) {
          const newOwnerFilter = ownerFilter.cloneNode(true);
          ownerFilter.parentNode.replaceChild(newOwnerFilter, ownerFilter);
          newOwnerFilter.addEventListener('change', () => {
            this.applySalesFilters();
          });
        }

        if (filterBtn) {
          const newFilterBtn = filterBtn.cloneNode(true);
          filterBtn.parentNode.replaceChild(newFilterBtn, filterBtn);
          newFilterBtn.addEventListener('click', () => {
            this.applySalesFilters();
          });
        }

        if (clearBtn) {
          const newClearBtn = clearBtn.cloneNode(true);
          clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
          newClearBtn.addEventListener('click', () => {
            document.getElementById('salesSearch').value = '';
            document.getElementById('startDate').value = '';
            document.getElementById('endDate').value = '';
            const ownerFilterEl = document.getElementById('salesOwnerFilter');
            if (ownerFilterEl) ownerFilterEl.value = 'all';
            this.applySalesFilters();
          });
        }

        // ソートヘッダー
        sortableHeaders.forEach(th => {
          const newTh = th.cloneNode(true);
          th.parentNode.replaceChild(newTh, th);
          newTh.addEventListener('click', () => {
            const column = newTh.dataset.column;
            this.salesTableHelper.setSort(column);
            // ソート状態を表示に反映
            document.querySelectorAll('#salesTable th.sortable').forEach(h => {
              h.classList.remove('sorted-asc', 'sorted-desc');
            });
            newTh.classList.add(this.salesTableHelper.sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
          });
        });
      };

      setupEventListeners();

      // デフォルトのソート表示を設定
      const defaultSortHeader = document.querySelector(`#salesTable th.sortable[data-column="sale_date"]`);
      if (defaultSortHeader) {
        defaultSortHeader.classList.add('sorted-desc');
      }

      // データを正規化（商品名を直接プロパティに、ソート用にフラット化）
      const normalizedData = sales.data.map(sale => {
        const saleDate = new Date(sale.sale_date);
        return {
          ...sale,
          sale_date: saleDate,
          sale_date_timestamp: saleDate.getTime(), // ソート用タイムスタンプ
          product_name: sale.product?.name || sale.products?.name || '-',
          // 元の商品オブジェクトも保持（表示用）
          product: sale.product || sale.products
        };
      });

      this.salesTableHelper.setData(normalizedData);
      this.applySalesFilters();

    } catch (error) {
      errorLog('Load sales error:', error);
    }
  }

  /**
   * 売上フィルタを適用
   */
  applySalesFilters() {
    if (!this.salesTableHelper) return;

    const searchText = document.getElementById('salesSearch')?.value || '';
    const startDate = document.getElementById('startDate')?.value;
    const endDate = document.getElementById('endDate')?.value;
    const ownerFilter = document.getElementById('salesOwnerFilter')?.value || 'all';

    // 現在のユーザーのagency_idを取得
    const userStr = localStorage.getItem('agency_system_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentAgencyId = currentUser?.agency_id;

    this.salesTableHelper.setFilters({
      search: (sale) => {
        if (!searchText) return true;
        const text = searchText.toLowerCase();
        return sale.customer_name?.toLowerCase().includes(text) ||
               sale.product_name?.toLowerCase().includes(text) ||
               sale.sale_number?.toLowerCase().includes(text);
      },
      date_range: (sale) => {
        if (!startDate && !endDate) return true;
        const saleDate = sale.sale_date;
        if (startDate && saleDate < new Date(startDate)) return false;
        if (endDate && saleDate > new Date(endDate + 'T23:59:59')) return false;
        return true;
      },
      owner: (sale) => {
        // 管理者の場合、または代理店ユーザーでない場合はフィルター不要
        if (!currentAgencyId || ownerFilter === 'all') return true;

        // 自社のみ
        if (ownerFilter === 'own') {
          return sale.agency_id === currentAgencyId;
        }

        // 下位のみ
        if (ownerFilter === 'subordinate') {
          return sale.agency_id !== currentAgencyId;
        }

        return true;
      }
    });
  }

  /**
   * 報酬ステータスバッジを取得
   */
  getCommissionStatusBadge(commission) {
    let badge = '';
    let statusText = '';
    let additionalInfo = '';

    switch(commission.status) {
      case 'paid':
        badge = 'success';
        statusText = '支払済';
        break;
      case 'confirmed':
      case 'approved':  // approvedも確定として扱う
        badge = 'info';
        statusText = '確定';
        break;
      case 'pending':
        badge = 'warning';
        statusText = '未確定';
        break;
      case 'carried_forward':
        badge = 'secondary';
        statusText = '繰越';
        if (commission.carry_forward_reason) {
          additionalInfo = `<br><small class="text-muted">${commission.carry_forward_reason}</small>`;
        }
        break;
      default:
        badge = 'light';
        statusText = commission.status || '未設定';
    }

    return `<span class="badge badge-${badge}">${statusText}</span>${additionalInfo}`;
  }

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

  /**
   * 代理店詳細表示
   */
  async viewAgency(agencyId) {
    try {
      // 代理店情報を取得
      const agency = await agenciesAPI.getAgency(agencyId);

      if (!agency) {
        alert('代理店情報が取得できませんでした');
        return;
      }

      const agencyData = agency;

      // モーダルに詳細情報を表示
      const modalBody = document.getElementById('modalBody');
      modalBody.innerHTML = `
        <div class="agency-detail">
          <h2>代理店詳細</h2>

          <div class="detail-section">
            <h3>基本情報</h3>
            <table class="detail-table">
              <tr>
                <th>代理店コード</th>
                <td>${agencyData.agency_code || '-'}</td>
              </tr>
              <tr>
                <th>会社名</th>
                <td>${agencyData.company_name || '-'}</td>
              </tr>
              <tr>
                <th>会社種別</th>
                <td>${agencyData.company_type || '-'}</td>
              </tr>
              <tr>
                <th>階層</th>
                <td>Tier ${agencyData.tier_level || '-'}</td>
              </tr>
              <tr>
                <th>ステータス</th>
                <td>
                  <span class="status-badge ${agencyData.status === 'active' ? 'active' : 'pending'}">
                    ${agencyData.status === 'active' ? '承認済み' : '未承認'}
                  </span>
                </td>
              </tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>代表者情報</h3>
            <table class="detail-table">
              <tr>
                <th>代表者名</th>
                <td>${agencyData.representative_name || '-'}</td>
              </tr>
              <tr>
                <th>電話番号</th>
                <td>${agencyData.representative_phone || '-'}</td>
              </tr>
              <tr>
                <th>生年月日</th>
                <td>${agencyData.birth_date ? new Date(agencyData.birth_date).toLocaleDateString() : '-'}</td>
              </tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>連絡先情報</h3>
            <table class="detail-table">
              <tr>
                <th>メールアドレス</th>
                <td>${agencyData.contact_email || agencyData.email || '-'}</td>
              </tr>
              <tr>
                <th>電話番号</th>
                <td>${agencyData.contact_phone || '-'}</td>
              </tr>
              <tr>
                <th>住所</th>
                <td>${agencyData.address || '-'}</td>
              </tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>金融情報</h3>
            <table class="detail-table">
              <tr>
                <th>インボイス番号</th>
                <td>${agencyData.invoice_number || '-'}</td>
              </tr>
              ${agencyData.bank_account ? `
              <tr>
                <th>銀行名</th>
                <td>${agencyData.bank_account.bank_name || '-'}</td>
              </tr>
              <tr>
                <th>支店名</th>
                <td>${agencyData.bank_account.branch_name || '-'}</td>
              </tr>
              <tr>
                <th>口座種別</th>
                <td>${agencyData.bank_account.account_type || '-'}</td>
              </tr>
              <tr>
                <th>口座番号</th>
                <td>${agencyData.bank_account.account_number || '-'}</td>
              </tr>
              <tr>
                <th>口座名義</th>
                <td>${agencyData.bank_account.account_holder || '-'}</td>
              </tr>
              ` : `
              <tr>
                <th>銀行口座</th>
                <td>未登録</td>
              </tr>
              `}
            </table>
          </div>

          <div class="detail-section">
            <h3>税務情報</h3>
            <table class="detail-table">
              ${agencyData.tax_info ? `
              <tr>
                <th>法人番号</th>
                <td>${agencyData.tax_info.tax_id || '-'}</td>
              </tr>
              <tr>
                <th>税務署</th>
                <td>${agencyData.tax_info.tax_office || '-'}</td>
              </tr>
              ` : `
              <tr>
                <th>税務情報</th>
                <td>未登録</td>
              </tr>
              `}
            </table>
          </div>

          <div class="detail-section">
            <h3>システム情報</h3>
            <table class="detail-table">
              <tr>
                <th>登録日</th>
                <td>${agencyData.created_at ? new Date(agencyData.created_at).toLocaleDateString() : '-'}</td>
              </tr>
              <tr>
                <th>更新日</th>
                <td>${agencyData.updated_at ? new Date(agencyData.updated_at).toLocaleDateString() : '-'}</td>
              </tr>
              <tr>
                <th>親代理店</th>
                <td>${agencyData.parent_agency_name || '-'}</td>
              </tr>
            </table>
          </div>

          <div class="detail-section">
            <div id="documentsSection"></div>
          </div>

          <div class="detail-section">
            <h3>登録履歴</h3>
            <div id="registrationHistory">
              <div class="loading">履歴を読み込み中...</div>
            </div>
          </div>

          <div class="modal-buttons">
            ${authAPI.isAdmin() ? `
              <button class="btn btn-warning" onclick="app.editAgency('${agencyData.id}')">編集</button>
              <button class="btn btn-danger" onclick="app.deleteAgency('${agencyData.id}')">削除</button>
            ` : (this.user && this.user.role === 'agency' && this.user.agency && this.user.agency.id === agencyData.id) ? `
              <button class="btn btn-warning" onclick="app.editAgency('${agencyData.id}')">自社情報を編集</button>
            ` : ''}
            <button class="btn btn-secondary" onclick="app.closeModal()">閉じる</button>
          </div>
        </div>
      `;

      // モーダルを表示
      this.openModal();

      // 書類管理セクションを初期化
      const companyType = agencyData.company_type || 'corporation';
      const isAdmin = this.user && this.user.role === 'admin';

      // DocumentsManagerのインスタンスを作成
      if (typeof window.DocumentsManager !== 'undefined') {
        window.documentsManager = new window.DocumentsManager(agencyId);

        // 書類セクションのHTMLを挿入
        const documentsSection = document.getElementById('documentsSection');
        if (documentsSection) {
          documentsSection.innerHTML = window.documentsManager.getDocumentsSectionHTML(isAdmin, companyType);
          // 書類一覧を読み込み
          window.documentsManager.loadDocuments();
        }
      } else {
        console.error('DocumentsManager is not defined');
      }

      // 登録履歴を読み込み
      this.loadRegistrationHistory(agencyId);

    } catch (error) {
      console.error('View agency error:', error);
      alert('代理店情報の取得に失敗しました');
    }
  }

  /**
   * 登録履歴読み込み
   */
  async loadRegistrationHistory(agencyId) {
    try {
      const historyContainer = document.getElementById('registrationHistory');
      if (!historyContainer) return;

      const historyData = await agenciesAPI.getAgencyHistory(agencyId);

      if (!historyData || historyData.length === 0) {
        historyContainer.innerHTML = '<p class="no-history">履歴がありません</p>';
        return;
      }

      let historyHTML = '<div class="history-timeline">';

      historyData.forEach(item => {
        const date = new Date(item.date).toLocaleDateString('ja-JP');
        const statusClass = item.status === 'active' || item.status === 'accepted' ? 'success' :
                           item.status === 'pending' || item.status === 'sent' ? 'warning' : 'info';

        historyHTML += `
          <div class="history-item">
            <div class="history-date">${date}</div>
            <div class="history-content">
              <div class="history-type ${statusClass}">${item.description}</div>
              <div class="history-details">
                ${item.type === 'registration' ?
                  `ステータス: ${item.details.status}, 階層: Tier ${item.details.tier_level}` :
                  `メール: ${item.details.email || ''}`
                }
              </div>
            </div>
          </div>
        `;
      });

      historyHTML += '</div>';
      historyContainer.innerHTML = historyHTML;

    } catch (error) {
      console.error('Load registration history error:', error);
      const historyContainer = document.getElementById('registrationHistory');
      if (historyContainer) {
        historyContainer.innerHTML = '<p class="error">履歴の読み込みに失敗しました</p>';
      }
    }
  }

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

  /**
   * 代理店編集
   */
  async editAgency(agencyId) {
    try {
      // 代理店情報を取得
      const agency = await agenciesAPI.getAgency(agencyId);
      if (!agency) {
        alert('代理店情報が取得できませんでした');
        return;
      }

      // モーダルに編集フォームを表示
      const modalBody = document.getElementById('modalBody');
      modalBody.innerHTML = `
        <div class="agency-edit">
          <h2>代理店編集</h2>
          <form id="editAgencyForm">
            <div class="form-section">
              <h3>基本情報</h3>
              <div class="form-group">
                <label for="edit_company_name">会社名 *</label>
                <input type="text" id="edit_company_name" value="${agency.company_name || ''}" required>
              </div>
              <div class="form-group">
                <label for="edit_company_type">会社種別 *</label>
                <select id="edit_company_type">
                  <option value="法人" ${agency.company_type === '法人' ? 'selected' : ''}>法人</option>
                  <option value="個人" ${agency.company_type === '個人' ? 'selected' : ''}>個人</option>
                </select>
              </div>
              <div class="form-group">
                <label for="edit_representative_name">代表者名 *</label>
                <input type="text" id="edit_representative_name" value="${agency.representative_name || ''}" required>
              </div>
            </div>

            <div class="form-section">
              <h3>連絡先情報</h3>
              <div class="form-group">
                <label for="edit_representative_phone">代表者電話番号</label>
                <input type="tel" id="edit_representative_phone" value="${agency.representative_phone || ''}">
              </div>
              <div class="form-group">
                <label for="edit_birth_date">生年月日</label>
                <input type="date" id="edit_birth_date" value="${agency.birth_date || ''}">
              </div>
            </div>

            <div class="form-section">
              <h3>銀行口座情報</h3>
              <div class="form-group">
                <label for="edit_bank_name">銀行名</label>
                <input type="text" id="edit_bank_name" value="${agency.bank_account?.bank_name || ''}" placeholder="例：みずほ銀行">
              </div>
              <div class="form-group">
                <label for="edit_branch_name">支店名</label>
                <input type="text" id="edit_branch_name" value="${agency.bank_account?.branch_name || ''}" placeholder="例：新宿支店">
              </div>
              <div class="form-group">
                <label for="edit_account_type">口座種別</label>
                <select id="edit_account_type">
                  <option value="">選択してください</option>
                  <option value="普通" ${agency.bank_account?.account_type === '普通' ? 'selected' : ''}>普通</option>
                  <option value="当座" ${agency.bank_account?.account_type === '当座' ? 'selected' : ''}>当座</option>
                  <option value="貯蓄" ${agency.bank_account?.account_type === '貯蓄' ? 'selected' : ''}>貯蓄</option>
                </select>
              </div>
              <div class="form-group">
                <label for="edit_account_number">口座番号</label>
                <input type="text" id="edit_account_number" value="${agency.bank_account?.account_number || ''}" placeholder="例：1234567">
              </div>
              <div class="form-group">
                <label for="edit_account_holder">口座名義</label>
                <input type="text" id="edit_account_holder" value="${agency.bank_account?.account_holder || ''}" placeholder="例：カブシキガイシャ エービーシー">
              </div>
            </div>

            <div class="form-section">
              <h3>税務情報</h3>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="edit_invoice_registered" ${agency.invoice_registered ? 'checked' : ''}>
                  インボイス登録事業者
                </label>
                <small class="text-muted">適格請求書発行事業者として登録済みの場合はチェックしてください</small>
              </div>
              <div class="form-group">
                <label for="edit_invoice_number">インボイス登録番号</label>
                <input type="text" id="edit_invoice_number" value="${agency.invoice_number || ''}" placeholder="例：T1234567890123">
              </div>
              <div class="form-group">
                <label for="edit_tax_id">法人番号</label>
                <input type="text" id="edit_tax_id" value="${agency.tax_info?.tax_id || ''}" placeholder="例：1234567890123">
              </div>
              <div class="form-group">
                <label for="edit_tax_office">税務署</label>
                <input type="text" id="edit_tax_office" value="${agency.tax_info?.tax_office || ''}" placeholder="例：新宿税務署">
              </div>
            </div>

            <div class="modal-buttons">
              <button type="submit" class="btn btn-primary">保存</button>
              <button type="button" class="btn btn-secondary" onclick="app.closeModal()">キャンセル</button>
            </div>
          </form>
        </div>
      `;

      // フォーム送信イベント
      document.getElementById('editAgencyForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        // 生年月日の年齢確認
        const birthDateInput = document.getElementById('edit_birth_date');
        if (birthDateInput && birthDateInput.value) {
          const validation = window.ageValidator.validateAge(birthDateInput.value);
          if (!validation.isValid) {
            alert(validation.message);
            return;
          }
        }

        await this.saveAgencyChanges(agencyId);
      });

      // 生年月日フィールドに年齢バリデーションを追加
      const birthDateInput = document.getElementById('edit_birth_date');
      if (birthDateInput && window.ageValidator) {
        window.ageValidator.attachAgeValidation(birthDateInput);
      }

    } catch (error) {
      console.error('Edit agency error:', error);
      alert('代理店編集画面の表示に失敗しました');
    }
  }

  /**
   * 代理店編集内容を保存
   */
  async saveAgencyChanges(agencyId) {
    try {
      // 銀行口座情報をJSON形式で構築
      const bankName = document.getElementById('edit_bank_name').value;
      const branchName = document.getElementById('edit_branch_name').value;
      const accountType = document.getElementById('edit_account_type').value;
      const accountNumber = document.getElementById('edit_account_number').value;
      const accountHolder = document.getElementById('edit_account_holder').value;

      let bankAccount = null;
      if (bankName || branchName || accountType || accountNumber || accountHolder) {
        bankAccount = {
          bank_name: bankName || null,
          branch_name: branchName || null,
          account_type: accountType || null,
          account_number: accountNumber || null,
          account_holder: accountHolder || null
        };
      }

      // 税務情報をJSON形式で構築
      const taxId = document.getElementById('edit_tax_id').value;
      const taxOffice = document.getElementById('edit_tax_office').value;

      let taxInfo = null;
      if (taxId || taxOffice) {
        taxInfo = {
          tax_id: taxId || null,
          tax_office: taxOffice || null
        };
      }

      const formData = {
        company_name: document.getElementById('edit_company_name').value,
        company_type: document.getElementById('edit_company_type').value,
        representative_name: document.getElementById('edit_representative_name').value,
        representative_phone: document.getElementById('edit_representative_phone').value,
        birth_date: document.getElementById('edit_birth_date').value || null,
        invoice_registered: document.getElementById('edit_invoice_registered').checked,
        invoice_number: document.getElementById('edit_invoice_number').value || null,
        bank_account: bankAccount,
        tax_info: taxInfo
      };

      await agenciesAPI.updateAgency(agencyId, formData);
      alert('代理店情報を更新しました');
      this.closeModal();
      await this.loadAgencies(); // 一覧を再読み込み

    } catch (error) {
      console.error('Save agency changes error:', error);
      alert('代理店情報の更新に失敗しました');
    }
  }

  /**
   * 代理店削除
   */
  async deleteAgency(agencyId) {
    if (!confirm('この代理店を削除してもよろしいですか？\n※この操作は取り消せません')) {
      return;
    }

    try {
      // 削除APIを実行
      await agenciesAPI.delete(agencyId);

      alert('代理店を削除しました');
      this.closeModal();
      await this.loadAgencies();

    } catch (error) {
      console.error('Delete agency error:', error);
      alert(error.message || '代理店の削除に失敗しました');
    }
  }

  /**
   * 代理店承認
   */
  async approveAgency(id) {
    if (confirm('この代理店を承認しますか？')) {
      try {
        const result = await agenciesAPI.approveAgency(id);
        alert(result.message || '承認しました');
        await this.loadAgencies();
      } catch (error) {
        alert(error.response?.data?.message || '承認に失敗しました');
      }
    }
  }

  /**
   * 代理店拒否
   */
  async rejectAgency(id) {
    const rejectionReason = prompt('拒否理由を入力してください:');
    if (rejectionReason && rejectionReason.trim()) {
      if (confirm('この代理店を拒否しますか？')) {
        try {
          const result = await agenciesAPI.rejectAgency(id, rejectionReason.trim());
          alert(result.message || '拒否しました');
          await this.loadAgencies();
        } catch (error) {
          alert(error.response?.data?.message || '拒否に失敗しました');
        }
      }
    } else {
      alert('拒否理由は必須です');
    }
  }

  /**
   * 代理店停止
   */
  async suspendAgency(id) {
    console.log('suspendAgency called with id:', id);
    const suspensionReason = prompt('停止理由を入力してください:');
    console.log('suspension reason:', suspensionReason);
    if (suspensionReason && suspensionReason.trim()) {
      if (confirm('この代理店を停止しますか？')) {
        try {
          console.log('Calling API to suspend agency...');
          const result = await agenciesAPI.suspendAgency(id, suspensionReason.trim());
          console.log('API result:', result);
          alert(result.message || '停止しました');
          await this.loadAgencies();
        } catch (error) {
          console.error('Suspend agency error:', error);
          alert(error.response?.data?.message || '停止に失敗しました');
        }
      }
    } else {
      alert('停止理由は必須です');
    }
  }

  /**
   * 代理店再有効化
   */
  async reactivateAgency(id) {
    if (confirm('この代理店を再有効化しますか？')) {
      try {
        console.log('Calling reactivateAgency for id:', id);
        const result = await agenciesAPI.reactivateAgency(id);
        console.log('Reactivate result:', result);
        alert(result.message || '再有効化しました');
        await this.loadAgencies();
      } catch (error) {
        console.error('Reactivate agency full error:', error);
        console.error('Error response:', error.response);
        alert(error.response?.data?.message || error.message || '再有効化に失敗しました');
      }
    }
  }

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

  /**
   * 売上詳細表示
   */
  async showSaleDetail(saleId) {
    try {
      console.log('showSaleDetail called with saleId:', saleId);
      // 売上情報を取得
      const response = await apiClient.get(`/sales/${saleId}`);
      console.log('Sale detail API response:', response);

      if (!response || !response.success) {
        console.error('Invalid response:', response);
        alert('売上情報が取得できませんでした');
        return;
      }

      const sale = response.data;
      console.log('Sale data:', sale);

      // モーダルに詳細情報を表示
      const modalBody = document.getElementById('modalBody');
      if (!modalBody) {
        console.error('modalBody element not found');
        alert('モーダル要素が見つかりません');
        return;
      }

      modalBody.innerHTML = `
        <div class="sale-detail">
          <h2>売上詳細</h2>
          <div class="detail-section">
            <h3>基本情報</h3>
            <table class="detail-table">
              <tr><th>売上番号</th><td>${sale.sale_number || '-'}</td></tr>
              <tr><th>売上日</th><td>${new Date(sale.sale_date).toLocaleDateString()}</td></tr>
              <tr><th>登録日時</th><td>${new Date(sale.created_at).toLocaleString()}</td></tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>販売代理店</h3>
            <table class="detail-table">
              <tr><th>代理店コード</th><td>${sale.agency?.agency_code || '-'}</td></tr>
              <tr><th>会社名</th><td>${sale.agency?.company_name || '-'}</td></tr>
              <tr><th>階層</th><td>${sale.agency ? 'Tier ' + sale.agency.tier_level : '-'}</td></tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>顧客情報</h3>
            <table class="detail-table">
              <tr><th>顧客名</th><td>${sale.customer_name || '-'}</td></tr>
              <tr><th>メールアドレス</th><td>${sale.customer_email || '-'}</td></tr>
              <tr><th>電話番号</th><td>${sale.customer_phone || '-'}</td></tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>商品・金額情報</h3>
            <table class="detail-table">
              <tr><th>商品名</th><td>${sale.product?.name || sale.products?.name || '-'}</td></tr>
              <tr><th>数量</th><td>${sale.quantity}</td></tr>
              <tr><th>単価</th><td>¥${sale.unit_price?.toLocaleString() || '-'}</td></tr>
              <tr><th>合計金額</th><td><strong>¥${sale.total_amount.toLocaleString()}</strong></td></tr>
            </table>
          </div>

          ${sale.notes ? `
          <div class="detail-section">
            <h3>備考</h3>
            <p>${sale.notes}</p>
          </div>
          ` : ''}

          <div class="modal-buttons">
            ${authAPI.isAdmin() ? `
              <button class="btn btn-primary" onclick="app.editSale('${sale.id}')">編集</button>
              <button class="btn btn-danger" onclick="app.deleteSale('${sale.id}')">削除</button>
            ` : ''}
            <button class="btn btn-secondary" onclick="app.hideModal()">閉じる</button>
          </div>
        </div>
      `;

      // モーダル表示
      const modal = document.getElementById('modal');
      if (!modal) {
        console.error('modal element not found');
        alert('モーダル要素が見つかりません');
        return;
      }
      console.log('Showing modal');
      modal.classList.remove('hidden');

    } catch (error) {
      console.error('Show sale detail error:', error);
      console.error('Error stack:', error.stack);
      alert('売上詳細の取得に失敗しました: ' + error.message);
    }
  }

  /**
   * 売上編集（既存の機能をここで呼び出し）
   */
  async editSale(saleId) {
    try {
      // 売上情報を取得
      const response = await apiClient.get(`/sales/${saleId}`);
      if (!response || !response.success) {
        alert('売上情報の取得に失敗しました');
        return;
      }

      const sale = response.data;

      // 商品一覧を取得
      const productsResponse = await apiClient.get('/products');
      const products = productsResponse.data || [];

      // 編集フォームを表示
      const modalBody = document.getElementById('modalBody');
      modalBody.innerHTML = `
        <div class="sale-edit">
          <h2>売上編集</h2>
          <form id="editSaleForm">
            <div class="form-group">
              <label for="saleDate">売上日*</label>
              <input type="date" id="saleDate" value="${sale.sale_date.split('T')[0]}" required>
            </div>

            <div class="form-group">
              <label for="customerName">顧客名*</label>
              <input type="text" id="customerName" value="${sale.customer_name || ''}" required>
            </div>

            <div class="form-group">
              <label for="customerEmail">メールアドレス</label>
              <input type="email" id="customerEmail" value="${sale.customer_email || ''}">
            </div>

            <div class="form-group">
              <label for="customerPhone">電話番号</label>
              <input type="tel" id="customerPhone" value="${sale.customer_phone || ''}">
            </div>

            <div class="form-group">
              <label for="productId">商品*</label>
              <select id="productId" required>
                ${products.map(p => `<option value="${p.id}" ${sale.product_id === p.id ? 'selected' : ''}>${p.name} (¥${p.price.toLocaleString()})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="quantity">数量*</label>
              <input type="number" id="quantity" value="${sale.quantity}" min="1" required>
            </div>

            <div class="form-group">
              <label for="unitPrice">単価*</label>
              <input type="number" id="unitPrice" value="${sale.unit_price}" min="0" required>
            </div>

            <div class="form-group">
              <label for="notes">備考</label>
              <textarea id="notes" rows="3">${sale.notes || ''}</textarea>
            </div>

            <div class="form-group">
              <label for="status">ステータス</label>
              <select id="status">
                <option value="active" ${sale.status === 'active' ? 'selected' : ''}>有効</option>
                <option value="cancelled" ${sale.status === 'cancelled' ? 'selected' : ''}>キャンセル</option>
              </select>
            </div>

            <div class="modal-buttons">
              <button type="submit" class="btn btn-primary">保存</button>
              <button type="button" class="btn btn-secondary" onclick="app.hideModal()">キャンセル</button>
            </div>
          </form>
        </div>
      `;

      // フォーム送信イベント
      document.getElementById('editSaleForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updateData = {
          sale_date: document.getElementById('saleDate').value,
          customer_name: document.getElementById('customerName').value,
          customer_email: document.getElementById('customerEmail').value,
          customer_phone: document.getElementById('customerPhone').value,
          product_id: document.getElementById('productId').value,
          quantity: parseInt(document.getElementById('quantity').value),
          unit_price: parseFloat(document.getElementById('unitPrice').value),
          notes: document.getElementById('notes').value,
          status: document.getElementById('status').value
        };

        try {
          const result = await apiClient.put(`/sales/${saleId}`, updateData);
          if (result.success) {
            alert('売上情報を更新しました');
            this.hideModal();
            await this.loadSales(true);
          } else {
            alert(result.message || '更新に失敗しました');
          }
        } catch (error) {
          console.error('Update sale error:', error);
          alert('エラーが発生しました');
        }
      });

      // モーダルを表示
      this.openModal();

    } catch (error) {
      console.error('Edit sale error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * 売上削除
   */
  async deleteSale(saleId) {
    if (!confirm('この売上情報を完全に削除しますか？\n※この操作は取り消せません。関連する報酬データも削除されます')) {
      return;
    }

    try {
      const result = await apiClient.delete(`/sales/${saleId}`);
      if (result.success) {
        alert('売上情報を削除しました');
        this.hideModal();
        await this.loadSales(true);
      } else {
        alert(result.message || '削除に失敗しました');
      }
    } catch (error) {
      console.error('Delete sale error:', error);
      alert('エラーが発生しました');
    }
  }

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
   * 代理店承認
   */
  async approveAgency(agencyId) {
    if (!confirm('この代理店を承認しますか？')) {
      return;
    }

    try {
      const response = await apiClient.put(`/agencies/${agencyId}/approve`);
      if (response.success) {
        alert('代理店を承認しました');
        await this.loadAgencies();
      } else {
        alert(response.message || '承認に失敗しました');
      }
    } catch (error) {
      console.error('Approve agency error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * 代理店却下
   */
  async rejectAgency(agencyId) {
    const reason = prompt('却下理由を入力してください：');
    if (!reason) {
      return;
    }

    try {
      const response = await apiClient.put(`/agencies/${agencyId}/reject`, {
        rejection_reason: reason
      });

      if (response.success) {
        alert('代理店を却下しました');
        await this.loadAgencies();
      } else {
        alert(response.message || '却下に失敗しました');
      }
    } catch (error) {
      console.error('Reject agency error:', error);
      alert('エラーが発生しました');
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

  /**
   * 新規代理店作成モーダル表示
   */
  async showCreateAgencyModal() {
    // まず全代理店データを取得
    const allAgencies = await agenciesAPI.getAgencies();

    // 現在のユーザー情報を取得
    const currentUser = authAPI.getCurrentUser();
    const isAdmin = authAPI.isAdmin();
    const userAgency = currentUser?.agency;

    // 権限に応じた説明文を追加
    const headerText = isAdmin ?
      '新規代理店登録（管理者権限）' :
      '新規代理店登録（下位代理店の追加）';

    const noticeText = !isAdmin && userAgency ?
      `<div class="info-message">
        <i class="fas fa-info-circle"></i>
        あなたの下位代理店（Tier ${userAgency.tier_level + 1}）として登録されます。
        管理者による承認が必要です。
      </div>` : '';


    const modalContent = `
      <h3>${headerText}</h3>
      ${noticeText}
      <form id="createAgencyForm">
        <div class="form-group">
          <label for="agencyName">会社名 <span class="required">*</span></label>
          <input type="text" id="agencyName" required>
        </div>
        <div class="form-group">
          <label for="agencyRepresentative">代表者名 <span class="required">*</span></label>
          <input type="text" id="agencyRepresentative" required>
        </div>
        <div class="form-group">
          <label for="agencyBirthDate">代表者生年月日</label>
          <input type="date" id="agencyBirthDate">
          <small class="text-muted">18歳以上である必要があります（任意）</small>
        </div>
        <div class="form-group">
          <label for="agencyEmail">メールアドレス <span class="required">*</span></label>
          <input type="email" id="agencyEmail" required>
        </div>
        <div class="form-group">
          <label for="agencyTier">階層 <span class="required">*</span></label>
          <select id="agencyTier" required>
            <option value="">選択してください</option>
            ${isAdmin ? `
            <option value="1">Tier 1 (トップレベル)</option>
            <option value="2">Tier 2</option>
            <option value="3">Tier 3</option>
            <option value="4">Tier 4</option>
            ` : userAgency ? `
            <option value="${userAgency.tier_level + 1}" selected>Tier ${userAgency.tier_level + 1}</option>
            ` : ''}
          </select>
        </div>
        <div class="form-group" id="parentAgencyGroup" style="display: ${isAdmin ? 'none' : 'block'};">
          <label for="parentAgency">親代理店 <span class="required">*</span></label>
          <select id="parentAgency" ${!isAdmin && userAgency ? 'disabled' : ''}>
            ${!isAdmin && userAgency ?
              `<option value="${userAgency.id}" selected>${userAgency.company_name} (自分)</option>` :
              '<option value="">選択してください</option>'
            }
          </select>
        </div>
        <div class="form-group">
          <label for="agencyPhone">電話番号</label>
          <input type="tel" id="agencyPhone">
        </div>
        <div class="form-group">
          <label for="agencyAddress">住所</label>
          <textarea id="agencyAddress" rows="3"></textarea>
        </div>
        <div class="form-group">
          <label for="agencyType">会社種別</label>
          <select id="agencyType">
            <option value="法人">法人</option>
            <option value="個人">個人</option>
          </select>
        </div>
        <div class="form-group">
          <label>
            <input type="checkbox" id="agencyInvoiceRegistered">
            インボイス登録事業者ですか？
          </label>
          <small class="text-muted">適格請求書発行事業者として登録済みの場合はチェックしてください</small>
        </div>
        <button type="submit" class="btn btn-primary">
          ${isAdmin ? '登録' : '登録申請'}
        </button>
        <button type="button" class="btn" onclick="app.hideModal()">キャンセル</button>
      </form>
    `;

    this.showModal(modalContent);

    // 生年月日フィールドに年齢検証を追加
    setTimeout(() => {
      const birthDateInput = document.getElementById('agencyBirthDate');
      if (birthDateInput && window.ageValidator) {
        window.ageValidator.attachAgeValidation(birthDateInput);
      }
    }, 100);

    // Tier選択時のイベントハンドラ
    setTimeout(() => {
      const tierSelect = document.getElementById('agencyTier');
      const parentGroup = document.getElementById('parentAgencyGroup');
      const parentSelect = document.getElementById('parentAgency');

      tierSelect?.addEventListener('change', () => {
        const selectedTier = parseInt(tierSelect.value);

        // 代理店ユーザーの場合は親代理店が固定
        if (!isAdmin && userAgency) {
          parentGroup.style.display = 'none';
          parentSelect.removeAttribute('required');
          parentSelect.value = '';
        } else if (selectedTier === 1 || !selectedTier) {
          // Tier 1 または未選択の場合は親代理店選択を非表示
          parentGroup.style.display = 'none';
          parentSelect.removeAttribute('required');
          parentSelect.value = '';
        } else {
          // Tier 2-4の場合は親代理店選択を表示
          parentGroup.style.display = 'block';
          parentSelect.setAttribute('required', 'required');

          // 親となる代理店のリストを更新（1つ上の階層の代理店のみ）
          const parentTier = selectedTier - 1;
          const parentAgencies = allAgencies.filter(a =>
            a.tier_level === parentTier && a.status === 'active'
          );

          // 選択肢を更新
          parentSelect.innerHTML = '<option value="">選択してください</option>';
          parentAgencies.forEach(agency => {
            const option = document.createElement('option');
            option.value = agency.id;
            option.textContent = `${agency.company_name} (${agency.agency_code})`;
            parentSelect.appendChild(option);
          });

          if (parentAgencies.length === 0) {
            parentSelect.innerHTML = '<option value="">親代理店が存在しません</option>';
          }
        }
      });

      // フォーム送信イベント
      document.getElementById('createAgencyForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.createAgency();
      });
    }, 100);
  }

  /**
   * 代理店作成
   */
  async createAgency() {
    // 年齢検証
    const birthDate = document.getElementById('agencyBirthDate').value;
    if (birthDate && window.ageValidator) {
      const ageValidation = window.ageValidator.validateAge(birthDate);
      if (!ageValidation.isValid) {
        alert(ageValidation.message);
        return;
      }
    }

    const currentUser = authAPI.getCurrentUser();
    const isAdmin = authAPI.isAdmin();
    const userAgency = currentUser?.agency;

    const tierLevel = parseInt(document.getElementById('agencyTier').value);
    let parentAgencyId = document.getElementById('parentAgency')?.value;

    // 代理店ユーザーの場合は親代理店IDを自動設定
    if (!isAdmin && userAgency) {
      parentAgencyId = userAgency.id;
    }

    const data = {
      company_name: document.getElementById('agencyName').value,
      representative_name: document.getElementById('agencyRepresentative').value,
      birth_date: birthDate,
      contact_email: document.getElementById('agencyEmail').value,
      representative_email: document.getElementById('agencyEmail').value, // バックエンドの期待フィールド追加
      tier_level: tierLevel,
      contact_phone: document.getElementById('agencyPhone').value,
      address: document.getElementById('agencyAddress').value,
      company_type: document.getElementById('agencyType').value || '法人',
      invoice_registered: document.getElementById('agencyInvoiceRegistered').checked,
      // 代理店ユーザーが作成した場合はpending、管理者はactive
      status: isAdmin ? 'active' : 'pending',
      // 作成者情報を追加
      created_by_user_id: currentUser.id,
      created_by_agency_id: userAgency?.id
    };

    // Tier 2以上の場合、または代理店ユーザーの場合は親代理店IDを追加
    if ((tierLevel > 1 || (!isAdmin && userAgency)) && parentAgencyId) {
      data.parent_agency_id = parentAgencyId;
    }

    // 常にメール送信する
    data.send_invitation_email = true;

    try {
      await agenciesAPI.createAgency(data);
      if (isAdmin) {
        alert('代理店を登録しました');
      } else {
        alert('代理店の登録申請を送信しました。管理者による承認をお待ちください。');
      }
      this.hideModal();
      await this.loadAgencies();
    } catch (error) {
      alert('登録に失敗しました: ' + error.message);
    }
  }

  /**
   * 新規売上作成モーダル表示
   */
  async showCreateSaleModal() {
    const currentUser = authAPI.getCurrentUser();
    const isAdmin = authAPI.isAdmin();
    const userAgency = currentUser?.agency;

    // 代理店と商品データを事前に取得
    const [agencies, products] = await Promise.all([
      agenciesAPI.getAgencies(),
      apiClient.get('/products')
    ]);

    // 管理者は全アクティブ代理店、代理店ユーザーは自分のみ
    let activeAgencies;
    if (isAdmin) {
      activeAgencies = agencies.filter(a => a.status === 'active');
    } else if (userAgency) {
      // 代理店ユーザーは自分の代理店と配下の代理店のみ
      activeAgencies = agencies.filter(a =>
        a.status === 'active' &&
        (a.id === userAgency.id || a.parent_agency_id === userAgency.id)
      );
    } else {
      activeAgencies = [];
    }

    const productsList = products.data || [];

    const modalContent = `
      <h3>新規売上登録</h3>
      <form id="createSaleForm">
        <div class="form-group">
          <label for="saleAgency">代理店*</label>
          <select id="saleAgency" required>
            <option value="">選択してください</option>
            ${activeAgencies.map(agency =>
              `<option value="${agency.id}">${agency.company_name} (Tier${agency.tier_level})</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="saleProduct">商品*</label>
          <select id="saleProduct" required>
            <option value="">選択してください</option>
            ${productsList.map(product =>
              `<option value="${product.id}"
                data-price="${product.price}"
                data-tier1-rate="${product.tier1_commission_rate || 10}"
                data-tier2-rate="${product.tier2_commission_rate || 8}"
                data-tier3-rate="${product.tier3_commission_rate || 6}"
                data-tier4-rate="${product.tier4_commission_rate || 4}"
                data-category="${product.category || ''}"
                >${product.name} - ¥${product.price.toLocaleString()}${product.category ? ` (${product.category})` : ''}</option>`
            ).join('')}
          </select>
        </div>
        <div id="productDetails" class="product-details hidden">
          <div class="detail-info">
            <span class="label">カテゴリ:</span>
            <span id="productCategory">-</span>
          </div>
          <div class="detail-info">
            <span class="label">報酬率:</span>
            <span id="productCommissionRate">-</span>
          </div>
        </div>
        <div class="form-group">
          <label for="saleQuantity">数量*</label>
          <input type="number" id="saleQuantity" min="1" value="1" required>
        </div>
        <div class="form-group">
          <label for="saleUnitPrice">単価</label>
          <input type="text" id="saleUnitPrice" readonly>
        </div>
        <div class="form-group">
          <label for="saleAmount">合計金額</label>
          <input type="text" id="saleAmount" readonly>
        </div>
        <div class="form-group" id="estimatedCommissionGroup" style="display: none;">
          <label>予想報酬額（参考）</label>
          <div id="estimatedCommission" class="estimated-commission">-</div>
        </div>
        <div class="form-group">
          <label for="saleDate">売上日*</label>
          <input type="date" id="saleDate" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <div class="form-group">
          <label for="customerName">顧客名*</label>
          <input type="text" id="customerName" required>
        </div>
        <div class="form-group">
          <label for="customerEmail">顧客メールアドレス</label>
          <input type="email" id="customerEmail">
        </div>
        <div class="form-group">
          <label for="customerPhone">顧客電話番号</label>
          <input type="tel" id="customerPhone">
        </div>
        <div class="form-group">
          <label for="saleNotes">備考</label>
          <textarea id="saleNotes" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">登録</button>
        <button type="button" class="btn" onclick="app.hideModal()">キャンセル</button>
      </form>
    `;

    this.showModal(modalContent);

    // イベントハンドラ設定
    setTimeout(() => {
      const agencySelect = document.getElementById('saleAgency');
      const productSelect = document.getElementById('saleProduct');
      const quantityInput = document.getElementById('saleQuantity');
      const unitPriceInput = document.getElementById('saleUnitPrice');
      const amountInput = document.getElementById('saleAmount');
      const productDetails = document.getElementById('productDetails');
      const estimatedCommissionGroup = document.getElementById('estimatedCommissionGroup');

      // 価格と詳細計算関数
      const updateProductDetails = () => {
        const selectedOption = productSelect.options[productSelect.selectedIndex];
        const selectedAgencyOption = agencySelect.options[agencySelect.selectedIndex];

        if (selectedOption && selectedOption.value) {
          const price = parseFloat(selectedOption.dataset.price) || 0;
          const quantity = parseInt(quantityInput.value) || 0;
          const total = price * quantity;
          const category = selectedOption.dataset.category || '-';

          // 単価と合計金額を更新
          unitPriceInput.value = `¥${price.toLocaleString()}`;
          amountInput.value = `¥${total.toLocaleString()}`;

          // 商品詳細を表示
          productDetails.classList.remove('hidden');
          document.getElementById('productCategory').textContent = category;

          // 選択された代理店のTierに応じた報酬率を表示
          if (selectedAgencyOption && selectedAgencyOption.value) {
            const agencyTier = parseInt(selectedAgencyOption.textContent.match(/Tier(\d)/)?.[1] || 1);
            const commissionRate = parseFloat(selectedOption.dataset[`tier${agencyTier}Rate`]) || 10;

            document.getElementById('productCommissionRate').textContent = `${commissionRate}%（Tier${agencyTier}）`;

            // 予想報酬額を計算して表示
            const estimatedCommission = Math.floor(total * commissionRate / 100);
            estimatedCommissionGroup.style.display = 'block';
            document.getElementById('estimatedCommission').innerHTML = `
              <strong>¥${estimatedCommission.toLocaleString()}</strong>
              <small>（売上 ¥${total.toLocaleString()} × ${commissionRate}%）</small>
            `;
          }

          return total;
        } else {
          // 商品未選択時は詳細を非表示
          productDetails.classList.add('hidden');
          estimatedCommissionGroup.style.display = 'none';
          unitPriceInput.value = '';
          amountInput.value = '';
          return 0;
        }
      };

      // イベントリスナー設定
      agencySelect?.addEventListener('change', updateProductDetails);
      productSelect?.addEventListener('change', updateProductDetails);
      quantityInput?.addEventListener('input', updateProductDetails);

      // フォーム送信イベント
      document.getElementById('createSaleForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await this.createSale();
      });
    }, 100);
  }

  /**
   * 売上作成
   */
  async createSale() {
    const productSelect = document.getElementById('saleProduct');
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const price = selectedOption ? parseFloat(selectedOption.dataset.price) || 0 : 0;
    const quantity = parseInt(document.getElementById('saleQuantity').value) || 0;

    const data = {
      agency_id: document.getElementById('saleAgency').value,
      product_id: document.getElementById('saleProduct').value,
      quantity: quantity,
      customer_name: document.getElementById('customerName').value,
      customer_email: document.getElementById('customerEmail').value || null,
      customer_phone: document.getElementById('customerPhone').value || null,
      sale_date: document.getElementById('saleDate').value,
      notes: document.getElementById('saleNotes').value || null,
      status: document.getElementById('saleStatus')?.value || 'confirmed'
    };

    try {
      const response = await apiClient.post('/sales', data);
      if (response.success) {
        alert('売上を登録しました');
        this.hideModal();

        // 現在のページが売上ページの場合はリロード
        if (this.currentPage === 'sales') {
          await this.loadSales();
        }
      }
    } catch (error) {
      alert('登録に失敗しました: ' + error.message);
    }
  }
}

// アプリケーション起動
const app = new App();
window.app = app;