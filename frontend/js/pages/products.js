/**
 * 商品管理ページ
 */

class ProductsPage {
  constructor() {
    this.products = [];
  }

  async init() {
    await this.loadProducts();
    this.setupEventListeners();
  }

  /**
   * イベントリスナー設定
   */
  setupEventListeners() {
    // 新規商品追加ボタン
    const addProductBtn = document.getElementById('addProductBtn');
    if (addProductBtn) {
      addProductBtn.addEventListener('click', () => this.showProductModal());
    }
  }

  /**
   * 商品一覧の読み込み
   */
  async loadProducts() {
    try {
      const response = await window.productsAPI.getProducts();
      if (response.success && response.data) {
        this.products = response.data;

        // TableHelperの初期化（初回のみ）
        if (!this.productsTableHelper) {
          const containerElement = document.querySelector('#productsPage .table-container');

          this.productsTableHelper = new TableHelper({
            itemsPerPage: 25,
            defaultSortColumn: 'name',
            defaultSortDirection: 'asc',
            containerElement: containerElement,
            renderCallback: (pageData) => this.renderProductsTable(pageData)
          });

          // イベントリスナー設定
          const setupEventListeners = () => {
            // 検索フィルター
            const searchInput = document.getElementById('productSearch');
            if (searchInput) {
              const newSearchInput = searchInput.cloneNode(true);
              searchInput.parentNode.replaceChild(newSearchInput, searchInput);
              newSearchInput.addEventListener('input', () => {
                this.applyProductsFilters();
              });
            }

            // ステータスフィルター
            const statusFilter = document.getElementById('productStatusFilter');
            if (statusFilter) {
              const newStatusFilter = statusFilter.cloneNode(true);
              statusFilter.parentNode.replaceChild(newStatusFilter, statusFilter);
              newStatusFilter.addEventListener('change', () => {
                this.applyProductsFilters();
              });
            }

            // ソート可能なヘッダー
            document.querySelectorAll('#productsTable th.sortable').forEach(header => {
              const newHeader = header.cloneNode(true);
              header.parentNode.replaceChild(newHeader, header);
              newHeader.addEventListener('click', () => {
                const column = newHeader.dataset.column;

                // 既存のソートクラスをクリア
                document.querySelectorAll('#productsTable th.sortable').forEach(h => {
                  h.classList.remove('sorted-asc', 'sorted-desc');
                });

                this.productsTableHelper.setSort(column);

                // 新しいソート状態を反映
                const direction = this.productsTableHelper.sortDirection;
                newHeader.classList.add(direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
              });
            });
          };

          setupEventListeners();

          // デフォルトのソート表示を設定
          const defaultSortHeader = document.querySelector(`#productsTable th.sortable[data-column="name"]`);
          if (defaultSortHeader) {
            defaultSortHeader.classList.add('sorted-asc');
          }
        }

        // データを正規化
        const normalizedData = response.data.map(product => ({
          ...product,
          status: product.is_active ? 'active' : 'inactive',
          tier1_rate: product.tier1_commission_rate || 0,
          tier2_rate: product.tier2_commission_rate || 0,
          tier3_rate: product.tier3_commission_rate || 0,
          tier4_rate: product.tier4_commission_rate || 0
        }));

        this.productsTableHelper.setData(normalizedData);
        this.applyProductsFilters();
      }
    } catch (error) {
      console.error('Load products error:', error);
    }
  }

  /**
   * 商品フィルタを適用
   */
  applyProductsFilters() {
    const searchText = document.getElementById('productSearch')?.value || '';
    const statusFilter = document.getElementById('productStatusFilter')?.value || '';

    this.productsTableHelper.setFilters({
      search: (product) => {
        if (!searchText) return true;
        const text = searchText.toLowerCase();
        return product.name?.toLowerCase().includes(text) ||
               product.product_code?.toLowerCase().includes(text);
      },
      status: (product) => {
        if (!statusFilter) return true;
        return product.status === statusFilter;
      }
    });
  }

  /**
   * 商品一覧の表示（下位互換のため残す）
   */
  displayProducts() {
    // TableHelperを使う場合は何もしない
    if (this.productsTableHelper) return;
  }

  /**
   * 商品テーブル描画
   */
  renderProductsTable(products) {
    const tbody = document.querySelector('#productsTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!products || products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 20px;">
            商品データがありません
          </td>
        </tr>
      `;
      return;
    }

    products.forEach(product => {
      const row = document.createElement('tr');
      const statusText = product.is_active ? 'アクティブ' : '無効';
      const statusClass = product.is_active ? 'status-active' : 'status-inactive';

      row.innerHTML = `
        <td>${product.product_code || '-'}</td>
        <td>${product.name}</td>
        <td>¥${(product.price || 0).toLocaleString()}</td>
        <td>${(product.tier1_commission_rate || 0)}%</td>
        <td>${(product.tier2_commission_rate || 0)}%</td>
        <td>${(product.tier3_commission_rate || 0)}%</td>
        <td>${(product.tier4_commission_rate || 0)}%</td>
        <td><span class="status ${statusClass}">${statusText}</span></td>
        <td>
          <button class="btn btn-small btn-secondary" onclick="window.productsPage.showProductModal('${product.id}')">編集</button>
          <button class="btn btn-small btn-danger" onclick="window.productsPage.deleteProduct('${product.id}')">削除</button>
        </td>
      `;

      tbody.appendChild(row);
    });
  }

  /**
   * 商品モーダルの表示
   */
  async showProductModal(productId = null) {
    const isEdit = !!productId;
    let product = null;

    if (isEdit) {
      product = this.products.find(p => p.id === productId);
      if (!product) {
        alert('商品が見つかりません');
        return;
      }
    }

    // ユーザー情報取得
    const userStr = localStorage.getItem('agency_system_user');
    const user = userStr ? JSON.parse(userStr) : null;
    const isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');
    const agencyTier = user && user.role === 'agency' ? user.tier : null;

    // 階層に応じた編集可否を判定
    const canEditTier = (tierNum) => {
      if (isAdmin) return true; // 管理者は全て編集可能
      if (!agencyTier) return false; // 代理店情報がない場合は編集不可

      if (agencyTier === 1) return true; // Tier1は全階層編集可能
      if (agencyTier === 2) return tierNum !== 1; // Tier2はTier1以外編集可能
      if (agencyTier === 3) return tierNum >= 3; // Tier3はTier3,4のみ編集可能
      if (agencyTier === 4) return tierNum === 4; // Tier4はTier4のみ編集可能
      return false;
    };

    const modalContent = `
      <h3>${isEdit ? '商品編集' : '新規商品追加'}</h3>
      <form id="productForm">
        <div class="form-row">
          <div class="form-group">
            <label for="productCode">商品コード*</label>
            <input type="text" id="productCode" value="${product?.product_code || '自動生成されます'}" readonly style="background-color: #f5f5f5; color: #666;">
          </div>
          <div class="form-group">
            <label for="productName">商品名*</label>
            <input type="text" id="productName" value="${product?.name || ''}" required>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="productPrice">価格*</label>
            <input type="number" id="productPrice" value="${product?.price || ''}" min="0" required>
          </div>
          <div class="form-group">
            <label for="productDescription">説明</label>
            <textarea id="productDescription" rows="3">${product?.description || ''}</textarea>
          </div>
        </div>

        <h4>Tier別報酬率設定</h4>
        <div class="commission-rates-grid">
          <div class="form-group">
            <label for="tier1Rate">Tier 1 報酬率 (%)</label>
            <input type="number" id="tier1Rate" value="${product?.tier1_commission_rate || 10}" min="0" max="100" step="0.01" ${canEditTier(1) ? '' : 'readonly style="background-color: #f5f5f5;"'}>
            ${!canEditTier(1) ? '<small style="color: #999;">編集権限がありません</small>' : ''}
          </div>
          <div class="form-group">
            <label for="tier2Rate">Tier 2 報酬率 (%)</label>
            <input type="number" id="tier2Rate" value="${product?.tier2_commission_rate || 8}" min="0" max="100" step="0.01" ${canEditTier(2) ? '' : 'readonly style="background-color: #f5f5f5;"'}>
            ${!canEditTier(2) ? '<small style="color: #999;">編集権限がありません</small>' : ''}
          </div>
          <div class="form-group">
            <label for="tier3Rate">Tier 3 報酬率 (%)</label>
            <input type="number" id="tier3Rate" value="${product?.tier3_commission_rate || 6}" min="0" max="100" step="0.01" ${canEditTier(3) ? '' : 'readonly style="background-color: #f5f5f5;"'}>
            ${!canEditTier(3) ? '<small style="color: #999;">編集権限がありません</small>' : ''}
          </div>
          <div class="form-group">
            <label for="tier4Rate">Tier 4 報酬率 (%)</label>
            <input type="number" id="tier4Rate" value="${product?.tier4_commission_rate || 4}" min="0" max="100" step="0.01" ${canEditTier(4) ? '' : 'readonly style="background-color: #f5f5f5;"'}>
            ${!canEditTier(4) ? '<small style="color: #999;">編集権限がありません</small>' : ''}
          </div>
        </div>

        <div class="form-group">
          <label for="isActive" style="display: flex; align-items: center; gap: 8px;">
            販売中にする
            <input type="checkbox" id="isActive" ${product?.is_active !== false ? 'checked' : ''} style="margin: 0;">
            <small style="color: #666; font-weight: normal; margin-left: 8px;">
              チェックを外すと売上登録時の選択肢に表示されません
            </small>
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary">
            ${isEdit ? '更新' : '作成'}
          </button>
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">
            キャンセル
          </button>
        </div>
      </form>
    `;

    // モーダルを表示
    app.showModal(modalContent);

    // フォーム送信イベント
    const form = document.getElementById('productForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.saveProduct(productId);
    });
  }

  /**
   * 商品保存
   */
  async saveProduct(productId = null) {
    const isEdit = !!productId;

    const productData = {
      product_name: document.getElementById('productName').value,
      price: parseFloat(document.getElementById('productPrice').value),
      description: document.getElementById('productDescription').value,
      commission_rate_tier1: parseFloat(document.getElementById('tier1Rate').value),
      commission_rate_tier2: parseFloat(document.getElementById('tier2Rate').value),
      commission_rate_tier3: parseFloat(document.getElementById('tier3Rate').value),
      commission_rate_tier4: parseFloat(document.getElementById('tier4Rate').value),
      is_active: document.getElementById('isActive').checked
    };

    // 編集時のみ商品コードを含める（読み取り専用なので変更されない）
    if (isEdit) {
      productData.product_code = document.getElementById('productCode').value;
    }

    try {
      let response;
      if (isEdit) {
        response = await window.productsAPI.updateProduct(productId, productData);
      } else {
        response = await window.productsAPI.createProduct(productData);
      }

      if (response.success) {
        alert(isEdit ? '商品を更新しました' : '商品を作成しました');
        app.closeModal();
        await this.loadProducts();
      } else {
        alert(response.message || '保存に失敗しました');
      }
    } catch (error) {
      console.error('Save product error:', error);
      alert('エラーが発生しました');
    }
  }

  /**
   * 商品削除
   */
  async deleteProduct(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) {
      alert('商品が見つかりません');
      return;
    }

    if (!confirm(`商品「${product.name}」を削除しますか？`)) {
      return;
    }

    try {
      const response = await window.productsAPI.deleteProduct(productId);
      if (response.success) {
        alert('商品を削除しました');
        await this.loadProducts();
      } else {
        alert(response.message || '削除に失敗しました');
      }
    } catch (error) {
      console.error('Delete product error:', error);
      alert('エラーが発生しました');
    }
  }
}

// グローバルスコープに登録
window.ProductsPage = ProductsPage;
window.productsPage = new ProductsPage();