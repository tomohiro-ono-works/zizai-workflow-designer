# WorkflowDesigner

ブラウザ標準のHTML、CSS、JavaScriptだけで利用できる、フレームワーク非依存のワークフローデザイナーです。

利用時にNode.js、npm、パッケージマネージャー、バンドル、トランスパイル、HTTPサーバーは必須ではありません。公開CSSと公開JavaScriptをHTMLから読み込むだけで使用でき、ローカルHTMLを`file://`で直接開く構成にも対応します。

## ライブラリの責務

WorkflowDesignerが担当するのは、ワークフロー編集UIと、その編集結果をDocument Patchとして通知するところまでです。

WorkflowDesigner側の責務:

- ノード、START、END、LOOP、エッジ、付箋の描画
- 選択、複数選択、移動、範囲選択
- パン、ズーム
- ノードの22pxグリッドスナップ
- 接続先の24pxスナップ
- 接続プレビューと直交エッジ描画
- DAGモードでの循環接続拒否
- 通常フローとLOOP内部グラフの接続制約
- 複製、コピー、貼り付け
- 標準ID発番
- 編集内容に対するDocument Patch生成
- readonly、status、validation、カスタムノード描画の反映

利用アプリ側の責務:

- `document`を正本として保持する
- `document:change`で受け取ったPatchを正本へ反映する
- ノード追加要求を実データへ反映する
- 接続作成要求を実データへ反映する
- 削除要求を実データへ反映する
- Undo / Redo履歴を保持する
- 保存、読込、backend通信
- 実際のワークフロー実行
- 業務固有のvalidation、確認ダイアログなど

## フォルダ構成

```text
workflow-designer/
├─ src/
│  ├─ workflow_designer.js      公開JavaScript。利用時に読み込む自己完結ファイル
│  ├─ workflow_designer.css     公開CSS。利用時に読み込むライブラリCSS
│  └─ designer_*.js             内部実装を責務別に分割した保守用ソース
│
├─ sample/
│  ├─ minimal.html              基本編集機能を確認する最小HTML
│  ├─ minimal.css               最小サンプルの表示領域だけを定義
│  ├─ minimal.js                基本編集に必要な利用アプリ側処理一式
│  ├─ index.html                全機能確認用サンプル
│  ├─ sample.css                全機能サンプル画面専用CSS
│  ├─ sample_app.js             デモ演出を含む全機能サンプル処理
│  └─ icons/                    全機能サンプル専用アイコン
│
├─ test/
│  ├─ test_*.js                 JavaScriptユニットテスト
│  ├─ verify_sample.py          構成・依存関係の静的検証
│  └─ smoke_*.py                ブラウザ動作検証
│
└─ README.md
```

### 利用時に必要なファイル

利用側が読み込むライブラリファイルは次の2つだけです。

```text
src/workflow_designer.css
src/workflow_designer.js
```

`src/designer_*.js`は内部実装用です。利用側で個別に読み込んだり、読み込み順を管理したりする必要はありません。

また、`sample/sample.css`は読み込みません。これは全機能サンプル画面のレイアウトと装飾だけを担当します。

## 最小の読み込み方法

```html
<link rel="stylesheet" href="./src/workflow_designer.css">

<div id="workflow-root"></div>

<script src="./src/workflow_designer.js"></script>
<script src="./app.js"></script>
```

公開APIは次から取得します。

```js
const {
  createWorkflowDesigner,
  applyDocumentPatch
} = window.zizPackages.workflowDesigner;
```

## 表示領域の要件

WorkflowDesignerは、配置先root要素に与えられた領域いっぱいに描画します。ライブラリ側では固定の高さを決めません。

そのため、呼び出し側の責務として、配置先要素には、表示可能な高さを明示的に確保してください。

```css
#workflow-root {
  width: 100%;
  height: 720px;
}
```

`height: 100%`を使用する場合は、親要素にも確定した高さが必要です。

```css
.workflow-area {
  height: 720px;
}

#workflow-root {
  width: 100%;
  height: 100%;
}
```

WorkflowDesignerを表示するために`.sample-layout`や`sample.css`が必要なわけではありません。サンプル側のサイズ指定は、サンプル画面内で表示領域を確保するためだけのものです。

## 基本的な初期化

