/**
 * 代理店 詳細・編集・作成ページ
 */
class AgenciesDetailPage {
  constructor(app) {
    this.app = app;
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
                <td>${escapeHtml(agencyData.agency_code) || '-'}</td>
              </tr>
              <tr>
                <th>会社名</th>
                <td>${escapeHtml(agencyData.company_name) || '-'}</td>
              </tr>
              <tr>
                <th>会社種別</th>
                <td>${escapeHtml(agencyData.company_type) || '-'}</td>
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
                <td>${escapeHtml(agencyData.representative_name) || '-'}</td>
              </tr>
              <tr>
                <th>電話番号</th>
                <td>${escapeHtml(agencyData.representative_phone) || '-'}</td>
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
                <td>${escapeHtml(agencyData.contact_email || agencyData.email) || '-'}</td>
              </tr>
              <tr>
                <th>電話番号</th>
                <td>${escapeHtml(agencyData.contact_phone) || '-'}</td>
              </tr>
              <tr>
                <th>住所</th>
                <td>${escapeHtml(agencyData.address) || '-'}</td>
              </tr>
            </table>
          </div>

          <div class="detail-section">
            <h3>金融情報</h3>
            <table class="detail-table">
              <tr>
                <th>インボイス番号</th>
                <td>${escapeHtml(agencyData.invoice_number) || '-'}</td>
              </tr>
              ${agencyData.bank_account ? `
              <tr>
                <th>銀行名</th>
                <td>${escapeHtml(agencyData.bank_account.bank_name) || '-'}</td>
              </tr>
              <tr>
                <th>支店名</th>
                <td>${escapeHtml(agencyData.bank_account.branch_name) || '-'}</td>
              </tr>
              <tr>
                <th>口座種別</th>
                <td>${escapeHtml(agencyData.bank_account.account_type) || '-'}</td>
              </tr>
              <tr>
                <th>口座番号</th>
                <td>${escapeHtml(agencyData.bank_account.account_number) || '-'}</td>
              </tr>
              <tr>
                <th>口座名義</th>
                <td>${escapeHtml(agencyData.bank_account.account_holder) || '-'}</td>
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
                <td>${escapeHtml(agencyData.tax_info.tax_id) || '-'}</td>
              </tr>
              <tr>
                <th>税務署</th>
                <td>${escapeHtml(agencyData.tax_info.tax_office) || '-'}</td>
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
                <td>${escapeHtml(agencyData.parent_agency_name) || '-'}</td>
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
            ` : (this.app.user && this.app.user.role === 'agency' && this.app.user.agency && this.app.user.agency.id === agencyData.id) ? `
              <button class="btn btn-warning" onclick="app.editAgency('${agencyData.id}')">自社情報を編集</button>
            ` : ''}
            <button class="btn btn-secondary" onclick="app.closeModal()">閉じる</button>
          </div>
        </div>
      `;

      // モーダルを表示
      this.app.openModal();

      // 書類管理セクションを初期化
      const companyType = agencyData.company_type || 'corporation';
      const isAdmin = this.app.user && this.app.user.role === 'admin';

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
              <div class="history-type ${statusClass}">${escapeHtml(item.description)}</div>
              <div class="history-details">
                ${item.type === 'registration' ?
                  `ステータス: ${escapeHtml(item.details.status)}, 階層: Tier ${Number(item.details.tier_level) || '-'}` :
                  `メール: ${escapeHtml(item.details.email)}`
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
                <input type="text" id="edit_company_name" value="${escapeHtml(agency.company_name)}" required>
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
                <input type="text" id="edit_representative_name" value="${escapeHtml(agency.representative_name)}" required>
              </div>
            </div>

            <div class="form-section">
              <h3>連絡先情報</h3>
              <div class="form-group">
                <label for="edit_contact_email">メールアドレス *</label>
                <input type="email" id="edit_contact_email" value="${escapeHtml(agency.contact_email)}" required>
                <small class="text-muted">請求書・領収書に記載されるメールアドレスです</small>
              </div>
              <div class="form-group">
                <label for="edit_contact_phone">電話番号</label>
                <input type="tel" id="edit_contact_phone" value="${escapeHtml(agency.contact_phone)}">
                <small class="text-muted">請求書・領収書に記載される電話番号です</small>
              </div>
              <div class="form-group">
                <label for="edit_representative_phone">代表者電話番号</label>
                <input type="tel" id="edit_representative_phone" value="${escapeHtml(agency.representative_phone)}">
              </div>
              <div class="form-group">
                <label for="edit_birth_date">生年月日</label>
                <input type="date" id="edit_birth_date" value="${agency.birth_date || ''}">
              </div>
              <div class="form-group">
                <label for="edit_postal_code">郵便番号</label>
                <input type="text" id="edit_postal_code" value="${escapeHtml(agency.postal_code)}" placeholder="例：100-0001">
                <small class="text-muted">請求書・領収書に記載される郵便番号です</small>
              </div>
              <div class="form-group">
                <label for="edit_address">住所</label>
                <textarea id="edit_address" rows="3" placeholder="例：東京都千代田区千代田1-1">${escapeHtml(agency.address)}</textarea>
                <small class="text-muted">請求書・領収書に記載される住所です</small>
              </div>
            </div>

            <div class="form-section">
              <h3>銀行口座情報</h3>
              <div class="form-group">
                <label for="edit_bank_name">銀行名</label>
                <input type="text" id="edit_bank_name" value="${escapeHtml(agency.bank_account?.bank_name)}" placeholder="例：みずほ銀行">
              </div>
              <div class="form-group">
                <label for="edit_branch_name">支店名</label>
                <input type="text" id="edit_branch_name" value="${escapeHtml(agency.bank_account?.branch_name)}" placeholder="例：新宿支店">
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
                <input type="text" id="edit_account_number" value="${escapeHtml(agency.bank_account?.account_number)}" placeholder="例：1234567">
              </div>
              <div class="form-group">
                <label for="edit_account_holder">口座名義</label>
                <input type="text" id="edit_account_holder" value="${escapeHtml(agency.bank_account?.account_holder)}" placeholder="例：カブシキガイシャ エービーシー">
              </div>
            </div>

            <div class="form-section">
              <h3>税務情報</h3>
              <div class="form-group">
                <label>
                  <input type="checkbox" id="edit_invoice_registered" ${agency.invoice_registered ? 'checked' : ''}>
                  インボイス登録事業者
                </label>
                <small class="text-muted">適格請求書発行事業者として登録済の場合はチェックしてください</small>
              </div>
              <div class="form-group">
                <label for="edit_invoice_number">インボイス登録番号</label>
                <input type="text" id="edit_invoice_number" value="${escapeHtml(agency.invoice_number)}" placeholder="例：T1234567890123">
              </div>
              <div class="form-group">
                <label for="edit_tax_id">法人番号</label>
                <input type="text" id="edit_tax_id" value="${escapeHtml(agency.tax_info?.tax_id)}" placeholder="例：1234567890123">
              </div>
              <div class="form-group">
                <label for="edit_tax_office">税務署</label>
                <input type="text" id="edit_tax_office" value="${escapeHtml(agency.tax_info?.tax_office)}" placeholder="例：新宿税務署">
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
        contact_email: document.getElementById('edit_contact_email').value,
        contact_phone: document.getElementById('edit_contact_phone').value,
        postal_code: document.getElementById('edit_postal_code').value || null,
        address: document.getElementById('edit_address').value || null,
        representative_phone: document.getElementById('edit_representative_phone').value,
        birth_date: document.getElementById('edit_birth_date').value || null,
        invoice_registered: document.getElementById('edit_invoice_registered').checked,
        invoice_number: document.getElementById('edit_invoice_number').value || null,
        bank_account: bankAccount,
        tax_info: taxInfo
      };

      await agenciesAPI.updateAgency(agencyId, formData);
      alert('代理店情報を更新しました');
      this.app.closeModal();
      await this.app.agenciesPage.loadAgencies(); // 一覧を再読み込み

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
      this.app.closeModal();
      await this.app.agenciesPage.loadAgencies();

    } catch (error) {
      console.error('Delete agency error:', error);
      alert(error.message || '代理店の削除に失敗しました');
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
          <small class="text-muted">適格請求書発行事業者として登録済の場合はチェックしてください</small>
        </div>
        <button type="submit" class="btn btn-primary">
          ${isAdmin ? '登録' : '登録申請'}
        </button>
        <button type="button" class="btn" onclick="app.hideModal()">キャンセル</button>
      </form>
    `;

    this.app.showModal(modalContent);

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
      this.app.hideModal();
      await this.app.agenciesPage.loadAgencies();
    } catch (error) {
      alert('登録に失敗しました');
    }
  }
}
