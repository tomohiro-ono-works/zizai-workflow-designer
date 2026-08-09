# WorkflowDesigner

ブラウザ標準のHTML、CSS、JavaScriptだけで利用できる、フレームワーク非依存のワークフローデザイナーです。Node.js、npm、バンドル、トランスパイルは利用時には不要です。

## フォルダ構成

```text
├─ src/       ライブラリ本体
├─ sample/    動作サンプル
├─ test/      ユニットテスト、静的検証、ブラウザ検証
└─ README.md
```

## 主な機能

- 画像・SVGアイコンを中心にした縦型ノード、START、END、エッジ、loopノード、付箋の描画
- 単一・複数ノードの選択と移動
- 水平・垂直主体の8px角丸直交エッジと、ドラッグ中の関連エッジ追従
- パン、ズーム、範囲選択
- 出力接続点の左ドラッグ、または従来の右ドラッグによる接続
- 入力側基準点から画面上24px以内の接続先スナップ
- ノードはドラッグ中から22pxグリッド単位で移動し、ドロップ位置も同じ座標で確定
- DAGモードでの循環接続拒否
- 通常フローとloop内部グラフの分離
- Document Patchによるcontrolled input
- 標準ID発番、複製、コピー、貼り付け
- 未実行時のidle表示と、実行状態・validationのoverlay表示
- コンテキストメニュー、Undo／Redo連携用イベント

## 利用方法

`src/`内のCSSとJavaScriptを、次の順序でHTMLから読み込みます。

```html
<link rel="stylesheet" href="./src/workflow_designer.css">

<script src="./src/designer_types.js"></script>
<script src="./src/designer_grid.js"></script>
<script src="./src/designer_events.js"></script>
<script src="./src/designer_document.js"></script>
<script src="./src/designer_ids.js"></script>
<script src="./src/designer_graph.js"></script>
<script src="./src/designer_fragments.js"></script>
<script src="./src/designer_clone.js"></script>
<script src="./src/designer_selection.js"></script>
<script src="./src/designer_dom.js"></script>
<script src="./src/designer_note_dom.js"></script>
<script src="./src/designer_feedback.js"></script>
<script src="./src/designer_render.js"></script>
<script src="./src/designer_note_edit.js"></script>
<script src="./src/designer_commands.js"></script>
<script src="./src/designer_interaction.js"></script>
<script src="./src/designer_core_api.js"></script>
<script src="./src/workflow_designer.js"></script>
```

読み込み後、`window.zizPackages.workflowDesigner`から公開APIを取得します。

```html
<div id="workflow-root"></div>

<script>
  const { createWorkflowDesigner, applyDocumentPatch } =
    window.zizPackages.workflowDesigner;

  let documentState = {
    steps: [{
      step_id: "01",
      flow_id: "01",
      node_type: "source",
      label: "受注DBを読込",
      description: "受注データを取得",
      ui_position: { x: 220, y: 176 }
    }],
    flows: {},
    loop: { flows: {} },
    notes: []
  };

  const designer = createWorkflowDesigner({
    root: document.getElementById("workflow-root"),
    document: documentState,
    graphMode: "dag",
    nodeGrid: { enabled: true, size: 22 },
    connectionSnapDistance: 24
  });

  designer.on("document:change", ({ patch }) => {
    documentState = applyDocumentPatch(documentState, patch);
    designer.updateDocument(patch);
  });

  designer.mount();
</script>
```

`document`は利用アプリ側が正本として保持します。WorkflowDesignerは編集結果を`document:change`イベントのDocument Patchとして通知します。

## サンプル

`sample/index.html`をChromeまたはEdgeで開きます。ローカルファイル制限がある場合は、リポジトリのルートで次を実行します。

```bash
python -m http.server 8000
```

その後、次を開きます。

```text
http://localhost:8000/sample/
```

サンプルは全ノードが未実行の`idle`状態で開きます。ノードはドラッグ中から22pxグリッド上を段階的に移動し、接続エッジもそのスナップ済み座標へ追従します。実行ボタンを押すと、DAG検証、loopノード、接続先スナップ、実行状態表示、Undo／Redoを確認できます。

## テスト

### JavaScriptユニットテスト

Node.jsがある環境で実行します。ライブラリ利用時にはNode.jsは不要です。

```bash
node test/test_grid_snap.js
node test/test_live_edge_follow.js
node test/test_node_card.js
node test/test_loop_node.js
node test/test_orthogonal_edges.js
```

### 静的検証

```bash
python test/verify_sample.py
```

### ブラウザ検証

Python版PlaywrightとChromiumが必要です。

```bash
python test/smoke_sample.py
```


## 標準ノード表示

`steps[]`の標準表示では、`node_type`に対応する画像・SVGアイコンを中央へ表示し、その下へ`label`と`description`を常時表示します。

```js
{
  step_id: "01",
  node_type: "source",
  label: "受注DBを読込",
  description: "受注データを取得",
  ui_position: { x: 220, y: 176 }
}
```

アイコンは`nodeRenderers[node_type].renderIcon()`で指定します。`description`が空の場合は説明行を非表示にします。エッジの接続位置は、ラベル領域ではなく88pxのアイコン枠を基準にします。通常ノードは左中央に入力点、右中央に出力点を常時表示します。STARTは右側の出力点のみ、ENDは左側の入力点のみを表示します。出力点を左ドラッグすると接続を開始し、接続点の操作はノード移動より優先されます。

エッジは水平・垂直の直交線を基本とし、折れ曲がり部分だけ8pxで丸めます。通常の右向き接続では固定の迂回レーンを使わず、Y座標が同じなら水平直線、Y座標が異なるなら始点と終点の中間Xで一度だけ縦方向へ移動します。左向き・loop-backだけは接続点を回り込むための迂回ルートを使います。接続中プレビューとノードドラッグ中の追従でも同じルーティング方式を使います。障害物回避とエッジ同士の交差回避は行いません。

`node_type: "loop"`のノードは背景枠を描画せず、通常ノードと同じカードとして表示します。右側には`done`と`loop`の2つの出力点があります。`done`はループ完了後の通常フロー、`loop`はループ内部グラフへの接続に使用します。接続要求の`connect:create-request`には、選択した出力点を`source_port`として通知します。

## 公開API

```js
const {
  createWorkflowDesigner,
  applyDocumentPatch
} = window.zizPackages.workflowDesigner;
```

主なinstance APIは次のとおりです。

- `mount()`
- `destroy()`
- `setDocument(document)`
- `getDocument()`
- `updateDocument(patch)`
- `setSelection(selection)`
- `getSelection()`
- `setViewport(viewport)`
- `getViewport()`
- `setStatus(status)`
- `setReadonly(readonly)`
- `setNodeRenderers(renderers)`
- `duplicate(selection)`
- `copy(selection)`
- `paste(fragment)`
- `on(event, handler)`
- `off(event, handler)`

## 責務の境界

WorkflowDesignerは、描画、選択、移動、接続、共通グラフ制約、標準ID発番、Document Patch生成を担当します。

保存、読込、Undo／Redo履歴、削除確認、実行処理、backend通信、業務固有のvalidationは利用アプリ側で担当します。