```js
const { createWorkflowDesigner, applyDocumentPatch } =
  window.zizPackages.workflowDesigner;

let documentState = {
  steps: [],
  flows: {},
  loop: { flows: {} },
  notes: []
};

const designer = createWorkflowDesigner({
  root: document.getElementById("workflow-root"),
  document: documentState,
  graphMode: "dag",
  nodeGrid: { enabled: true, size: 22 },
  nodeMetrics: { width: 132, height: 132, visualSize: 88, iconSize: 48 },
  connectionSnapDistance: 24
});

designer.on("document:change", ({ patch }) => {
  documentState = applyDocumentPatch(documentState, patch);
  designer.updateDocument(patch);
});

designer.mount();
```

このコードだけでも既存Documentの描画、選択、移動、付箋編集など、WorkflowDesigner自身がPatchを生成する操作は反映できます。

ただし、**ノード追加、接続作成、削除、Undo / Redoまで含む編集アプリとして使用する場合は、追加の要求イベント処理が必要です。** 完全な最小実装は`sample/minimal.js`を参照してください。

## 最小構成サンプル

`sample/minimal.html`は、デモ演出を除き、WorkflowDesignerを通常の編集UIとして使うために必要な利用アプリ側処理をまとめたサンプルです。

```text
sample/minimal.html
sample/minimal.css
sample/minimal.js
```

フォルダ構成を保ったまま`sample/minimal.html`を開きます。

### minimal.jsに含める処理

- controlled documentの保持
- `document:change`のPatch反映
- ノード追加
- 接続追加
- 通常フローとLOOP内部の接続先判定
- ノード、エッジ、付箋の削除
- Undo / Redo履歴
- DAGモード
- 22pxノードグリッド
- 24px接続先スナップ

ノード移動、範囲選択、パン、ズーム、付箋の編集・移動・リサイズ、複製などはWorkflowDesigner本体がDocument Patchを生成し、同じ`document:change`処理で反映します。

### minimal.jsに含めない処理

次はWorkflowDesignerを使うための必須処理ではないため、最小構成から除外しています。

- イベントログ画面
- 疑似ワークフロー実行
- `waiting / running / success / error`のデモ演出
- デモ専用カスタムアイコン
- 外部リンクを開くデモ
- サンプル専用デバッグ公開

## 全機能サンプル

`sample/index.html`は、ライブラリの基本編集機能に加えてデモ表示も確認するためのサンプルです。

```text
sample/index.html
sample/sample.css
sample/sample_app.js
sample/icons/
```

`sample/sample.css`と`sample/sample_app.js`はサンプル専用です。これらを実運用ページへコピーする必要はありません。

## Documentの管理方式

WorkflowDesignerはcontrolled input方式です。

利用アプリが`document`を正本として保持し、WorkflowDesignerが直接その正本を書き換えることはありません。

編集時は次の流れになります。

```text
ユーザー操作
    ↓
WorkflowDesigner
    ↓
document:change { patch, inversePatch, reason, transactionId }
    ↓
利用アプリが正本へPatchを適用
    ↓
designer.updateDocument(patch)
```

`applyDocumentPatch(document, patch)`は、Patch適用後の新しいDocumentを返します。

## 要求イベント

一部の操作は、WorkflowDesignerがデータ構造を決め打ちせず、利用アプリへ要求イベントとして通知します。

| イベント | 用途 | 利用側の処理 |
|---|---|---|
| `document:change` | 移動、付箋編集、複製などでPatchが生成された | Patchを正本へ適用する |
| `node:add-request` | 新規ノード追加要求 | `steps`へノードを追加する |
| `connect:create-request` | 接続作成要求 | 対象の`flows[].edges`または`loop.flows[]`へ追加する |
| `connect:drop-request` | 接続gestureが空白またはedgeで終了した | source、drop位置、任意のedgeを使って追加・挿入UIを処理する |
| `delete:request` | 選択対象の削除要求 | ノード、エッジ、付箋を正本から削除する |
| `command:execute` | Undo / Redoなどのコマンド実行 | 必要なアプリ側処理を実行する |
| `annotation:mode-change` | toolbarまたはEscapeで付箋modeが変わった | 必要なら外部UIへmodeを反映する |
| `run:request` | 実行要求 | 実行基盤へ接続する |
| `node:open-detail` | ノード詳細を開く要求 | 詳細画面などを開く |
| `external-link:open-request` | 外部リンクを開く要求 | 利用側の方針でリンクを処理する |
| `selection:change` | 選択状態変更 | 必要なら外部UIへ反映する |
| `viewport:change` | パン・ズーム変更 | 必要なら外部状態へ保存する |

イベント登録は次の形式です。

```js
const unsubscribe = designer.on("selection:change", ({ selection }) => {
  console.log(selection);
});

// 解除
unsubscribe();
```

