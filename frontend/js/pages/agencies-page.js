/**
 * 代理店管理ページ
 */
class AgenciesPage {
  constructor(app) {
    this.app = app;
    this.agenciesTableHelper = null;
    this.detailPage = new AgenciesDetailPage(app);
  }

  async init() {
    await this.loadAgencies();
  }

  /**
   * 代理店一覧読み込み
   */
  async loadAgencies(forceReload = false) {
    try {
      const agencies = await agenciesAPI.getAgencies();
      console.log('Agencies data from API:', agencies);

      // フィルタリング
      const filteredAgencies = this.applyAgenciesFilters(agencies);

      // テーブルに表示
      this.renderAgenciesTable(filteredAgencies);

      // フィルターイベント設定
      const tierFilter = document.getElementById('tierFilter');
      const statusFilter = document.getElementById('statusFilter');
      const searchInput = document.getElementById('agencySearch');

      if (tierFilter) {
        tierFilter.onchange = () => {
          const filtered = this.applyAgenciesFilters(agencies);
          this.renderAgenciesTable(filtered);
        };
      }
      if (statusFilter) {
        statusFilter.onchange = () => {
          const filtered = this.applyAgenciesFilters(agencies);
          this.renderAgenciesTable(filtered);
        };
      }
      if (searchInput) {
        searchInput.oninput = () => {
          const filtered = this.applyAgenciesFilters(agencies);
          this.renderAgenciesTable(filtered);
        };
      }

    } catch (error) {
      console.error('Load agencies error:', error);
      const tbody = document.getElementById('agenciesTableBody');
      if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">データの読み込みに失敗しました</td></tr>';
      }
    }
  }

  /**
   * フィルター適用
   */
  applyAgenciesFilters(agencies) {
    let filtered = [...agencies];

    const tierFilter = document.getElementById('tierFilter');
    const statusFilter = document.getElementById('statusFilter');
    const searchInput = document.getElementById('agencySearch');

    if (tierFilter && tierFilter.value) {
      filtered = filtered.filter(a => a.tier_level === parseInt(tierFilter.value));
    }

    if (statusFilter && statusFilter.value) {
      filtered = filtered.filter(a => a.status === statusFilter.value);
    }

    if (searchInput && searchInput.value) {
      const search = searchInput.value.toLowerCase();
      filtered = filtered.filter(a =>
        (a.company_name && a.company_name.toLowerCase().includes(search)) ||
        (a.agency_code && a.agency_code.toLowerCase().includes(search)) ||
        (a.contact_email && a.contact_email.toLowerCase().includes(search))
      );
    }

    return filtered;
  }

  /**
   * 代理店テーブル描画
   */
  renderAgenciesTable(agencies) {
    const tbody = document.getElementById('agenciesTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!agencies || agencies.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">代理店データがありません</td></tr>';
      return;
    }

    agencies.forEach(agency => {
      const row = document.createElement('tr');

      const statusBadge = agency.status === 'active' ? '<span class="status-badge active">有効</span>' :
                          agency.status === 'pending' ? '<span class="status-badge pending">承認待ち</span>' :
                          agency.status === 'suspended' ? '<span class="status-badge suspended">停止中</span>' :
                          agency.status === 'rejected' ? '<span class="status-badge rejected">却下</span>' :
                          `<span class="status-badge">${agency.status}</span>`;

      // ステータスに応じたアクションボタン
      let actionButtons = `<button class="btn btn-sm btn-info" onclick="app.viewAgency('${agency.id}')">詳細</button>`;

      if (authAPI.isAdmin()) {
        if (agency.status === 'pending') {
          actionButtons += ` <button class="btn btn-sm btn-success" onclick="app.approveAgency('${agency.id}')">承認</button>`;
          actionButtons += ` <button class="btn btn-sm btn-danger" onclick="app.rejectAgency('${agency.id}')">拒否</button>`;
        } else if (agency.status === 'active') {
          actionButtons += ` <button class="btn btn-sm btn-warning" onclick="app.suspendAgency('${agency.id}')">停止</button>`;
        } else if (agency.status === 'suspended' || agency.status === 'rejected') {
          actionButtons += ` <button class="btn btn-sm btn-success" onclick="app.reactivateAgency('${agency.id}')">再有効化</button>`;
        }
      }

      row.innerHTML = `
        <td>${agency.agency_code || '-'}</td>
        <td>${agency.company_name || '-'}</td>
        <td>Tier ${agency.tier_level || '-'}</td>
        <td>${agency.representative_name || '-'}</td>
        <td>${agency.contact_email || '-'}</td>
        <td>${statusBadge}</td>
        <td>${actionButtons}</td>
      `;

      tbody.appendChild(row);
    });
  }

  // === AgenciesDetailPage へ委譲 ===

  async viewAgency(agencyId) {
    return this.detailPage.viewAgency(agencyId);
  }

  async loadRegistrationHistory(agencyId) {
    return this.detailPage.loadRegistrationHistory(agencyId);
  }

  async editAgency(agencyId) {
    return this.detailPage.editAgency(agencyId);
  }

  async saveAgencyChanges(agencyId) {
    return this.detailPage.saveAgencyChanges(agencyId);
  }

  async deleteAgency(agencyId) {
    return this.detailPage.deleteAgency(agencyId);
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

  async showCreateAgencyModal() {
    return this.detailPage.showCreateAgencyModal();
  }

  async createAgency() {
    return this.detailPage.createAgency();
  }
}
