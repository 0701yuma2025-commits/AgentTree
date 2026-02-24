/**
 * ダッシュボードページ
 */
class DashboardPage {
  constructor(app) {
    this.app = app;
    this.currentOrgSales = null;
    this.previousOrgSales = null;
  }

  async init() {
    await this.loadDashboard();
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
          document.getElementById('totalSales').textContent = `\u00A5${stats.sales.currentMonth.toLocaleString()}`;
          document.getElementById('totalSalesCount').textContent = `${stats.sales.currentMonthCount}\u4EF6`;

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
          document.getElementById('totalCommission').textContent = `\u00A5${stats.commissions.currentMonth.toLocaleString()}`;
          document.getElementById('pendingCommission').textContent = `\u00A5${stats.commissions.pending.toLocaleString()}`;
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
                <span class="customer">${sale.agency_name}</span>
                <span class="amount">\u00A5${sale.total_amount.toLocaleString()}</span>
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
      `\u00A5${data.total_amount.toLocaleString()}`;
    document.getElementById(`${prefix}OwnAmount`).textContent =
      `\u00A5${data.own_amount.toLocaleString()}`;
    document.getElementById(`${prefix}SubordinateAmount`).textContent =
      `\u00A5${data.subordinate_amount.toLocaleString()}`;

    // TOP代理店リスト
    const topAgenciesList = document.getElementById(`${prefix}TopAgenciesList`);
    if (topAgenciesList && data.top_agencies) {
      if (data.top_agencies.length > 0) {
        topAgenciesList.innerHTML = data.top_agencies.map((agency, index) => `
          <div class="top-agency-item">
            <span class="rank">${index + 1}</span>
            <span class="name">${agency.agency_name}</span>
            <span class="amount">\u00A5${agency.total_amount.toLocaleString()}</span>
            <span class="count">${agency.sale_count}\u4EF6</span>
          </div>
        `).join('');
      } else {
        topAgenciesList.innerHTML = '<p class="no-data">\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</p>';
      }
    }
  }

  /**
   * データがない場合の表示
   */
  renderEmptyOrgSalesData(period) {
    const prefix = period === 'current' ? 'orgCurrent' : 'orgPrevious';

    document.getElementById(`${prefix}TotalAmount`).textContent = '\u00A50';
    document.getElementById(`${prefix}OwnAmount`).textContent = '\u00A50';
    document.getElementById(`${prefix}SubordinateAmount`).textContent = '\u00A50';

    const topAgenciesList = document.getElementById(`${prefix}TopAgenciesList`);
    if (topAgenciesList) {
      topAgenciesList.innerHTML = '<p class="no-data">\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</p>';
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
      currentMonthTab.textContent = `${currentYear}\u5E74${currentMonth}\u6708`;
    }
    if (previousMonthTab) {
      previousMonthTab.textContent = `${previousYear}\u5E74${previousMonth}\u6708`;
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
                  `<div class="value">${this.app.formatCurrency(data.sales)}</div>` :
                  ''
                }
                <div class="bar" style="height: ${heightPercent}%; ${data.sales === 0 ? 'background: #e0e0e0;' : ''}"></div>
                <div class="label">${parseInt(data.month.split('-')[1])}\u6708</div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      if (chartContainer) {
        chartContainer.innerHTML = '<p style="text-align: center; color: #999;">\u30C7\u30FC\u30BF\u304C\u3042\u308A\u307E\u305B\u3093</p>';
      }
    }
  }
}
