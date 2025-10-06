/**
 * 報酬管理ページ
 */

class CommissionsPage {
  constructor() {
    // 現在の年月を取得
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    this.currentMonth = `${year}-${month}`;
    this.selectedMonth = null; // デフォルトは全件表示
    this.commissions = [];
    this.allCommissions = []; // フィルタリング用に全件保持
    this.initialized = false; // 初期化済みフラグ
  }

  async init() {
    // 既に初期化済みの場合はデータのみ更新
    if (this.initialized) {
      await this.loadCommissions();
      return;
    }

    this.setupMonthSelector();
    await this.loadCommissions(); // 初期表示は全件
    this.setupEventListeners();
    this.initialized = true;
  }

  /**
   * 月選択の初期設定
   */
  setupMonthSelector() {
    const monthInput = document.getElementById('commissionMonth');
    if (monthInput) {
      // デフォルトは空（全件表示）
      monthInput.value = '';
      this.updateMonthDisplay();
    }
  }

  /**
   * 選択月の表示更新
   */
  updateMonthDisplay() {
    const displayEl = document.getElementById('selectedMonthDisplay');
    if (displayEl) {
      if (this.selectedMonth) {
        const [year, month] = this.selectedMonth.split('-');
        displayEl.textContent = `${year}年${parseInt(month)}月`;
      } else {
        displayEl.textContent = '全期間';
      }
    }

    // 月入力フィールドの値も更新（報酬計算後の維持のため）
    const monthInput = document.getElementById('commissionMonth');
    if (monthInput && this.selectedMonth && monthInput.value !== this.selectedMonth) {
      monthInput.value = this.selectedMonth;
    }
  }


  setupEventListeners() {
    // 月変更時に一覧とサマリーを更新
    const monthInput = document.getElementById('commissionMonth');
    if (monthInput && !monthInput.dataset.listenerAttached) {
      monthInput.addEventListener('change', async (e) => {
        const newMonth = e.target.value;
        if (newMonth !== this.selectedMonth) {
          this.selectedMonth = newMonth || null;
          this.updateMonthDisplay();
          // 一覧を絞り込み表示
          this.filterAndDisplayCommissions();
          // サマリーも更新
          if (this.selectedMonth) {
            await this.loadCommissionSummary();
          } else {
            // 全件の場合はサマリーをクリア
            this.clearSummary();
          }
        }
      });
      monthInput.dataset.listenerAttached = 'true';
    }

    // 報酬計算ボタン
    const calcBtn = document.getElementById('calculateCommissionBtn');
    if (calcBtn && !calcBtn.dataset.listenerAttached) {
      calcBtn.addEventListener('click', () => {
        this.calculateCommissions();
      });
      calcBtn.dataset.listenerAttached = 'true';
    }
  }

  /**
   * 報酬サマリーの読み込み
   */
  async loadCommissionSummary() {
    try {
      const response = await window.commissionsAPI.getSummary(this.selectedMonth);
      if (response.success && response.data) {
        this.displaySummary(response.data);

      }
    } catch (error) {
      console.error('Load commission summary error:', error);
    }
  }

  /**
   * サマリー表示
   */
  displaySummary(summary) {

    // 基本報酬
    const baseEl = document.getElementById('baseCommission');
    if (baseEl) {
      baseEl.textContent = `¥${(summary.total_base || 0).toLocaleString()}`;
    }

    // 階層ボーナス
    const tierEl = document.getElementById('tierBonus');
    if (tierEl) {
      tierEl.textContent = `¥${(summary.total_tier_bonus || 0).toLocaleString()}`;
    }

    // キャンペーンボーナス
    const campaignEl = document.getElementById('campaignBonus');
    if (campaignEl) {
      campaignEl.textContent = `¥${(summary.total_campaign_bonus || 0).toLocaleString()}`;
    }

    // 合計
    const totalEl = document.getElementById('totalCommissionAmount');
    if (totalEl) {
      totalEl.textContent = `¥${(summary.total_final || 0).toLocaleString()}`;
    }
  }