または`off(event, handler)`でも解除できます。

### configurable context actions

`contextActions` optionへ同期関数を渡すと、右クリック対象ごとの標準menuを利用側が供給するmenuへ置き換えられます。関数には`{ target, readonly }`が渡され、`target`は`node_ref`、`edge_ref`、`selection`、`annotation_id`、`position`だけを含む公開値です。明示的な`[]`だけがmenuを非表示にします。providerがthrowした場合、Promiseを返した場合、または配列以外を返した場合は安全に標準menuへfallbackします。

```js
const designer = createWorkflowDesigner({
  root,
  document,
  contextActions: ({ target, readonly }) => {
    if (readonly) return [];
    if (target.kind === "node") {
      return [
        { commandId: "loop.add-inside", label: "Add inside" },
        { commandId: "loop.add-after", label: "Add after" }
      ];
    }
    if (target.kind === "edge") {
      return [{ commandId: "merge.detach", label: "Detach relationship" }];
    }
    return [];
  }
});
```

選択したactionは既存の`command:execute { commandId, target }`として通知されます。WorkflowDesignerはcommand IDの意味を解釈せず、loop内／loop後追加や関係解除を含むDocument変更は利用側が行います。入力targetと通知payloadは内部modelを公開しないコピーです。

action descriptorには任意の`value`（string／number）を持たせられます。指定した場合はmenu項目へ反映され、`command:execute { commandId, target, value }`として文字列で通知されます。

annotation modeがONの間、右クリックmenuはlibraryが所有します。この間`contextActions`は呼ばれません。

### 接続gestureのdrop要求

接続gestureがnodeで終了した場合は従来どおり`connect:create-request`を通知します。空白またはedgeで終了した場合は`connect:drop-request`を通知し、Documentを直接変更しません。

```js
designer.on("connect:drop-request", ({ source_node_ref, source_port, drop }) => {
  // drop.kind: "canvas" | "edge"
  // drop.position: { x, y }
  // drop.edge_ref: edge dropの場合だけ存在
});
```

### Undo / Redoとannotation mode

toolbarのUndo／Redoはそれぞれ`command:execute`の`history.undo`／`history.redo`として通知され、履歴自体は利用側が所有します。

annotation mode toggleはlibrary内の一時UI stateだけを変更し、`annotation:mode-change { active, reason }`を通知します。Escapeでmodeを終了します。`setAnnotationMode(active)`はcontrolled setterのためeventを再通知しません。

annotation modeは既定でOFFです。2つのmodeは排他で、OFFはノード編集専用、ONは付箋編集専用です。

**OFF（ノード編集モード）**

- ノードの選択、詳細表示、移動、接続、ノードのcontext action、キーボード操作はすべて有効です。
- 付箋はノード・エッジより背面に表示され、非編集の閲覧のみ可能です。付箋の新規作成、テキスト編集、移動、リサイズ、色変更、削除はすべて無効です。
- 付箋本文中の`http://`／`https://`リンクをクリックした場合だけ`external-link:open-request`を通知します。遷移自体は行わないため、利用側の方針で処理してください。

**ON（付箋編集モード）**

- 付箋はノード・エッジより前面に表示され、テキスト編集、移動、リサイズ、色変更、Deleteキーによる削除が有効になります。
- ノードの選択、詳細表示、移動、接続、追加、削除、複製、貼り付け、実行は発火しません。ノード編集のキーボード操作も無効です。空白キャンバスのpanとzoomは維持します。
- キャンバスまたはノードを右クリックすると`annotation.add`だけを表示し、右クリックした位置へ新規付箋を作成します。
- 付箋を右クリックすると`noteColors`の候補色だけを表示し、選択した色を`annotation.color`としてcommitします。
- 付箋リンクのクリックは外部遷移を通知せず、付箋の編集を優先します。

toolbarには付箋mode切替（`annotation.mode-toggle`）だけを置きます。新規付箋はON時の右クリックmenuからのみ作成され、空白キャンバスのクリック、複製、貼り付けでは作成されません。

OFFへ戻すと、付箋は再び背面表示・編集不可の状態に戻ります。

候補色は`noteColors` optionで指定します。既定値は`["#fff2a8", "#dff7e8", "#e7edff"]`で、先頭の色が新規付箋の初期色になります。

## LOOP

`node_type: "loop"`は通常ノードと同じカードとして表示し、大きな背景フレームは描画しません。

LOOPノードには4つの接続点があります。

