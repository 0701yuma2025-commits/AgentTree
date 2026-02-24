/**
 * 売上管理ページ
 */
class SalesPage {
  constructor(app) {
    this.app = app;
    this.salesTableHelper = null;
  }

  async init() {
    await this.loadSales();
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
                <td>\u00A5${sale.total_amount.toLocaleString()}</td>
                <td>
                  <button class="btn btn-secondary" onclick="app.showSaleDetail('${sale.id}')">\u8A73\u7D30</button>
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
        statusText = '\u652F\u6255\u6E08';
        break;
      case 'confirmed':
      case 'approved':  // approvedも確定として扱う
        badge = 'info';
        statusText = '\u78BA\u5B9A';
        break;
      case 'pending':
        badge = 'warning';
        statusText = '\u672A\u78BA\u5B9A';
        break;
      case 'carried_forward':
        badge = 'secondary';
        statusText = '\u7E70\u8D8A';
        if (commission.carry_forward_reason) {
          additionalInfo = `<br><small class="text-muted">${commission.carry_forward_reason}</small>`;
        }
        break;
      default:
        badge = 'light';
        statusText = commission.status || '\u672A\u8A2D\u5B9A';
    }

    return `<span class="badge badge-${badge}">${statusText}</span>${additionalInfo}`;
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
        alert('\u58F2\u4E0A\u60C5\u5831\u304C\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F');
        return;
      }

      const sale = response.data;
      console.log('Sale data:', sale);

      // モーダルに詳細情報を表示
      const modalBody = document.getElementById('modalBody');
      if (!modalBody) {
        console.error('modalBody element not found');
        alert('\u30E2\u30FC\u30C0\u30EB\u8981\u7D20\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093');
        return;
      }

      modalBody.innerHTML = `
        <div class="sale-detail">
          <h2>\u58F2\u4E0A\u8A73\u7D30</h2>
          <div class="detail-section">
            <h3>\u57FA\u672C\u60C5\u5831</h3>
            <table class="detail-table">
              <tr><th>\u58F2\u4E0A\u756A\u53F7</th><td>${sale.sale_number || '-'}</td></tr>
              <tr><th>\u58F2\u4E0A\u65E5</th><td>${new Date(sale.sale_date).toLocaleDateString()}</td></tr>
              <tr><th>\u767B\u9332\u65E5\u6642</th><td>${new Date(sale.created_at).toLocaleString()}</td></tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>\u8CA9\u58F2\u4EE3\u7406\u5E97</h3>
            <table class="detail-table">
              <tr><th>\u4EE3\u7406\u5E97\u30B3\u30FC\u30C9</th><td>${sale.agency?.agency_code || '-'}</td></tr>
              <tr><th>\u4F1A\u793E\u540D</th><td>${sale.agency?.company_name || '-'}</td></tr>
              <tr><th>\u968E\u5C64</th><td>${sale.agency ? 'Tier ' + sale.agency.tier_level : '-'}</td></tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>\u9867\u5BA2\u60C5\u5831</h3>
            <table class="detail-table">
              <tr><th>\u9867\u5BA2\u540D</th><td>${sale.customer_name || '-'}</td></tr>
              <tr><th>\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9</th><td>${sale.customer_email || '-'}</td></tr>
              <tr><th>\u96FB\u8A71\u756A\u53F7</th><td>${sale.customer_phone || '-'}</td></tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>\u5546\u54C1\u30FB\u91D1\u984D\u60C5\u5831</h3>
            <table class="detail-table">
              <tr><th>\u5546\u54C1\u540D</th><td>${sale.product?.name || sale.products?.name || '-'}</td></tr>
              <tr><th>\u6570\u91CF</th><td>${sale.quantity}</td></tr>
              <tr><th>\u5358\u4FA1</th><td>\u00A5${sale.unit_price?.toLocaleString() || '-'}</td></tr>
              <tr><th>\u5408\u8A08\u91D1\u984D</th><td><strong>\u00A5${sale.total_amount.toLocaleString()}</strong></td></tr>
            </table>
          </div>

          ${sale.notes ? `
          <div class="detail-section">
            <h3>\u5099\u8003</h3>
            <p>${sale.notes}</p>
          </div>
          ` : ''}

          <div class="modal-buttons">
            ${authAPI.isAdmin() ? `
              <button class="btn btn-primary" onclick="app.editSale('${sale.id}')">\u7DE8\u96C6</button>
              <button class="btn btn-danger" onclick="app.deleteSale('${sale.id}')">\u524A\u9664</button>
            ` : ''}
            <button class="btn btn-secondary" onclick="app.showSaleHistory('${sale.id}')">\u5909\u66F4\u5C65\u6B74</button>
            <button class="btn btn-secondary" onclick="app.hideModal()">\u9589\u3058\u308B</button>
          </div>
        </div>
      `;

      // モーダル表示
      const modal = document.getElementById('modal');
      if (!modal) {
        console.error('modal element not found');
        alert('\u30E2\u30FC\u30C0\u30EB\u8981\u7D20\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093');
        return;
      }
      console.log('Showing modal');
      modal.classList.remove('hidden');

    } catch (error) {
      console.error('Show sale detail error:', error);
      console.error('Error stack:', error.stack);
      alert('\u58F2\u4E0A\u8A73\u7D30\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ' + error.message);
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
        alert('\u58F2\u4E0A\u60C5\u5831\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        return;
      }

      const sale = response.data;
      const status = sale.status || 'pending';
      const isAdmin = authAPI.isAdmin();

      // ステータスによる編集可否チェック
      if (status === 'paid' && !isAdmin) {
        alert('\u652F\u6255\u6E08\u307F\u306E\u58F2\u4E0A\u306F\u7DE8\u96C6\u3067\u304D\u307E\u305B\u3093');
        return;
      }

      // 商品一覧を取得
      const productsResponse = await apiClient.get('/products');
      const products = productsResponse.data || [];

      // 変更履歴を取得
      const historyResponse = await apiClient.get(`/sales/${saleId}/history`);
      const history = historyResponse.success ? historyResponse.data : [];

      // ステータス別の編集可能フィールド
      const canEditAll = status === 'pending' || isAdmin;
      const canEditCustomer = status === 'confirmed' || canEditAll;
      const readonly = (field) => {
        if (status === 'paid' && !isAdmin) return 'readonly style="background-color: #f5f5f5;"';
        if (field === 'customer' && !canEditCustomer) return '';
        if (!canEditAll && field !== 'customer') return 'readonly style="background-color: #f5f5f5;"';
        return '';
      };

      // 編集フォームを表示
      const modalBody = document.getElementById('modalBody');
      modalBody.innerHTML = `
        <div class="sale-edit">
          <h2>\u58F2\u4E0A\u7DE8\u96C6</h2>
          <div style="background: #e7f3ff; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 0.9em;">
            <strong>\u73FE\u5728\u306E\u30B9\u30C6\u30FC\u30BF\u30B9:</strong> ${status === 'pending' ? '\u4FDD\u7559\u4E2D' : status === 'confirmed' ? '\u78BA\u5B9A\u6E08\u307F' : status === 'paid' ? '\u652F\u6255\u6E08\u307F' : status}<br>
            ${!canEditAll ? '<span style="color: #d46b08;">\u26A0 \u3053\u306E\u30B9\u30C6\u30FC\u30BF\u30B9\u3067\u306F\u4E00\u90E8\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u306E\u307F\u7DE8\u96C6\u53EF\u80FD\u3067\u3059</span>' : ''}
            ${status === 'pending' ? '<span style="color: #52c41a;">\u2713 \u5168\u3066\u306E\u30D5\u30A3\u30FC\u30EB\u30C9\u3092\u7DE8\u96C6\u3067\u304D\u307E\u3059</span>' : ''}
            ${status === 'confirmed' && !isAdmin ? '<span style="color: #d46b08;">\u26A0 \u9867\u5BA2\u60C5\u5831\u306E\u307F\u7DE8\u96C6\u3067\u304D\u307E\u3059</span>' : ''}
          </div>
          <form id="editSaleForm">
            <div class="form-group">
              <label for="saleDate">\u58F2\u4E0A\u65E5*</label>
              <input type="date" id="saleDate" value="${sale.sale_date.split('T')[0]}" ${readonly('sale')} required>
            </div>

            <div class="form-group">
              <label for="customerName">\u9867\u5BA2\u540D*</label>
              <input type="text" id="customerName" value="${sale.customer_name || ''}" ${readonly('customer')} required>
            </div>

            <div class="form-group">
              <label for="customerEmail">\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9</label>
              <input type="email" id="customerEmail" value="${sale.customer_email || ''}" ${readonly('customer')}>
            </div>

            <div class="form-group">
              <label for="customerPhone">\u96FB\u8A71\u756A\u53F7</label>
              <input type="tel" id="customerPhone" value="${sale.customer_phone || ''}" ${readonly('customer')}>
            </div>

            <div class="form-group">
              <label for="customerAddress">\u4F4F\u6240</label>
              <input type="text" id="customerAddress" value="${sale.customer_address || ''}" ${readonly('customer')}>
            </div>

            <div class="form-group">
              <label for="productId">\u5546\u54C1*</label>
              <select id="productId" ${readonly('sale')} required>
                ${products.map(p => `<option value="${p.id}" ${sale.product_id === p.id ? 'selected' : ''}>${p.name} (\u00A5${p.price.toLocaleString()})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="quantity">\u6570\u91CF*</label>
              <input type="number" id="quantity" value="${sale.quantity}" min="1" ${readonly('sale')} required>
            </div>

            <div class="form-group">
              <label for="unitPrice">\u5358\u4FA1*</label>
              <input type="number" id="unitPrice" value="${sale.unit_price}" min="0" ${readonly('sale')} required>
            </div>

            <div class="form-group">
              <label for="notes">\u5099\u8003</label>
              <textarea id="notes" rows="3" ${readonly('sale')}>${sale.notes || ''}</textarea>
            </div>

            <div class="modal-buttons">
              <button type="submit" class="btn btn-primary">\u4FDD\u5B58</button>
              <button type="button" class="btn btn-secondary" onclick="app.hideModal()">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
            </div>
          </form>

          ${history.length > 0 ? `
          <div class="detail-section" style="margin-top: 30px;">
            <h3>\u5909\u66F4\u5C65\u6B74</h3>
            <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px;">
              ${history.map(h => `
                <div style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: #4A90E2;">${h.field_name}</strong>
                    <span style="font-size: 0.85em; color: #999;">${new Date(h.changed_at).toLocaleString()}</span>
                  </div>
                  <div style="font-size: 0.9em; color: #666;">
                    <span style="color: #999;">\u5909\u66F4\u524D:</span> <span style="background: #fff1f0; padding: 2px 6px; border-radius: 3px;">${h.old_value || '(\u7A7A)'}</span>
                    \u2192
                    <span style="color: #999;">\u5909\u66F4\u5F8C:</span> <span style="background: #f6ffed; padding: 2px 6px; border-radius: 3px;">${h.new_value || '(\u7A7A)'}</span>
                  </div>
                  <div style="font-size: 0.85em; color: #999; margin-top: 4px;">
                    \u5909\u66F4\u8005: ${h.changed_by.name} (${h.changed_by.email})
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}
        </div>
      `;

      // フォーム送信イベント
      document.getElementById('editSaleForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        const updateData = {
          customer_name: document.getElementById('customerName').value,
          customer_email: document.getElementById('customerEmail').value,
          customer_phone: document.getElementById('customerPhone').value,
          customer_address: document.getElementById('customerAddress').value
        };

        // 全フィールド編集可能な場合は追加
        if (canEditAll) {
          updateData.sale_date = document.getElementById('saleDate').value;
          updateData.product_id = document.getElementById('productId').value;
          updateData.quantity = parseInt(document.getElementById('quantity').value);
          updateData.unit_price = parseFloat(document.getElementById('unitPrice').value);
          updateData.notes = document.getElementById('notes').value;
        }

        try {
          const result = await apiClient.put(`/sales/${saleId}`, updateData);
          if (result.success) {
            alert('\u58F2\u4E0A\u60C5\u5831\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F');
            this.app.hideModal();
            await this.loadSales(true);
          } else {
            alert(result.message || '\u66F4\u65B0\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
          }
        } catch (error) {
          console.error('Update sale error:', error);
          alert('\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ' + (error.message || ''));
        }
      });

      // モーダルを表示
      this.app.openModal();

    } catch (error) {
      console.error('Edit sale error:', error);
      alert('\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F');
    }
  }

  /**
   * 売上削除
   */
  async deleteSale(saleId) {
    if (!confirm('\u3053\u306E\u58F2\u4E0A\u60C5\u5831\u3092\u5B8C\u5168\u306B\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\n\u203B\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002\u95A2\u9023\u3059\u308B\u5831\u916C\u30C7\u30FC\u30BF\u3082\u524A\u9664\u3055\u308C\u307E\u3059')) {
      return;
    }

    try {
      const result = await apiClient.delete(`/sales/${saleId}`);
      if (result.success) {
        alert('\u58F2\u4E0A\u60C5\u5831\u3092\u524A\u9664\u3057\u307E\u3057\u305F');
        this.app.hideModal();
        await this.loadSales(true);
      } else {
        alert(result.message || '\u524A\u9664\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
      }
    } catch (error) {
      console.error('Delete sale error:', error);
      alert('\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F');
    }
  }

  /**
   * 売上変更履歴表示
   */
  async showSaleHistory(saleId) {
    try {
      const historyResponse = await apiClient.get(`/sales/${saleId}/history`);
      const saleResponse = await apiClient.get(`/sales/${saleId}`);

      if (!historyResponse.success || !saleResponse.success) {
        alert('\u5C65\u6B74\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
        return;
      }

      const history = historyResponse.data || [];
      const sale = saleResponse.data;

      const modalBody = document.getElementById('modalBody');
      modalBody.innerHTML = `
        <div class="sale-history">
          <h2>\u58F2\u4E0A\u5909\u66F4\u5C65\u6B74</h2>
          <div style="background: #f5f5f5; padding: 12px; border-radius: 4px; margin-bottom: 20px;">
            <strong>\u58F2\u4E0A\u756A\u53F7:</strong> ${sale.sale_number || '-'}<br>
            <strong>\u9867\u5BA2\u540D:</strong> ${sale.customer_name || '-'}<br>
            <strong>\u5408\u8A08\u91D1\u984D:</strong> \u00A5${sale.total_amount.toLocaleString()}
          </div>

          ${history.length === 0 ? `
            <p style="text-align: center; color: #999; padding: 40px 0;">
              \u5909\u66F4\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093
            </p>
          ` : `
            <div style="max-height: 500px; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 4px;">
              ${history.map((h, index) => `
                <div style="padding: 16px; border-bottom: 1px solid #f0f0f0; ${index % 2 === 0 ? 'background: #fafafa;' : ''}">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <strong style="color: #4A90E2; font-size: 1.1em;">${h.field_name}</strong>
                    <span style="font-size: 0.9em; color: #999;">${new Date(h.changed_at).toLocaleString('ja-JP')}</span>
                  </div>
                  <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; margin: 10px 0;">
                    <div>
                      <div style="font-size: 0.85em; color: #999; margin-bottom: 4px;">\u5909\u66F4\u524D</div>
                      <div style="background: #fff1f0; padding: 8px 12px; border-radius: 4px; border: 1px solid #ffccc7; min-height: 36px;">
                        ${h.old_value || '<span style="color: #ccc;">(\u7A7A)</span>'}
                      </div>
                    </div>
                    <div style="text-align: center; color: #999;">
                      \u2192
                    </div>
                    <div>
                      <div style="font-size: 0.85em; color: #999; margin-bottom: 4px;">\u5909\u66F4\u5F8C</div>
                      <div style="background: #f6ffed; padding: 8px 12px; border-radius: 4px; border: 1px solid #b7eb8f; min-height: 36px;">
                        ${h.new_value || '<span style="color: #ccc;">(\u7A7A)</span>'}
                      </div>
                    </div>
                  </div>
                  <div style="font-size: 0.9em; color: #666; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e8e8e8;">
                    <strong>\u5909\u66F4\u8005:</strong> ${h.changed_by.name} <span style="color: #999;">(${h.changed_by.email})</span>
                  </div>
                </div>
              `).join('')}
            </div>
          `}

          <div class="modal-buttons" style="margin-top: 20px;">
            <button class="btn btn-secondary" onclick="app.showSaleDetail('${saleId}')">\u58F2\u4E0A\u8A73\u7D30\u306B\u623B\u308B</button>
            <button class="btn btn-secondary" onclick="app.hideModal()">\u9589\u3058\u308B</button>
          </div>
        </div>
      `;

      // モーダル表示（既に表示されている場合は内容のみ更新）
      const modal = document.getElementById('modal');
      if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
      }

    } catch (error) {
      console.error('Show sale history error:', error);
      alert('\u5C65\u6B74\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F');
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
      <h3>\u65B0\u898F\u58F2\u4E0A\u767B\u9332</h3>
      <form id="createSaleForm">
        <div class="form-group">
          <label for="saleAgency">\u4EE3\u7406\u5E97*</label>
          <select id="saleAgency" required>
            <option value="">\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044</option>
            ${activeAgencies.map(agency =>
              `<option value="${agency.id}">${agency.company_name} (Tier${agency.tier_level})</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="saleProduct">\u5546\u54C1*</label>
          <select id="saleProduct" required>
            <option value="">\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044</option>
            ${productsList.map(product =>
              `<option value="${product.id}"
                data-price="${product.price}"
                data-tier1-rate="${product.tier1_commission_rate || 10}"
                data-tier2-rate="${product.tier2_commission_rate || 8}"
                data-tier3-rate="${product.tier3_commission_rate || 6}"
                data-tier4-rate="${product.tier4_commission_rate || 4}"
                data-category="${product.category || ''}"
                >${product.name} - \u00A5${product.price.toLocaleString()}${product.category ? ` (${product.category})` : ''}</option>`
            ).join('')}
          </select>
        </div>
        <div id="productDetails" class="product-details hidden">
          <div class="detail-info">
            <span class="label">\u30AB\u30C6\u30B4\u30EA:</span>
            <span id="productCategory">-</span>
          </div>
          <div class="detail-info">
            <span class="label">\u5831\u916C\u7387:</span>
            <span id="productCommissionRate">-</span>
          </div>
        </div>
        <div class="form-group">
          <label for="saleQuantity">\u6570\u91CF*</label>
          <input type="number" id="saleQuantity" min="1" value="1" required>
        </div>
        <div class="form-group">
          <label for="saleUnitPrice">\u5358\u4FA1</label>
          <input type="text" id="saleUnitPrice" readonly>
        </div>
        <div class="form-group">
          <label for="saleAmount">\u5408\u8A08\u91D1\u984D</label>
          <input type="text" id="saleAmount" readonly>
        </div>
        <div class="form-group" id="estimatedCommissionGroup" style="display: none;">
          <label>\u4E88\u60F3\u5831\u916C\u984D\uFF08\u53C2\u8003\uFF09</label>
          <div id="estimatedCommission" class="estimated-commission">-</div>
        </div>
        <div class="form-group">
          <label for="saleDate">\u58F2\u4E0A\u65E5*</label>
          <input type="date" id="saleDate" value="${new Date().toISOString().split('T')[0]}" required>
        </div>
        <div class="form-group">
          <label for="customerName">\u9867\u5BA2\u540D*</label>
          <input type="text" id="customerName" required>
        </div>
        <div class="form-group">
          <label for="customerEmail">\u9867\u5BA2\u30E1\u30FC\u30EB\u30A2\u30C9\u30EC\u30B9</label>
          <input type="email" id="customerEmail">
        </div>
        <div class="form-group">
          <label for="customerPhone">\u9867\u5BA2\u96FB\u8A71\u756A\u53F7</label>
          <input type="tel" id="customerPhone">
        </div>
        <div class="form-group">
          <label for="saleNotes">\u5099\u8003</label>
          <textarea id="saleNotes" rows="3"></textarea>
        </div>
        <button type="submit" class="btn btn-primary">\u767B\u9332</button>
        <button type="button" class="btn" onclick="app.hideModal()">\u30AD\u30E3\u30F3\u30BB\u30EB</button>
      </form>
    `;

    this.app.showModal(modalContent);

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
          unitPriceInput.value = `\u00A5${price.toLocaleString()}`;
          amountInput.value = `\u00A5${total.toLocaleString()}`;

          // 商品詳細を表示
          productDetails.classList.remove('hidden');
          document.getElementById('productCategory').textContent = category;

          // 選択された代理店のTierに応じた報酬率を表示
          if (selectedAgencyOption && selectedAgencyOption.value) {
            const agencyTier = parseInt(selectedAgencyOption.textContent.match(/Tier(\d)/)?.[1] || 1);
            const commissionRate = parseFloat(selectedOption.dataset[`tier${agencyTier}Rate`]) || 10;

            document.getElementById('productCommissionRate').textContent = `${commissionRate}%\uFF08Tier${agencyTier}\uFF09`;

            // 予想報酬額を計算して表示
            const estimatedCommission = Math.floor(total * commissionRate / 100);
            estimatedCommissionGroup.style.display = 'block';
            document.getElementById('estimatedCommission').innerHTML = `
              <strong>\u00A5${estimatedCommission.toLocaleString()}</strong>
              <small>\uFF08\u58F2\u4E0A \u00A5${total.toLocaleString()} \u00D7 ${commissionRate}%\uFF09</small>
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
        alert('\u58F2\u4E0A\u3092\u767B\u9332\u3057\u307E\u3057\u305F');
        this.app.hideModal();

        // 現在のページが売上ページの場合はリロード
        if (this.app.currentPage === 'sales') {
          await this.loadSales();
        }
      }
    } catch (error) {
      alert('\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ' + error.message);
    }
  }
}