  /**
   * 報酬一覧の読み込み
   */
  async loadCommissions() {
    try {
      // 全期間の報酬データを取得（月指定なし）
      const response = await window.commissionsAPI.getCommissions();
      if (response.success && response.data) {
        this.allCommissions = response.data; // 全件を保持

        // TableHelperの初期化（初回のみ）
        if (!this.commissionsTableHelper) {
          const containerElement = document.querySelector('#commissionsPage .table-container');

          this.commissionsTableHelper = new TableHelper({
            itemsPerPage: 25,
            defaultSortColumn: 'commission_month',
            defaultSortDirection: 'desc',
            containerElement: containerElement,
            renderCallback: (pageData) => this.renderCommissionsTable(pageData)
          });

          // イベントリスナー設定
          const setupEventListeners = () => {
            // 検索フィルター
            const searchInput = document.getElementById('commissionSearch');
            if (searchInput) {
              const newSearchInput = searchInput.cloneNode(true);
              searchInput.parentNode.replaceChild(newSearchInput, searchInput);
              newSearchInput.addEventListener('input', () => {
                this.applyCommissionsFilters();
              });
            }

            // ステータスフィルター
            const statusFilter = document.getElementById('commissionStatusFilter');
            if (statusFilter) {
              const newStatusFilter = statusFilter.cloneNode(true);
              statusFilter.parentNode.replaceChild(newStatusFilter, statusFilter);
              newStatusFilter.addEventListener('change', () => {
                this.applyCommissionsFilters();
              });
            }

            // ソート可能なヘッダー
            document.querySelectorAll('#commissionsTable th.sortable').forEach(header => {
              const newHeader = header.cloneNode(true);
              header.parentNode.replaceChild(newHeader, header);
              newHeader.addEventListener('click', () => {
                const column = newHeader.dataset.column;

                // 既存のソートクラスをクリア
                document.querySelectorAll('#commissionsTable th.sortable').forEach(h => {
                  h.classList.remove('sorted-asc', 'sorted-desc');
                });

                this.commissionsTableHelper.setSort(column);

                // 新しいソート状態を反映
                const direction = this.commissionsTableHelper.sortDirection;
                newHeader.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
              });
            });
          };

          setupEventListeners();

          // デフォルトのソート表示を設定
          const defaultSortHeader = document.querySelector(`#commissionsTable th.sortable[data-column="commission_month"]`);
          if (defaultSortHeader) {
            defaultSortHeader.classList.add('sorted-desc');
          }
        }

        // データを正規化
        const normalizedData = response.data.map(commission => ({
          ...commission,
          commission_month_date: new Date(commission.month + '-01'),
          commission_month_timestamp: new Date(commission.month + '-01').getTime(),
          sale_number: commission.sales?.sale_number || '-'
        }));

        this.commissionsTableHelper.setData(normalizedData);
        this.applyCommissionsFilters();

        // 月選択の表示を更新（リロード後も維持）
        this.updateMonthDisplay();
      }
    } catch (error) {
      console.error('Load commissions error:', error);
    }
  }

  /**
   * 報酬フィルタを適用
   */
  applyCommissionsFilters() {
    const searchText = document.getElementById('commissionSearch')?.value || '';
    const statusFilter = document.getElementById('commissionStatusFilter')?.value || '';

    this.commissionsTableHelper.setFilters({
      search: (commission) => {
        if (!searchText) return true;
        const text = searchText.toLowerCase();
        return commission.sale_number?.toLowerCase().includes(text);
      },
      status: (commission) => {
        if (!statusFilter) return true;
        return commission.status === statusFilter;
      },
      month: (commission) => {
        if (!this.selectedMonth) return true;
        return commission.month === this.selectedMonth;
      }
    });
  }

  /**
   * 報酬一覧を絞り込んで表示
   */
  filterAndDisplayCommissions() {
    this.applyCommissionsFilters();
  }

  /**
   * サマリーのクリア
   */
  clearSummary() {
    const baseEl = document.getElementById('baseCommission');
    if (baseEl) baseEl.textContent = '¥0';

    const tierEl = document.getElementById('tierBonus');
    if (tierEl) tierEl.textContent = '¥0';

    const campaignEl = document.getElementById('campaignBonus');
    if (campaignEl) campaignEl.textContent = '¥0';

    const totalEl = document.getElementById('totalCommissionAmount');
    if (totalEl) totalEl.textContent = '¥0';
  }