```text
左上   enter   通常フローからLOOPへ入る
左下   return  LOOP内部の戻り線がLOOPへ戻る
右上   done    LOOP完了後の通常フローへ出る
右下   loop    LOOP内部処理へ入る
```

LOOP内部ノードは`loop_owner_id`で所属LOOPを指定します。

```js
{
  step_id: "03",
  loop_owner_id: "02",
  node_type: "task",
  label: "ループ処理",
  ui_position: { x: 550, y: 396 }
}
```

LOOP内部のエッジは`loop.flows[loopStepId].edges`に保持します。

```js
loop: {
  flows: {
    "02": {
      edges: [
        { from: "START", to: "03", order: 1 },
        { from: "03", to: "END", order: 2 }
      ]
    }
  }
}
```

`START`はLOOPノードの`loop`ポート、`END`は`return`ポートに対応します。

## ノードとエッジ

標準ノードは88pxのビジュアル領域を中心に表示し、その下へ`label`と`description`を表示します。

通常ノードの入力は左中央、出力は右中央です。STARTは右側出力のみ、ENDは左側入力のみを持ちます。

エッジは水平・垂直の直交線を基本とし、折れ曲がりを約8pxで丸めます。右向き接続は、同じY座標なら水平線、異なるY座標なら中間Xで縦方向へ移動します。左向き接続とLOOPの戻り線には迂回ルートを使用します。

障害物回避やエッジ同士の交差回避は行いません。

## 公開API

### createWorkflowDesigner(options)

WorkflowDesignerインスタンスを生成して返します。生成しただけではDOMへmountされません。

```js
const designer = createWorkflowDesigner(options);
designer.mount();
```

主なoptions:

| option | 内容 |
|---|---|
| `root` | 配置先DOM要素 |
| `document` | 初期Document |
| `viewport` | 初期パン・ズーム位置 |
| `graphMode` | `"dag"`などのグラフ制約 |
| `nodeGrid` | ノードグリッド設定 |
| `nodeMetrics` | ノード外形、visual、icon寸法。port／edge anchorとCSSへ同じ値を反映 |
| `connectionSnapDistance` | 接続スナップ距離 |
| `readonly` | 編集禁止 |
| `contextActions` | 右クリック対象から汎用action descriptor配列を同期で返す関数。`[]`はmenu非表示、throw／Promise／非配列は標準menuへfallback |
| `annotationMode` | 初期annotation mode state |
| `noteColors` | 付箋の候補色。既定は`["#fff2a8", "#dff7e8", "#e7edff"]` |
| `nodeRenderers` | ノードタイプ別カスタム描画 |
| `theme` | CSSカスタムプロパティ上書き |

### applyDocumentPatch(document, patch)

DocumentへPatchを適用し、**適用後の新しいDocument**を返します。入力Documentを正本として直接書き換える用途ではなく、返却値を新しい正本として保持してください。

### instance API

| API | 主な返却値 |
|---|---|
| `mount()` | 同じdesignerインスタンス |
| `destroy()` | なし |
| `setDocument(document)` | なし |
| `getDocument()` | 現在のDocumentのコピー |
| `updateDocument(patch)` | Patch適用後のDocumentのコピー |
| `setSelection(selection)` | なし |
| `getSelection()` | 現在のSelectionのコピー |
| `setViewport(viewport)` | なし |
| `getViewport()` | 現在のViewportのコピー |
| `setStatus(status)` | なし |
| `setReadonly(readonly)` | なし |
| `setAnnotationMode(active)` | なし |
| `getAnnotationMode()` | 現在のannotation mode state |
| `setNodeRenderers(renderers)` | なし |
| `copy(selection)` | コピー用fragment |
| `duplicate(selection)` | transaction、ID対応表、Selection。対象なしの場合は`null` |
| `paste(fragment)` | transaction、ID対応表、Selection |
| `on(event, handler)` | 購読解除関数 |
| `off(event, handler)` | なし |

## テスト

ライブラリ利用時にNode.jsやPythonは不要です。以下は開発・検証用です。

### JavaScriptユニットテスト

```bash
node test/test_grid_snap.js
node test/test_live_edge_follow.js
node test/test_node_card.js
node test/test_loop_node.js
node test/test_orthogonal_edges.js
node test/test_generic_events.js
node test/test_sticky_note_mode.js
node test/test_bundle_parity.js
```

### 静的検証

```bash
python test/verify_sample.py
```

### ブラウザ検証

Python版PlaywrightとChromiumがある環境で実行します。

```bash
python test/smoke_library_css.py
python test/smoke_minimal.py
python test/smoke_sample.py
```
