/**
 * キャンペーン管理画面
 */

const campaignsPage = {
  campaigns: [],

  /**
   * キャンペーン一覧読み込み
   */
  async loadCampaigns() {
    try {
      // ローディング表示
      const tbody = document.getElementById('campaignsTable')?.querySelector('tbody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">読み込み中...</td></tr>';
      }

      // データ取得
      this.campaigns = await window.campaignsAPI.getCampaigns({ include_expired: true });

      // テーブル更新
      this.renderCampaignsTable();
    } catch (error) {
      errorLog('Load campaigns error:', error);
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">データの読み込みに失敗しました</td></tr>';
      }
    }
  },

  /**
   * キャンペーンテーブル描画
   */
  renderCampaignsTable() {
    const tbody = document.getElementById('campaignsTable')?.querySelector('tbody');
    if (!tbody) return;

    if (!this.campaigns || this.campaigns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center">キャンペーンがありません</td></tr>';
      return;
    }

    // イベントデリゲーション
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (action === 'editCampaign') window.campaignsPage.editCampaign(id);
      else if (action === 'deleteCampaign') window.campaignsPage.deleteCampaign(id);
    });

    tbody.innerHTML = this.campaigns.map(campaign => {
      const statusBadge = this.getStatusBadge(campaign.status);
      const bonusDisplay = campaign.bonus_type === 'percentage'
        ? `${campaign.bonus_value}%`
        : `¥${campaign.bonus_value.toLocaleString()}`;

      return `
        <tr>
          <td>${escapeHtml(campaign.name)}</td>
          <td>${this.formatDate(campaign.start_date)}</td>
          <td>${this.formatDate(campaign.end_date)}</td>
          <td>${bonusDisplay}</td>
          <td>${this.getTargetDisplay(campaign)}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-sm btn-primary" data-action="editCampaign" data-id="${escapeHtml(campaign.id)}">編集</button>
            <button class="btn btn-sm btn-danger" data-action="deleteCampaign" data-id="${escapeHtml(campaign.id)}">削除</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  /**
   * ステータスバッジ取得
   */
  getStatusBadge(status) {
    const badges = {
      'scheduled': '<span class="badge badge-info">開始前</span>',
      'active': '<span class="badge badge-success">実施中</span>',
      'expired': '<span class="badge badge-secondary">終了</span>',
      'inactive': '<span class="badge badge-warning">無効</span>'
    };
    return badges[status] || status;
  },

  /**
   * 対象表示
   */
  getTargetDisplay(campaign) {
    const targets = [];

    if (campaign.target_products && campaign.target_products.length > 0) {
      targets.push(`商品: ${campaign.target_products.length}件`);
    }
    if (campaign.target_tiers && campaign.target_tiers.length > 0) {
      targets.push(`Tier: ${campaign.target_tiers.join(',')}`);
    }
    if (campaign.target_agencies && campaign.target_agencies.length > 0) {
      targets.push(`代理店: ${campaign.target_agencies.length}社`);
    }

    return targets.length > 0 ? targets.join(', ') : '全体';
  },

  /**
   * 新規キャンペーンモーダル表示
   */
  async showCreateCampaignModal() {
    // 商品リストを取得
    const response = await window.productsAPI.getProducts();
    const products = response.data || [];

    // 今日の日付と30日後の日付を取得
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const thirtyDaysLaterStr = thirtyDaysLater.toISOString().split('T')[0];

    const modalContent = `
      <div class="modal-header">
        <h3>新規キャンペーン作成</h3>
      </div>
      <div class="modal-body">
        <form id="createCampaignForm">
          <div class="form-group">
            <label for="campaignName">キャンペーン名 <span class="required">*</span></label>
            <input type="text" id="campaignName" class="form-control" required>
          </div>

          <div class="form-group">
            <label for="campaignDescription">説明</label>
            <textarea id="campaignDescription" class="form-control" rows="3"></textarea>
          </div>

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="startDate">開始日 <span class="required">*</span></label>
              <input type="date" id="startDate" class="form-control"
                     min="2020-01-01" max="2099-12-31"
                     value="${todayStr}"
                     required>
            </div>
            <div class="form-group col-md-6">
              <label for="endDate">終了日 <span class="required">*</span></label>
              <input type="date" id="endDate" class="form-control"
                     min="2020-01-01" max="2099-12-31"
                     value="${thirtyDaysLaterStr}"
                     required>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-md-6">
              <label for="bonusType">ボーナスタイプ <span class="required">*</span></label>
              <select id="bonusType" class="form-control" required>
                <option value="percentage">パーセンテージ</option>
                <option value="fixed">固定額</option>
              </select>
            </div>
            <div class="form-group col-md-6">
              <label for="bonusValue">ボーナス値 <span class="required">*</span></label>
              <input type="number" id="bonusValue" class="form-control" step="0.01" required>
              <small class="form-text text-muted" id="bonusValueHelp">パーセンテージの場合は%、固定額の場合は円</small>
            </div>
          </div>

          <div class="form-group">
            <label>対象商品（複数選択可）</label>
            <div style="margin-bottom: 5px;">
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                document.querySelectorAll('input[name=targetProducts]').forEach(cb => cb.checked = true)
              ">全選択</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                document.querySelectorAll('input[name=targetProducts]').forEach(cb => cb.checked = false)
              ">全解除</button>
            </div>
            <div class="selectable-list">
              ${products.length > 0 ? products.map(p => `
                <div class="form-check">
                  <input class="form-check-input" type="checkbox" name="targetProducts" value="${p.id}" id="product_${p.id}">
                  <label class="form-check-label" for="product_${p.id}">
                    ${escapeHtml(p.name || p.product_name)}
                  </label>
                </div>
              `).join('') : '<p class="text-muted">商品がありません</p>'}
            </div>
            <small class="form-text text-muted">選択しない場合は全商品が対象</small>
          </div>

          <div class="form-group">
            <label>対象Tier</label>
            <div class="form-check-group">
              <label class="form-check-inline">
                <input type="checkbox" name="targetTiers" value="1"> Tier 1
              </label>
              <label class="form-check-inline">
                <input type="checkbox" name="targetTiers" value="2"> Tier 2
              </label>
              <label class="form-check-inline">
                <input type="checkbox" name="targetTiers" value="3"> Tier 3
              </label>
              <label class="form-check-inline">
                <input type="checkbox" name="targetTiers" value="4"> Tier 4
              </label>
            </div>
            <small class="form-text text-muted">選択しない場合は全Tierが対象</small>
          </div>

          <div class="form-group">
            <label for="minAmount">最小売上額（オプション）</label>
            <input type="number" id="minAmount" class="form-control" step="1">
            <small class="form-text text-muted">この金額以上の売上のみボーナス対象</small>
          </div>

          <div class="form-group">
            <label for="maxBonusPerAgency">代理店あたりの最大ボーナス額（オプション）</label>
            <input type="number" id="maxBonusPerAgency" class="form-control" step="1">
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" onclick="app.closeModal()">キャンセル</button>
        <button type="button" class="btn btn-primary" onclick="campaignsPage.createCampaign()">作成</button>
      </div>
    `;

    document.getElementById('modalBody').innerHTML = modalContent;
    document.getElementById('modal').classList.remove('hidden');

    // ボーナスタイプ変更時のヘルプテキスト更新
    document.getElementById('bonusType').addEventListener('change', (e) => {
      const help = document.getElementById('bonusValueHelp');
      if (e.target.value === 'percentage') {
        help.textContent = 'パーセンテージを入力（例: 5 = 5%）';
      } else {
        help.textContent = '固定額を円で入力（例: 1000 = 1,000円）';
      }
    });
  },

  /**
   * キャンペーン作成
   */
  async createCampaign() {
    try {
      const form = document.getElementById('createCampaignForm');

      if (!form) {
        app.showMessage('message', 'フォームが見つかりません', 'error');
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // フォームデータ収集
      const selectedProducts = Array.from(document.querySelectorAll('input[name="targetProducts"]:checked'))
        .map(cb => cb.value);
      const selectedTiers = Array.from(document.querySelectorAll('input[name="targetTiers"]:checked'))
        .map(cb => parseInt(cb.value));

      // 日付をISO8601形式に変換（フォーム内から要素を取得）
      const startDateElement = form.querySelector('#startDate');
      const endDateElement = form.querySelector('#endDate');

      const startDateValue = startDateElement ? startDateElement.value : '';
      const endDateValue = endDateElement ? endDateElement.value : '';

      if (!startDateValue || !endDateValue) {
        app.showMessage('message', '開始日と終了日を入力してください', 'error');
        return;
      }

      const startDate = new Date(startDateValue + 'T00:00:00');
      const endDate = new Date(endDateValue + 'T23:59:59');

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        app.showMessage('message', '日付の形式が正しくありません', 'error');
        return;
      }

      if (startDate >= endDate) {
        app.showMessage('message', '終了日は開始日より後の日付を選択してください', 'error');
        return;
      }

      const campaignData = {
        name: form.querySelector('#campaignName').value,
        description: form.querySelector('#campaignDescription').value || null,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        bonus_type: form.querySelector('#bonusType').value,
        bonus_value: parseFloat(form.querySelector('#bonusValue').value),
        target_products: selectedProducts.length > 0 ? selectedProducts : null,
        target_tiers: selectedTiers.length > 0 ? selectedTiers : null,
        conditions: {}
      };

      // オプション条件
      const minAmount = form.querySelector('#minAmount').value;
      if (minAmount) {
        campaignData.conditions.min_amount = parseFloat(minAmount);
      }

      const maxBonus = form.querySelector('#maxBonusPerAgency').value;
      if (maxBonus) {
        campaignData.max_bonus_per_agency = parseFloat(maxBonus);
      }

      // API呼び出し
      const response = await window.campaignsAPI.createCampaign(campaignData);

      if (response.success) {
        app.closeModal();
        app.showMessage('message', 'キャンペーンを作成しました', 'success');
        await this.loadCampaigns();
      }
    } catch (error) {
      errorLog('Create campaign error:', error);
      app.showMessage('message', error.message || 'キャンペーンの作成に失敗しました', 'error');
    }
  },

  /**
   * キャンペーン編集
   */
  async editCampaign(id) {
    try {
      const response = await window.campaignsAPI.getCampaignDetail(id);
      const campaign = response.data;

      if (!campaign) {
        app.showMessage('message', 'キャンペーンが見つかりません', 'error');
        return;
      }

      // 商品リストを取得
      let products = [];
      try {
        if (!window.productsAPI) {
          throw new Error('productsAPI is not defined');
        }
        const productsResponse = await window.productsAPI.getProducts();
        products = productsResponse.data || [];
      } catch (productError) {
        products = [];
      }

      // 日付をフォーマット
      const startDate = campaign.start_date ? campaign.start_date.split('T')[0] : '';
      const endDate = campaign.end_date ? campaign.end_date.split('T')[0] : '';
      try {
        const modalContent = `
        <div class="modal-header">
          <h3>キャンペーン編集</h3>
        </div>
        <div class="modal-body">
          <form id="editCampaignForm">
            <div class="form-group">
              <label for="campaignName">キャンペーン名 <span class="required">*</span></label>
              <input type="text" id="campaignName" class="form-control" value="${escapeHtml(campaign.name)}" required>
            </div>

            <div class="form-group">
              <label for="campaignDescription">説明</label>
              <textarea id="campaignDescription" class="form-control" rows="3">${escapeHtml(campaign.description)}</textarea>
            </div>

            <div class="form-row">
              <div class="form-group col-md-6">
                <label for="startDate">開始日 <span class="required">*</span></label>
                <input type="date" id="startDate" class="form-control"
                       min="2020-01-01" max="2099-12-31"
                       value="${startDate}"
                       required>
              </div>
              <div class="form-group col-md-6">
                <label for="endDate">終了日 <span class="required">*</span></label>
                <input type="date" id="endDate" class="form-control"
                       min="2020-01-01" max="2099-12-31"
                       value="${endDate}"
                       required>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col-md-6">
                <label for="bonusType">ボーナスタイプ <span class="required">*</span></label>
                <select id="bonusType" class="form-control" required>
                  <option value="percentage" ${campaign.bonus_type === 'percentage' ? 'selected' : ''}>パーセンテージ</option>
                  <option value="fixed" ${campaign.bonus_type === 'fixed' ? 'selected' : ''}>固定額</option>
                </select>
              </div>
              <div class="form-group col-md-6">
                <label for="bonusValue">ボーナス値 <span class="required">*</span></label>
                <input type="number" id="bonusValue" class="form-control" step="0.01" value="${campaign.bonus_value || ''}" required>
                <small class="form-text text-muted" id="bonusValueHelp">
                  ${campaign.bonus_type === 'percentage' ? 'パーセンテージを入力（例: 5 = 5%）' : '固定額を円で入力（例: 1000 = 1,000円）'}
                </small>
              </div>
            </div>

            <div class="form-group">
              <label>対象商品（複数選択可）</label>
              <div style="margin-bottom: 5px;">
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                  document.querySelectorAll('input[name=targetProducts]').forEach(cb => cb.checked = true)
                ">全選択</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="
                  document.querySelectorAll('input[name=targetProducts]').forEach(cb => cb.checked = false)
                ">全解除</button>
              </div>
              <div class="selectable-list">
                ${products.length > 0 ? products.map(p => `
                  <div class="form-check">
                    <input class="form-check-input" type="checkbox" name="targetProducts"
                           value="${p.id}" id="product_${p.id}"
                           ${campaign.target_products && campaign.target_products.includes(p.id) ? 'checked' :
                             (!campaign.target_products || campaign.target_products.length === 0 ? 'checked' : '')}>
                    <label class="form-check-label" for="product_${p.id}">
                      ${escapeHtml(p.name || p.product_name)}
                    </label>
                  </div>
                `).join('') : '<p class="text-muted">商品がありません</p>'}
              </div>
              <small class="form-text text-muted">選択しない場合は全商品が対象</small>
            </div>

            <div class="form-group">
              <label>対象Tier</label>
              <div class="form-check-group">
                ${[1, 2, 3, 4].map(tier => `
                  <label class="form-check-inline">
                    <input type="checkbox" name="targetTiers" value="${tier}"
                           ${campaign.target_tiers && campaign.target_tiers.includes(tier) ? 'checked' : ''}>
                    Tier ${tier}
                  </label>
                `).join('')}
              </div>
              <small class="form-text text-muted">選択しない場合は全Tierが対象</small>
            </div>

            <div class="form-group">
              <label for="minAmount">最小売上額（オプション）</label>
              <input type="number" id="minAmount" class="form-control" step="1"
                     value="${campaign.conditions?.min_amount || ''}">
              <small class="form-text text-muted">この金額以上の売上のみボーナス対象</small>
            </div>

            <div class="form-group">
              <label for="maxBonusPerAgency">代理店あたりの最大ボーナス額（オプション）</label>
              <input type="number" id="maxBonusPerAgency" class="form-control" step="1"
                     value="${campaign.conditions?.max_bonus_per_agency || ''}">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="app.hideModal()">キャンセル</button>
          <button type="button" class="btn btn-primary" id="updateCampaignBtn" data-id="${escapeHtml(id)}">更新</button>
        </div>
      `;

      const modalBody = document.getElementById('modalBody');
      const modal = document.getElementById('modal');

      if (!modalBody || !modal) {
        return;
      }

      modalBody.innerHTML = modalContent;
      modal.classList.remove('hidden');

      // ボーナスタイプ変更時のヘルプテキスト更新
      document.getElementById('bonusType').addEventListener('change', (e) => {
        const help = document.getElementById('bonusValueHelp');
        if (e.target.value === 'percentage') {
          help.textContent = 'パーセンテージを入力（例: 5 = 5%）';
        } else {
          help.textContent = '固定額を円で入力（例: 1000 = 1,000円）';
        }
      });

      // 更新ボタンのイベントリスナー
      document.getElementById('updateCampaignBtn')?.addEventListener('click', () => {
        const campaignId = document.getElementById('updateCampaignBtn').dataset.id;
        window.campaignsPage.updateCampaign(campaignId);
      });
      } catch (modalError) {
        app.showMessage('message', 'モーダルの表示に失敗しました', 'error');
      }
    } catch (error) {
      errorLog('Edit campaign error:', error);
      app.showMessage('message', 'キャンペーンの取得に失敗しました', 'error');
    }
  },

  /**
   * キャンペーン更新
   */
  async updateCampaign(id) {
    try {
      const form = document.getElementById('editCampaignForm');

      if (!form) {
        app.showMessage('message', 'フォームが見つかりません', 'error');
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      // フォームデータ収集
      const selectedProducts = Array.from(document.querySelectorAll('input[name="targetProducts"]:checked'))
        .map(cb => cb.value);
      const selectedTiers = Array.from(document.querySelectorAll('input[name="targetTiers"]:checked'))
        .map(cb => parseInt(cb.value));

      // 日付をISO8601形式に変換（フォーム内から要素を取得）
      const startDateElement = form.querySelector('#startDate');
      const endDateElement = form.querySelector('#endDate');

      const startDateValue = startDateElement ? startDateElement.value : '';
      const endDateValue = endDateElement ? endDateElement.value : '';

      if (!startDateValue || !endDateValue) {
        app.showMessage('message', '開始日と終了日を入力してください', 'error');
        return;
      }

      const startDate = new Date(startDateValue + 'T00:00:00');
      const endDate = new Date(endDateValue + 'T23:59:59');

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        app.showMessage('message', '日付の形式が正しくありません', 'error');
        return;
      }

      if (startDate >= endDate) {
        app.showMessage('message', '終了日は開始日より後の日付を選択してください', 'error');
        return;
      }

      const campaignData = {
        name: form.querySelector('#campaignName').value,
        description: form.querySelector('#campaignDescription').value || null,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        bonus_type: form.querySelector('#bonusType').value,
        bonus_value: parseFloat(form.querySelector('#bonusValue').value),
        target_products: selectedProducts.length > 0 ? selectedProducts : null,
        target_tiers: selectedTiers.length > 0 ? selectedTiers : null,
        conditions: {}
      };

      // オプション条件
      const minAmount = form.querySelector('#minAmount').value;
      if (minAmount) {
        campaignData.conditions.min_amount = parseFloat(minAmount);
      }

      const maxBonus = form.querySelector('#maxBonusPerAgency').value;
      if (maxBonus) {
        campaignData.max_bonus_per_agency = parseFloat(maxBonus);
      }

      // API呼び出し
      const response = await window.campaignsAPI.updateCampaign(id, campaignData);

      if (response.success) {
        app.hideModal();
        app.showMessage('message', 'キャンペーンを更新しました', 'success');
        await this.loadCampaigns();
      }
    } catch (error) {
      errorLog('Update campaign error:', error);
      app.showMessage('message', error.message || 'キャンペーンの更新に失敗しました', 'error');
    }
  },

  /**
   * キャンペーン削除
   */
  async deleteCampaign(id) {
    if (!confirm('このキャンペーンを削除しますか？')) return;

    try {
      const response = await window.campaignsAPI.deleteCampaign(id);

      if (response.success) {
        app.showMessage('message', 'キャンペーンを削除しました', 'success');
        await this.loadCampaigns();
      }
    } catch (error) {
      errorLog('Delete campaign error:', error);
      app.showMessage('message', 'キャンペーンの削除に失敗しました', 'error');
    }
  },

  /**
   * 日付フォーマット
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP');
  }
};

// グローバルスコープに公開（HTMLのonclickから呼び出し可能にする）
window.campaignsPage = campaignsPage;