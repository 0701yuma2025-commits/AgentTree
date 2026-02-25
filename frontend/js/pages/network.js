/**
 * ネットワーク可視化ページ管理クラス
 */

class NetworkPage {
  constructor() {
    this.graph = null;
    this.graphData = { nodes: [], links: [] };
    this.collapsedNodes = new Set();
    this.currentTierFilter = null;  // null = 全表示
  }

  async init() {
    // 3D Force Graphライブラリの読み込みを待つ
    if (typeof ForceGraph3D === 'undefined') {
      console.error('3D Force Graph library not loaded');
      alert('3D可視化ライブラリの読み込みに失敗しました。ページを再読み込みしてください。');
      return;
    }

    // 詳細パネルを非表示にする
    this.hideNodeDetails();

    await this.loadNetworkData();

    if (this.graphData.nodes.length > 0) {
      this.initializeGraph();
      this.setupEventListeners();
    } else {
      const container = document.getElementById('network3d');
      if (container) {
        container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 18px;">代理店データがありません</div>';
      }
    }
  }

  /**
   * ネットワークデータ取得
   */
  async loadNetworkData() {
    try {
      const response = await apiClient.get('/network/agencies');

      if (response.success && response.data) {
        this.graphData = response.data;
      } else {
        console.error('API returned error:', response);
        throw new Error(response.message || 'データ取得に失敗しました');
      }
    } catch (error) {
      console.error('Load network data error:', error);
      const container = document.getElementById('network3d');
      if (container) {
        container.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: white; font-size: 16px; padding: 20px; text-align: center;">
          <div>
            <p>ネットワークデータの取得に失敗しました</p>
            <p style="font-size: 14px; margin-top: 10px; color: #ff6b6b;">${error.message}</p>
            <button onclick="window.location.reload()" style="margin-top: 20px; padding: 10px 20px; cursor: pointer;">再読み込み</button>
          </div>
        </div>`;
      }
    }
  }

  /**
   * 3Dグラフ初期化
   */
  initializeGraph() {
    const container = document.getElementById('network3d');
    if (!container) return;

    // Tier別の色
    const tierColors = {
      1: '#ff4444',  // 赤
      2: '#4444ff',  // 青
      3: '#44ff44',  // 緑
      4: '#ffaa44'   // オレンジ
    };

    // 3D Force Graphの初期化
    this.graph = ForceGraph3D()(container)
      .graphData(this.graphData)
      .nodeId('id')
      .nodeLabel(node => {
        return `
          <div style="background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px;">
            <h3 style="margin: 0 0 5px 0;">${escapeHtml(node.name)}</h3>
            <p style="margin: 5px 0;"><strong>代理店コード:</strong> ${escapeHtml(node.code)}</p>
            <p style="margin: 5px 0;"><strong>Tier:</strong> ${node.tier}</p>
            <p style="margin: 5px 0;"><strong>売上:</strong> ¥${node.sales.toLocaleString()}</p>
            <p style="margin: 5px 0;"><strong>報酬:</strong> ¥${node.commission.toLocaleString()}</p>
            <p style="margin: 5px 0;"><strong>下位代理店:</strong> ${node.childCount}社</p>
            <p style="margin: 5px 0; color: #ffaa44;"><em>クリックして詳細表示</em></p>
          </div>
        `;
      })
      .nodeColor(node => tierColors[node.tier] || '#cccccc')
      .nodeVal(5)  // すべて同じサイズ
      .nodeRelSize(4)
      .nodeThreeObjectExtend(false)  // デフォルトの球体を非表示
      .nodeThreeObject(node => {
        // テキストラベルをスプライトで作成
        const label = this.getNodeLabel(node.name);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;

        // 背景（Tier別の色）
        context.fillStyle = tierColors[node.tier] || '#cccccc';
        context.beginPath();
        context.arc(128, 128, 120, 0, 2 * Math.PI);
        context.fill();

        // 外枠
        context.strokeStyle = 'white';
        context.lineWidth = 6;
        context.stroke();

        // テキスト（白）
        context.fillStyle = 'white';
        context.font = 'bold 90px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(label, 128, 128);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          sizeAttenuation: true
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(30, 30, 1);

        return sprite;
      })
      .linkWidth(2)
      .linkColor(() => 'rgba(255,255,255,0.3)')
      .linkDirectionalParticles(2)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(() => 'rgba(255,255,255,0.5)')
      .onNodeClick(this.handleNodeClick.bind(this))
      .onNodeHover(node => {
        container.style.cursor = node ? 'pointer' : 'default';
      });

    // d3 Forceの設定
    this.graph.d3Force('charge').strength(-300);
    this.graph.d3Force('center').strength(1);

    // 階層構造を縦方向に配置（Tier別にY座標を固定）
    const yForce = this.graph.d3Force('y');
    if (yForce) {
      yForce.y(node => (node.tier - 1) * 200).strength(1);
    }

    // グラフの背景色
    this.graph.backgroundColor('#1a1a2e');

    // ノードの初期位置を設定（階層別）- デフォルト位置として保存
    this.graphData.nodes.forEach(node => {
      node.defaultFy = (node.tier - 1) * 200;  // デフォルトY座標を保存
      node.fy = node.defaultFy;  // 初期配置
    });

    // ノードをドラッグ可能にする
    this.graph.enableNodeDrag(true);

    // ドラッグ終了時に現在位置で固定
    this.graph.onNodeDragEnd(node => {
      node.fx = node.x;  // X座標を現在位置で固定
      node.fy = node.y;  // Y座標を現在位置で固定
      node.fz = node.z;  // Z座標を現在位置で固定
    });

    // データ読み込み完了後に全体を表示
    setTimeout(() => {
      this.fitCameraToGraph();
    }, 1000);
  }

  /**
   * 代理店名から表示ラベルを取得
   */
  getNodeLabel(name) {
    // 「株式会社」「有限会社」などを除去
    let cleanName = name
      .replace(/^株式会社\s*/, '')
      .replace(/^有限会社\s*/, '')
      .replace(/^合同会社\s*/, '')
      .replace(/^一般社団法人\s*/, '')
      .replace(/^一般財団法人\s*/, '')
      .replace(/\s*株式会社$/, '')
      .replace(/\s*有限会社$/, '')
      .replace(/代理店$/, '')  // 末尾の「代理店」を除去
      .trim();

    // 3文字以下ならそのまま、4文字以上なら頭文字2文字
    if (cleanName.length <= 3) {
      return cleanName;
    } else {
      return cleanName.substring(0, 2);
    }
  }

  /**
   * ノードクリックハンドラー
   */
  handleNodeClick(node) {
    // 詳細パネルを表示
    this.showNodeDetails(node);
  }

  /**
   * ノード詳細を表示
   */
  showNodeDetails(node) {
    const detailsPanel = document.getElementById('networkNodeDetails');
    const detailsContent = document.getElementById('nodeDetailsContent');

    if (!detailsPanel || !detailsContent) return;

    // 詳細情報のHTML生成
    detailsContent.innerHTML = `
      <p><strong>代理店名:</strong> ${node.name}</p>
      <p><strong>代理店コード:</strong> ${node.code}</p>
      <p><strong>Tier:</strong> ${node.tier}</p>
      <p><strong>ステータス:</strong> ${node.status === 'active' ? '有効' : '無効'}</p>
      <p><strong>売上:</strong> ¥${node.sales.toLocaleString()}</p>
      <p><strong>報酬:</strong> ¥${node.commission.toLocaleString()}</p>
      <p><strong>下位代理店数:</strong> ${node.childCount}社</p>
    `;

    // パネルを表示
    detailsPanel.classList.remove('hidden');
  }

  /**
   * ノード詳細を非表示
   */
  hideNodeDetails() {
    const detailsPanel = document.getElementById('networkNodeDetails');
    if (detailsPanel) {
      detailsPanel.classList.add('hidden');
    }
  }

  /**
   * ノードを折りたたむ
   */
  collapseNode(node) {
    const childNodes = this.graphData.nodes.filter(n => n.parentId === node.id);
    const childIds = new Set(childNodes.map(n => n.id));

    // 子ノードとそのリンクを非表示
    const visibleNodes = this.graphData.nodes.filter(n => !childIds.has(n.id));
    const visibleLinks = this.graphData.links.filter(l =>
      !childIds.has(l.source.id || l.source) && !childIds.has(l.target.id || l.target)
    );

    this.collapsedNodes.add(node.id);
    this.graph.graphData({ nodes: visibleNodes, links: visibleLinks });
  }

  /**
   * ノードを展開
   */
  expandNode(node) {
    this.collapsedNodes.delete(node.id);

    // すべての折りたたまれていないノードとリンクを表示
    const allCollapsedChildren = new Set();
    this.collapsedNodes.forEach(parentId => {
      const getChildren = (pid) => {
        const children = this.graphData.nodes.filter(n => n.parentId === pid);
        children.forEach(child => {
          allCollapsedChildren.add(child.id);
          getChildren(child.id);
        });
      };
      getChildren(parentId);
    });

    const visibleNodes = this.graphData.nodes.filter(n => !allCollapsedChildren.has(n.id));
    const visibleLinks = this.graphData.links.filter(l => {
      const sourceId = l.source.id || l.source;
      const targetId = l.target.id || l.target;
      return !allCollapsedChildren.has(sourceId) && !allCollapsedChildren.has(targetId);
    });

    this.graph.graphData({ nodes: visibleNodes, links: visibleLinks });
  }

  /**
   * カメラを全体に合わせる
   */
  fitCameraToGraph() {
    if (!this.graph || !this.graphData.nodes.length) return;

    // すべてのノードの座標から境界を計算
    const nodes = this.graph.graphData().nodes;
    if (!nodes.length) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    nodes.forEach(node => {
      if (node.x !== undefined) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x);
      }
      if (node.y !== undefined) {
        minY = Math.min(minY, node.y);
        maxY = Math.max(maxY, node.y);
      }
      if (node.z !== undefined) {
        minZ = Math.min(minZ, node.z);
        maxZ = Math.max(maxZ, node.z);
      }
    });

    // 中心座標を計算
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // グラフの最大幅を計算
    const width = maxX - minX;
    const height = maxY - minY;
    const depth = maxZ - minZ;
    const maxDimension = Math.max(width, height, depth);

    // 適切な距離を計算（全体が見えるように）
    const distance = maxDimension * 2.5 || 400;

    // カメラ位置を設定
    this.graph.cameraPosition(
      { x: centerX, y: centerY, z: centerZ + distance },
      { x: centerX, y: centerY, z: centerZ },
      1000
    );
  }

  /**
   * Tier別フィルター
   */
  filterByTier() {
    const tiers = [1, 2, 3, 4];

    // 現在のフィルターの次のTierに切り替え
    if (this.currentTierFilter === null) {
      this.currentTierFilter = 1;
    } else if (this.currentTierFilter < 4) {
      this.currentTierFilter++;
    } else {
      this.currentTierFilter = null;  // 全表示に戻る
    }

    // フィルター適用
    if (this.currentTierFilter === null) {
      // 全表示
      this.graph.graphData(this.graphData);
      document.getElementById('filterByTier').textContent = 'Tier別フィルター';
    } else {
      // 指定Tier以下を表示
      const filteredNodes = this.graphData.nodes.filter(n => n.tier <= this.currentTierFilter);
      const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
      const filteredLinks = this.graphData.links.filter(l => {
        const sourceId = l.source.id || l.source;
        const targetId = l.target.id || l.target;
        return filteredNodeIds.has(sourceId) && filteredNodeIds.has(targetId);
      });

      this.graph.graphData({ nodes: filteredNodes, links: filteredLinks });
      document.getElementById('filterByTier').textContent = `Tier ${this.currentTierFilter}まで表示`;
    }

    // カメラを調整
    setTimeout(() => this.fitCameraToGraph(), 500);
  }

  /**
   * デフォルト配置にリセット
   */
  resetToDefaultLayout() {
    // すべてのノードをデフォルト位置に戻す
    this.graphData.nodes.forEach(node => {
      node.fx = undefined;  // X座標の固定を解除
      node.fy = node.defaultFy;  // Y座標をデフォルトに戻す
      node.fz = undefined;  // Z座標の固定を解除
    });

    // フィルターもリセット
    this.currentTierFilter = null;
    this.graph.graphData(this.graphData);
    document.getElementById('filterByTier').textContent = 'Tier別フィルター';

    // カメラ位置を調整
    this.fitCameraToGraph();
  }

  /**
   * イベントリスナー設定
   */
  setupEventListeners() {
    // 全体表示ボタン（デフォルト配置にリセット）
    document.getElementById('resetNetworkView')?.addEventListener('click', () => {
      this.resetToDefaultLayout();
    });

    // Tier別フィルターボタン
    document.getElementById('filterByTier')?.addEventListener('click', () => {
      this.filterByTier();
    });

    // 詳細パネルの閉じるボタン
    document.getElementById('closeNodeDetails')?.addEventListener('click', () => {
      this.hideNodeDetails();
    });
  }
}

// グローバルスコープに登録
window.NetworkPage = NetworkPage;
window.networkPage = new NetworkPage();
