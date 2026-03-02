/**
 * テーブルヘルパークラス
 * ソート・フィルタ・ページネーション機能を提供
 */
class TableHelper {
  constructor(config) {
    this.data = [];
    this.filteredData = [];
    this.currentPage = 1;
    this.itemsPerPage = config.itemsPerPage || 25;
    this.sortColumn = config.defaultSortColumn || null;
    this.sortDirection = config.defaultSortDirection || 'asc';
    this.filters = {};
    this.renderCallback = config.renderCallback; // テーブル行の描画関数
    this.containerElement = config.containerElement; // テーブルコンテナ
  }

  /**
   * データをセット
   */
  setData(data) {
    this.data = data || [];
    this.applyFiltersAndSort();
  }

  /**
   * フィルタを設定
   */
  setFilter(filterName, filterValue) {
    this.filters[filterName] = filterValue;
    this.currentPage = 1; // フィルタ変更時は1ページ目に戻る
    this.applyFiltersAndSort();
  }

  /**
   * 複数フィルタを一括設定
   */
  setFilters(filters) {
    this.filters = { ...filters };
    this.currentPage = 1;
    this.applyFiltersAndSort();
  }

  /**
   * ソート設定
   */
  setSort(column) {
    if (this.sortColumn === column) {
      // 同じ列なら方向を反転
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFiltersAndSort();
  }

  /**
   * ページ変更
   */
  setPage(page) {
    const totalPages = this.getTotalPages();
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.render();
    }
  }

  /**
   * 1ページあたりの表示件数を変更
   */
  setItemsPerPage(itemsPerPage) {
    this.itemsPerPage = itemsPerPage;
    this.currentPage = 1;
    this.render();
  }

  /**
   * フィルタとソートを適用
   */
  applyFiltersAndSort() {
    // フィルタリング
    this.filteredData = this.data.filter(item => {
      for (let filterName in this.filters) {
        const filterValue = this.filters[filterName];
        if (!filterValue || filterValue === '') continue;

        // カスタムフィルタ関数が定義されている場合
        if (typeof filterValue === 'function') {
          if (!filterValue(item)) return false;
        }
        // テキスト検索（部分一致）
        else if (typeof filterValue === 'string') {
          const searchText = filterValue.toLowerCase();
          const itemValue = String(item[filterName] || '').toLowerCase();
          if (!itemValue.includes(searchText)) return false;
        }
        // 完全一致
        else {
          if (item[filterName] !== filterValue) return false;
        }
      }
      return true;
    });

    // ソート
    if (this.sortColumn) {
      this.filteredData.sort((a, b) => {
        let aVal = a[this.sortColumn];
        let bVal = b[this.sortColumn];

        // null/undefinedを末尾に
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        // 数値比較
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // 日付比較
        if (aVal instanceof Date && bVal instanceof Date) {
          return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // 文字列比較
        aVal = String(aVal).toLowerCase();
        bVal = String(bVal).toLowerCase();
        if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    this.render();
  }

  /**
   * 現在のページのデータを取得
   */
  getCurrentPageData() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.filteredData.slice(startIndex, endIndex);
  }

  /**
   * 総ページ数を取得
   */
  getTotalPages() {
    return Math.ceil(this.filteredData.length / this.itemsPerPage);
  }

  /**
   * テーブルを描画
   */
  render() {
    if (!this.renderCallback || !this.containerElement) return;

    const pageData = this.getCurrentPageData();
    this.renderCallback(pageData);
    this.renderPagination();
    this.applyTextOverflow();
  }

  /**
   * 長いテキストにtext-overflowクラスを追加
   */
  applyTextOverflow() {
    // 描画後に実行
    setTimeout(() => {
      const table = this.containerElement.querySelector('table');
      if (!table) return;

      const cells = table.querySelectorAll('tbody td');
      cells.forEach(cell => {
        const text = cell.textContent.trim();
        // 20文字以上のテキストを長いテキストと判定
        if (text.length > 20) {
          cell.classList.add('text-overflow');
          cell.setAttribute('data-full-text', text);
        }
      });
    }, 10);
  }

  /**
   * ページネーションUIを描画
   */
  renderPagination() {
    const paginationContainer = this.containerElement.querySelector('.pagination-container');
    if (!paginationContainer) return;

    const totalPages = this.getTotalPages();
    const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
    const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredData.length);

    let paginationHTML = `
      <div class="pagination-info">
        ${this.filteredData.length}件中 ${startItem}-${endItem}件を表示
      </div>
      <div class="pagination-controls">
        <button class="btn-pagination btn-prev" ${this.currentPage === 1 ? 'disabled' : ''} data-page="${this.currentPage - 1}">
          ◀ 前へ
        </button>
    `;

    // ページ番号ボタン
    const maxPageButtons = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPageButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);

    if (endPage - startPage + 1 < maxPageButtons) {
      startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    if (startPage > 1) {
      paginationHTML += `<button class="btn-pagination btn-page" data-page="1">1</button>`;
      if (startPage > 2) paginationHTML += `<span class="pagination-ellipsis">...</span>`;
    }

    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
        <button class="btn-pagination btn-page ${i === this.currentPage ? 'active' : ''}" data-page="${i}">
          ${i}
        </button>
      `;
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) paginationHTML += `<span class="pagination-ellipsis">...</span>`;
      paginationHTML += `<button class="btn-pagination btn-page" data-page="${totalPages}">${totalPages}</button>`;
    }

    paginationHTML += `
        <button class="btn-pagination btn-next" ${this.currentPage === totalPages ? 'disabled' : ''} data-page="${this.currentPage + 1}">
          次へ ▶
        </button>
      </div>
      <div class="pagination-perpage">
        <select class="perpage-select">
          <option value="10" ${this.itemsPerPage === 10 ? 'selected' : ''}>10件</option>
          <option value="25" ${this.itemsPerPage === 25 ? 'selected' : ''}>25件</option>
          <option value="50" ${this.itemsPerPage === 50 ? 'selected' : ''}>50件</option>
          <option value="100" ${this.itemsPerPage === 100 ? 'selected' : ''}>100件</option>
        </select>
      </div>
    `;

    paginationContainer.innerHTML = paginationHTML;

    // イベントリスナーを設定（既存コードに影響を与えないよう、クラス名でイベント委譲）
    paginationContainer.querySelectorAll('.btn-page, .btn-prev, .btn-next').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!btn.disabled) {
          const page = parseInt(btn.dataset.page);
          this.setPage(page);
        }
      });
    });

    paginationContainer.querySelector('.perpage-select')?.addEventListener('change', (e) => {
      this.setItemsPerPage(parseInt(e.target.value));
    });
  }

  /**
   * ソート可能な列ヘッダーを生成
   */
  createSortableHeader(columnName, displayName) {
    const isSorted = this.sortColumn === columnName;
    const direction = isSorted ? this.sortDirection : '';
    const arrow = isSorted ? (direction === 'asc' ? ' ▲' : ' ▼') : '';

    return `
      <th class="sortable ${isSorted ? 'sorted' : ''}" data-sort-column="${escapeHtml(columnName)}">
        ${displayName}${arrow}
      </th>
    `;
  }
}

// グローバルスコープに登録
window.TableHelper = TableHelper;
