(function () {
  "use strict";

  const { createWorkflowDesigner, applyDocumentPatch } =
    window.zizPackages.workflowDesigner;

  const flowId = "01";
  let currentDocument = {
    metadata: { title: "受注データ処理" },
    steps: [
      {
        step_id: "01",
        flow_id: flowId,
        node_type: "source",
        label: "受注DBを読込",
        description: "受注データを取得",
        ui_position: { x: 220, y: 176 }
      },
      {
        step_id: "02",
        flow_id: flowId,
        node_type: "transform",
        label: "データを整形",
        description: "項目と型を整形",
        ui_position: { x: 484, y: 176 }
      },
      {
        step_id: "05",
        flow_id: flowId,
        node_type: "loop",
        label: "明細を繰り返す",
        description: "明細単位で処理",
        ui_position: { x: 770, y: 176 }
      },
      {
        step_id: "06",
        loop_owner_id: "05",
        node_type: "transform",
        label: "明細を変換",
        description: "明細データを変換",
        ui_position: { x: 660, y: 396 }
      },
      {
        step_id: "07",
        loop_owner_id: "05",
        node_type: "decision",
        label: "明細を検査",
        description: "入力値を検査",
        ui_position: { x: 924, y: 396 }
      },
      {
        step_id: "03",
        flow_id: flowId,
        node_type: "decision",
        label: "品質チェック",
        description: "品質条件を判定",
        ui_position: { x: 1078, y: 176 }
      },
      {
        step_id: "04",
        flow_id: flowId,
        node_type: "output",
        label: "DWHへ出力",
        description: "分析基盤へ保存",
        ui_position: { x: 1342, y: 176 }
      }
    ],
    flows: {
      [flowId]: {
        start: { ui_position: { x: 66, y: 198 } },
        end: { ui_position: { x: 1628, y: 198 } },
        edges: [
          { from: "START", to: "01", order: 1 },
          { from: "01", to: "02", order: 2 },
          { from: "02", to: "05", order: 3 },
          { from: "05", to: "03", order: 4 },
          { from: "03", to: "04", order: 5 },
          { from: "04", to: "END", order: 6 }
        ]
      }
    },
    loop: {
      flows: {
        "05": {
          edges: [
            { from: "START", to: "06", order: 1 },
            { from: "06", to: "07", order: 2 },
            { from: "07", to: "END", order: 3 }
          ]
        }
      }
    },
    notes: [
      {
        note_id: "01",
        ui_position: { x: 760, y: 610 },
        size: { width: 320, height: 145 },
        text: "ループ出力側の 06 → 07 は独立したDAGです。\n07 から 06 へ接続すると循環として拒否されます。",
        color: "#fff2a8"
      }
    ]
  };

  const logElement = document.getElementById("event-log");
  const undoStack = [];
  const redoStack = [];
  let runSequence = 0;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function log(name, payload) {
    const time = new Date().toLocaleTimeString("ja-JP", { hour12: false });
    const detail = payload === undefined ? "" : `\n${JSON.stringify(payload, null, 2)}`;
    logElement.textContent = `[${time}] ${name}${detail}\n\n${logElement.textContent}`;
  }

  function svgIcon(pathData, fill) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", pathData);
    path.setAttribute("fill", fill);
    svg.appendChild(path);
    return svg;
  }

  const nodeRenderers = {
    source: {
      renderIcon() {
        const img = document.createElement("img");
        img.src = "./icons/database.svg";
        img.alt = "";
        return img;
      }
    },
    transform: {
      renderIcon() {
        return svgIcon(
          "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6ZM10 7h4v1.6h-4V7Zm1.2 3h1.6v4h-1.6v-4Z",
          "#0f766e"
        );
      }
    },
    decision: {
      renderIcon() {
        return svgIcon("M12 2 22 12 12 22 2 12 12 2Zm0 5.2L7.2 12l4.8 4.8 4.8-4.8L12 7.2Z", "#d97706");
      }
    },
    loop: {
      renderIcon() {
        return svgIcon(
          "M7.1 7.1A7 7 0 0 1 18.9 9H16l4 4 4-4h-2.1A10 10 0 0 0 5 5.7L7.1 7.1Zm9.8 9.8A7 7 0 0 1 5.1 15H8l-4-4-4 4h2.1A10 10 0 0 0 19 18.3l-2.1-1.4Z",
          "#7c3aed"
        );
      }
    },
    output: {
      renderIcon() {
        const img = document.createElement("img");
        img.src = "./icons/cloud.svg";
        img.alt = "";
        return img;
      }
    }
  };

  const designer = createWorkflowDesigner({
    root: document.getElementById("workflow-root"),
    document: currentDocument,
    viewport: { x: 18, y: 62, zoom: 0.65 },
    status: { nodeStatus: {}, validation: {} },
    graphMode: "dag",
    nodeGrid: { enabled: true, size: 22 },
    connectionSnapDistance: 24,
    nodeRenderers,
    noteColors: ["#fff2a8", "#dff7e8", "#e7edff"],
    commandLabels: {
      designer: "受注データ処理ワークフロー",
      canvasTools: "ワークフロー操作",
      zoomIn: "拡大",
      zoomOut: "縮小",
      undo: "元に戻す",
      redo: "やり直す",
      addNode: "ノードを追加",
      addNote: "付箋を追加",
      runWorkflow: "ワークフローを実行",
      open: "詳細を開く",
      run: "このノードを実行",
      duplicate: "複製",
      deleteNode: "ノードを削除",
      deleteNodes: "選択ノードを削除",
      delete: "削除"
    }
  });

  function updateHistoryButtons() {
    const root = document.getElementById("workflow-root");
    const undo = root.querySelector('[data-zwd-command="history.undo"]');
    const redo = root.querySelector('[data-zwd-command="history.redo"]');
    if (undo) undo.disabled = undoStack.length === 0;
    if (redo) redo.disabled = redoStack.length === 0;
  }

  function applyTransaction(patch, inversePatch, reason, addHistory) {
    currentDocument = applyDocumentPatch(currentDocument, patch);
    designer.updateDocument(patch);
    if (addHistory) {
      undoStack.push({ patch: clone(patch), inversePatch: clone(inversePatch), reason });
      redoStack.length = 0;
    }
    updateHistoryButtons();
    log(reason, patch);
  }

  function undo() {
    const transaction = undoStack.pop();
    if (!transaction) return;
    applyTransaction(transaction.inversePatch, transaction.patch, `undo:${transaction.reason}`, false);
    redoStack.push(transaction);
    updateHistoryButtons();
  }

  function redo() {
    const transaction = redoStack.pop();
    if (!transaction) return;
    applyTransaction(transaction.patch, transaction.inversePatch, `redo:${transaction.reason}`, false);
    undoStack.push(transaction);
    updateHistoryButtons();
  }

  function stepById(nodeId) {
    return currentDocument.steps.find(
      (step) => String(step.step_id) === String(nodeId)
    ) || null;
  }

  function stepFlowId(nodeId) {
    return stepById(nodeId)?.flow_id;
  }

  function resolveConnectionScope(source, target) {
    const sourceId = String(source.node_id);
    const targetId = String(target.node_id);
    const sourceStep = stepById(sourceId);
    const targetStep = stepById(targetId);
    const sourceLoop = String(sourceStep?.loop_owner_id || "");
    const targetLoop = String(targetStep?.loop_owner_id || "");

    if (sourceLoop || targetLoop) {
      const ownerId = sourceLoop || targetLoop;
      const sourceInside = sourceLoop === ownerId || sourceId === ownerId;
      const targetInside = targetLoop === ownerId || targetId === ownerId;
      if (!sourceInside || !targetInside) {
        throw new Error("connection scope could not be resolved");
      }
      return {
        kind: "loop",
        id: ownerId,
        from: sourceId === ownerId ? "START" : sourceId,
        to: targetId === ownerId ? "END" : targetId
      };
    }

    const id = source.flow_id || target.flow_id ||
      stepFlowId(sourceId) || stepFlowId(targetId) || flowId;
    return { kind: "flow", id, from: sourceId, to: targetId };
  }

  function addConnection(payload) {
    const scope = resolveConnectionScope(
      payload.source_node_ref,
      payload.target_node_ref
    );
    const edges = scope.kind === "loop"
      ? currentDocument.loop.flows[scope.id].edges
      : currentDocument.flows[scope.id].edges;
    const edge = {
      from: scope.from,
      to: scope.to,
      order: edges.length + 1
    };
    const path = scope.kind === "loop"
      ? ["loop", "flows", scope.id, "edges", edges.length]
      : ["flows", scope.id, "edges", edges.length];
    applyTransaction(
      [{ op: "add", path, value: edge }],
      [{ op: "remove", path }],
      "edge.create",
      true
    );
  }

  function edgeSelectionKey(ref) {
    if (ref.loop_owner_id) {
      return `loop:${ref.loop_owner_id}:${ref.from}:${ref.to}`;
    }
    if (ref.graph_scope) {
      return `${ref.graph_scope}:${ref.from}:${ref.to}`;
    }
    return `flow:${ref.flow_id || ""}:${ref.from}:${ref.to}`;
  }

  function deleteSelection(selection) {
    const selectedNodeIds = new Set(
      selection.nodes
        .filter((ref) => !["START", "END"].includes(String(ref.node_id)))
        .map((ref) => String(ref.node_id))
    );
    currentDocument.steps.forEach((step) => {
      if (selectedNodeIds.has(String(step.loop_owner_id || ""))) {
        selectedNodeIds.add(String(step.step_id));
      }
    });
    const selectedEdgeKeys = new Set(
      selection.edges.map(edgeSelectionKey)
    );
    const selectedNotes = new Set(selection.annotation_ids.map(String));

    const nextSteps = currentDocument.steps.filter(
      (step) => !selectedNodeIds.has(String(step.step_id))
    );
    const nextFlows = clone(currentDocument.flows);
    Object.entries(nextFlows).forEach(([id, flow]) => {
      flow.edges = flow.edges.filter((edge) => (
        !selectedNodeIds.has(String(edge.from)) &&
        !selectedNodeIds.has(String(edge.to)) &&
        !selectedEdgeKeys.has(`flow:${id}:${edge.from}:${edge.to}`)
      ));
    });
    const nextLoop = clone(currentDocument.loop || { flows: {} });
    Object.entries(nextLoop.flows || {}).forEach(([ownerId, graph]) => {
      if (selectedNodeIds.has(ownerId)) {
        delete nextLoop.flows[ownerId];
        return;
      }
      graph.edges = graph.edges.filter((edge) => (
        !selectedNodeIds.has(String(edge.from)) &&
        !selectedNodeIds.has(String(edge.to)) &&
        !selectedEdgeKeys.has(`loop:${ownerId}:${edge.from}:${edge.to}`)
      ));
    });
    const nextNotes = currentDocument.notes.filter(
      (note) => !selectedNotes.has(String(note.note_id))
    );

    const patch = [
      { op: "replace", path: ["steps"], value: nextSteps },
      { op: "replace", path: ["flows"], value: nextFlows },
      { op: "replace", path: ["loop"], value: nextLoop },
      { op: "replace", path: ["notes"], value: nextNotes }
    ];
    const inversePatch = [
      { op: "replace", path: ["steps"], value: clone(currentDocument.steps) },
      { op: "replace", path: ["flows"], value: clone(currentDocument.flows) },
      { op: "replace", path: ["loop"], value: clone(currentDocument.loop) },
      { op: "replace", path: ["notes"], value: clone(currentDocument.notes) }
    ];
    applyTransaction(patch, inversePatch, "selection.delete", true);
    designer.setSelection({ nodes: [], edges: [], annotation_ids: [] });
  }


  function addNode(stepId, position) {
    const id = String(stepId || "").trim();
    if (!id) throw new Error("node:add-request requires step_id");
    const step = {
      step_id: id,
      flow_id: flowId,
      node_type: "transform",
      label: `新しいノード ${id}`,
      description: "処理内容を設定",
      ui_position: {
        x: Math.round(Number(position?.x) || 0),
        y: Math.round(Number(position?.y) || 0)
      }
    };
    const path = ["steps", currentDocument.steps.length];
    applyTransaction(
      [{ op: "add", path, value: step }],
      [{ op: "remove", path }],
      "node.add",
      true
    );
    designer.setSelection({
      nodes: [{ node_id: id }],
      edges: [],
      annotation_ids: []
    });
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  async function runDemo() {
    runSequence += 1;
    const token = runSequence;
    const ids = currentDocument.steps.map((step) => String(step.step_id));
    const nodeStatus = Object.fromEntries(ids.map((id) => [id, "waiting"]));
    designer.setStatus({ nodeStatus, validation: {} });
    log("workflow.run", { status: "started" });

    for (const id of ids) {
      if (token !== runSequence) return;
      nodeStatus[id] = "running";
      designer.setStatus({ nodeStatus: clone(nodeStatus), validation: {} });
      await wait(650);
      if (token !== runSequence) return;
      nodeStatus[id] = id === "04" ? "error" : "success";
      designer.setStatus({
        nodeStatus: clone(nodeStatus),
        validation: id === "04"
          ? { "04": [{ level: "error", message: "デモ実行エラー" }] }
          : {}
      });
      await wait(300);
    }
    log("workflow.run", { status: "finished", result: "error" });
  }

  designer.on("document:change", (transaction) => {
    applyTransaction(
      transaction.patch,
      transaction.inversePatch,
      transaction.reason,
      true
    );
  });

  designer.on("node:add-request", ({ step_id: stepId, position }) => {
    log("node:add-request", { step_id: stepId, position });
    addNode(stepId, position);
  });

  designer.on("connect:create-request", (payload) => {
    log("connect:create-request", payload);
    addConnection(payload);
  });

  designer.on("delete:request", ({ selection }) => {
    log("delete:request", selection);
    deleteSelection(selection);
  });

  designer.on("command:execute", ({ commandId, target }) => {
    if (commandId === "history.undo") undo();
    if (commandId === "history.redo") redo();
    log("command:execute", { commandId, target });
  });

  designer.on("run:request", (payload) => {
    log("run:request", payload);
    if (payload.mode === "workflow") runDemo();
  });

  designer.on("selection:change", (payload) => log("selection:change", payload));
  designer.on("viewport:change", (payload) => log("viewport:change", payload));
  designer.on("node:open-detail", (payload) => log("node:open-detail", payload));
  designer.on("external-link:open-request", ({ url }) => {
    log("external-link:open-request", { url });
    window.open(url, "_blank", "noopener");
  });

  document.getElementById("clear-log").addEventListener("click", () => {
    logElement.textContent = "";
  });

  designer.mount();
  updateHistoryButtons();
  log("sample.ready", { steps: currentDocument.steps.length });

  window.workflowDesignerSample = Object.freeze({
    designer,
    getDocument: () => clone(currentDocument),
    runDemo,
    undo,
    redo
  });
})();