  /**
   * 報酬一覧の表示（下位互換のため残す）
   */
  displayCommissions() {
    // TableHelperを使う場合は何もしない
    if (this.commissionsTableHelper) return;
  }

  /**
   * 報酬テーブル描画
   */
  renderCommissionsTable(commissions) {
    const tbody = document.querySelector('#commissionsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!commissions || commissions.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 20px;">
            報酬データがありません
          </td>
        </tr>
      `;
      return;
    }

    console.log('Displaying commissions:', commissions);

    commissions.forEach(commission => {
      const row = document.createElement('tr');

      // ステータスに応じたクラスとテキスト
      let statusClass = '';
      let statusText = '';

      switch (commission.status) {
        case 'pending':
          statusClass = 'status-pending';
          statusText = '未確定';
          break;
        case 'confirmed':
        case 'approved':  // approvedもconfirmedと同様に扱う
          statusClass = 'status-active';
          statusText = '確定済';
          break;
        case 'carried_forward':
          statusClass = 'status-warning';
          statusText = '繰り越し';
          break;
        case 'paid':
          statusClass = 'status-paid';
          statusText = '支払済';
          break;
        default:
          statusText = commission.status;
      }

      // ステータス変更ボタンを表示（一旦全ユーザーに表示）
      const actionButtons = this.getActionButtons(commission);
      console.log(`Commission ${commission.id} status: ${commission.status}, action buttons: ${actionButtons}`);

      // 売上番号の表示（代理店ユーザーは自社売上のみリンク表示）
      let saleNumberCell = '-';
      if (commission.sales?.sale_number) {
        // 基本報酬がある場合のみリンク表示（自社売上）
        if (commission.base_amount > 0) {
          saleNumberCell = `<a href="#" onclick="window.commissionsPageInstance.viewSaleDetail('${commission.sale_id || commission.sales?.id}'); return false;" style="color: #0066cc; text-decoration: none; cursor: pointer;">${commission.sales.sale_number}</a>`;
        } else {
          // 階層ボーナスの場合はリンクなしで表示
          saleNumberCell = `<span style="color: #666;">${commission.sales.sale_number} (階層)</span>`;
        }
      }

      row.innerHTML = `
        <td>${commission.month}</td>
        <td>${saleNumberCell}</td>
        <td>¥${(commission.base_amount || 0).toLocaleString()}</td>
        <td>¥${(commission.tier_bonus || 0).toLocaleString()}</td>
        <td>¥${(commission.final_amount || 0).toLocaleString()}</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>${actionButtons || '-'}</td>
      `;

      tbody.appendChild(row);
    });
  }

  /**
   * アクションボタンの生成
   */
  getActionButtons(commission) {
    const buttons = [];

    // statusがundefinedまたはnullの場合のチェック
    const status = commission.status || 'pending';

    switch (status) {
      case 'pending':
        // 未確定（売上登録時）→ 報酬計算で確定になる
        buttons.push(`<span class="text-muted">報酬計算待ち</span>`);
        break;
      case 'confirmed':
      case 'approved':  // approvedもconfirmedと同様に扱う
        // ユーザー情報を取得（フェイルセーフ付き）
        const userStr = localStorage.getItem('agency_system_user');
        const user = userStr ? JSON.parse(userStr) : null;

        if (user && user.role === 'admin') {
          // 管理者のみ: 支払い実行ボタン
          buttons.push(`<button class="btn btn-small btn-warning" onclick="window.commissionsPageInstance.markAsPaid('${commission.id}')">支払い実行</button>`);
        } else {
          // 代理店または取得失敗時: 承認済みと表示
          buttons.push(`<span class="text-muted">承認済み</span>`);
        }
        break;
      case 'carried_forward':
        // 繰り越し（最低支払額未満）
        buttons.push(`<span class="text-muted">${commission.carry_forward_reason || '最低支払額未満'}</span>`);
        break;
      case 'paid':
        // 支払済み
        buttons.push(`
          <button class="btn btn-small btn-success" onclick="window.commissionsPageInstance.downloadReceipt('${commission.month}', '${commission.agency_id}')">領収書</button>
        `);
        break;
      default:
        // その他のステータス
        buttons.push(`<span class="text-muted">${status}</span>`);
        break;
    }

    return buttons.length > 0 ? buttons.join(' ') : '<span class="text-muted">-</span>';
  }

  /**
   * 報酬ステータス更新
   */
  async updateCommissionStatus(commissionId, newStatus) {
    const statusText = {
      'pending': '未確定',
      'confirmed': '確定済',
      'approved': '承認済',
      'paid': '支払済',
      'cancelled': 'キャンセル'
    }[newStatus] || newStatus;

    if (!confirm(`ステータスを「${statusText}」に変更しますか？`)) {
      return;
    }

    try {
      const response = await fetch(`${CONFIG.API_BASE_URL}/commissions/${commissionId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('agency_system_token') || localStorage.getItem('token')}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        alert(data.message || 'ステータスを更新しました');
        await this.loadCommissions();
      } else {
        alert(data.message || 'ステータス更新に失敗しました');
      }
    } catch (error) {
      console.error('Update commission status error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * 支払完了処理
   */
  async markAsPaid(commissionId) {
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
  async calculateCommissions(forceMonth = null) {
    // 月入力フィールドから現在の値を取得（フォールバック）
    const monthInput = document.getElementById('commissionMonth');
    const month = forceMonth || monthInput?.value || this.selectedMonth;

    // 月が選択されていない場合のチェック
    if (!month) {
      alert('計算対象月を選択してください');
      return;
    }

    const [year, monthNum] = month.split('-');

    if (!confirm(`${year}年${parseInt(monthNum)}月の報酬を計算します。\n既存の報酬データは上書きされます。よろしいですか？`)) {
      return;
    }

    try {
      const response = await window.commissionsAPI.calculateCommissions(month);

      if (response && response.success) {
        const data = response.data;
        alert(`報酬計算が完了しました！\n対象月: ${year}年${parseInt(monthNum)}月\n計算件数: ${data.total_commissions}件\n合計金額: ¥${data.total_amount.toLocaleString()}`);

        // データを再読み込み（月選択を維持）
        this.selectedMonth = month;  // 選択月を更新
        await this.loadCommissionSummary();  // サマリーのみ更新
        await this.loadCommissions();  // 報酬一覧も更新
        this.filterAndDisplayCommissions();  // 選択月でフィルタリング
      } else {
        alert(response?.message || '報酬計算に失敗しました');
      }
    } catch (error) {
      alert('報酬計算中にエラーが発生しました: ' + (error.message || '不明なエラー'));
    }
  }

  /**
   * 一括承認処理
   */
  async approveAllCommissions() {
    const [year, monthNum] = this.selectedMonth.split('-');

    if (!confirm(`${year}年${parseInt(monthNum)}月の全ての報酬を承認しますか？`)) {
      return;
    }

    try {
      let approvedCount = 0;
      let failedCount = 0;

      // 承認可能なステータスのコミッションのみ処理
      const pendingCommissions = this.commissions.filter(c =>
        c.status === 'pending' || c.status === 'confirmed'
      );

      if (pendingCommissions.length === 0) {
        alert('承認可能な報酬がありません');
        return;
      }

      for (const commission of pendingCommissions) {
        try {
          const response = await fetch(`${CONFIG.API_BASE_URL}/commissions/${commission.id}/status`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('agency_system_token') || localStorage.getItem('token')}`
            },
            body: JSON.stringify({ status: 'approved' })
          });

          if (response.ok) {
            approvedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
        }
      }

      alert(`一括承認が完了しました\n成功: ${approvedCount}件\n失敗: ${failedCount}件`);
      await this.loadMonthData();
    } catch (error) {
      console.error('Approve all error:', error);
      alert('一括承認中にエラーが発生しました');
    }
  }

  /**
   * 売上詳細表示
   */
  async viewSaleDetail(saleId) {
    if (!saleId) {
      console.error('Sale ID is required');
      alert('売上情報が見つかりません');
      return;
    }

    try {
      // 売上詳細を取得
      const response = await window.salesAPI.getSale(saleId);

      if (response.success && response.data) {
        const sale = response.data;

        // モーダルに売上詳細を表示
        const modalContent = `
            <h2>売上詳細</h2>
            <div class="sale-detail-content">
              <div class="detail-section">
                <h3>基本情報</h3>
                <div class="detail-row">
                  <label>売上番号:</label>
                  <span>${sale.sale_number || '-'}</span>
                </div>
                <div class="detail-row">
                  <label>売上日:</label>
                  <span>${sale.sale_date || '-'}</span>
                </div>
                <div class="detail-row">
                  <label>代理店:</label>
                  <span>${sale.agency?.company_name || '-'} (${sale.agency?.agency_code || '-'})</span>
                </div>
              </div>

              <div class="detail-section">
                <h3>顧客情報</h3>
                <div class="detail-row">
                  <label>顧客名:</label>
                  <span>${sale.customer_name || '-'}</span>
                </div>
                <div class="detail-row">
                  <label>顧客メール:</label>
                  <span>${sale.customer_email || '-'}</span>
                </div>
                <div class="detail-row">
                  <label>顧客電話:</label>
                  <span>${sale.customer_phone || '-'}</span>
                </div>
              </div>

              <div class="detail-section">
                <h3>商品情報</h3>
                <div class="detail-row">
                  <label>商品:</label>
                  <span>${sale.product?.name || '-'}</span>
                </div>
                <div class="detail-row">
                  <label>数量:</label>
                  <span>${sale.quantity || 0}</span>
                </div>
                <div class="detail-row">
                  <label>単価:</label>
                  <span>¥${(sale.unit_price || 0).toLocaleString()}</span>
                </div>
                <div class="detail-row">
                  <label>売上金額:</label>
                  <span style="font-weight: bold;">¥${(sale.total_amount || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>
            <div style="text-align: center; margin-top: 20px;">
              <button class="btn btn-secondary" onclick="app.closeModal()">閉じる</button>
            </div>
          `;

        // モーダルを表示
        app.showModal(modalContent);
      } else {
        alert('売上情報の取得に失敗しました');
      }
    } catch (error) {
      console.error('View sale detail error:', error);
      alert('売上詳細の表示中にエラーが発生しました');
    }
  }

  /**
   * 支払実行処理
   */
  async executePayment() {
    const [year, monthNum] = this.selectedMonth.split('-');
    const paymentDate = prompt('支払日を入力してください (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));

    if (!paymentDate) return;

    if (!confirm(`${year}年${parseInt(monthNum)}月の承認済み報酬を支払済みにしますか？\n支払日: ${paymentDate}`)) {
      return;
    }

    try {
      let paidCount = 0;
      let failedCount = 0;

      // 承認済みステータスのコミッションのみ処理
      const approvedCommissions = this.commissions.filter(c => c.status === 'approved');

      if (approvedCommissions.length === 0) {
        alert('支払可能な報酬がありません');
        return;
      }

      for (const commission of approvedCommissions) {
        try {
          const response = await fetch(`${CONFIG.API_BASE_URL}/commissions/${commission.id}/pay`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('agency_system_token') || localStorage.getItem('token')}`
            },
            body: JSON.stringify({
              payment_date: paymentDate,
              payment_method: 'bank_transfer'
            })
          });

          if (response.ok) {
            paidCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          failedCount++;
        }
      }

      alert(`支払実行が完了しました\n成功: ${paidCount}件\n失敗: ${failedCount}件`);
      await this.loadMonthData();
    } catch (error) {
      console.error('Execute payment error:', error);
      alert('支払実行中にエラーが発生しました');
    }
  }


  /**
   * 領収書ダウンロード（月単位）
   */
  async downloadReceipt(month, agencyId) {
    try {
      // JWT認証エラーの場合は自動でリダイレクトされる
      const blob = await apiClient.postForBlob('/invoices/receipt-monthly', {
        month: month,
        agency_id: agencyId
      });

      // JWT認証エラーでリダイレクトされた場合はblobがundefinedになる
      if (!blob) {
        return;
      }

      // Blobとしてダウンロード
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt_monthly_${month}.pdf`;
      document.body.appendChild(a);
      a.click();

      // クリーンアップ
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      console.error('Download receipt error:', error);
      alert('領収書のダウンロードに失敗しました: ' + error.message);
    }
  }
}

// グローバルスコープに登録
window.CommissionsPage = CommissionsPage;
// インスタンスは app.js で commissionsPageInstance として作成