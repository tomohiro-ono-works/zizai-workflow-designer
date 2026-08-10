(function () {
  "use strict";

  const { createWorkflowDesigner, applyDocumentPatch } =
    window.zizPackages.workflowDesigner;

  const flowId = "01";
  let currentDocument = {
    metadata: { title: "WorkflowDesigner 最小構成" },
    steps: [
      {
        step_id: "01",
        flow_id: flowId,
        node_type: "task",
        label: "処理 1",
        description: "通常ノード",
        ui_position: { x: 242, y: 176 }
      },
      {
        step_id: "02",
        flow_id: flowId,
        node_type: "loop",
        label: "繰り返し",
        description: "LOOPノード",
        ui_position: { x: 506, y: 176 }
      },
      {
        step_id: "03",
        loop_owner_id: "02",
        node_type: "task",
        label: "ループ処理",
        description: "LOOP内部ノード",
        ui_position: { x: 550, y: 396 }
      },
      {
        step_id: "04",
        flow_id: flowId,
        node_type: "task",
        label: "処理 2",
        description: "通常ノード",
        ui_position: { x: 814, y: 176 }
      }
    ],
    flows: {
      [flowId]: {
        start: { ui_position: { x: 66, y: 198 } },
        end: { ui_position: { x: 1100, y: 198 } },
        edges: [
          { from: "START", to: "01", order: 1 },
          { from: "01", to: "02", order: 2 },
          { from: "02", to: "04", order: 3 },
          { from: "04", to: "END", order: 4 }
        ]
      }
    },
    loop: {
      flows: {
        "02": {
          edges: [
            { from: "START", to: "03", order: 1 },
            { from: "03", to: "END", order: 2 }
          ]
        }
      }
    },
    notes: []
  };

  const undoStack = [];
  const redoStack = [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  const designer = createWorkflowDesigner({
    root: document.getElementById("workflow-root"),
    document: currentDocument,
    viewport: { x: 18, y: 62, zoom: 0.8 },
    graphMode: "dag",
    nodeGrid: { enabled: true, size: 22 },
    connectionSnapDistance: 24
  });

  function updateHistoryButtons() {
    const root = document.getElementById("workflow-root");
    const undoButton = root.querySelector('[data-zwd-command="history.undo"]');
    const redoButton = root.querySelector('[data-zwd-command="history.redo"]');
    if (undoButton) undoButton.disabled = undoStack.length === 0;
    if (redoButton) redoButton.disabled = redoStack.length === 0;
  }

  function applyTransaction(patch, inversePatch, reason, addHistory) {
    currentDocument = applyDocumentPatch(currentDocument, patch);
    designer.updateDocument(patch);

    if (addHistory) {
      undoStack.push({
        patch: clone(patch),
        inversePatch: clone(inversePatch),
        reason: String(reason || "document.edit")
      });
      redoStack.length = 0;
    }

    updateHistoryButtons();
  }

  function undo() {
    const transaction = undoStack.pop();
    if (!transaction) return;
    applyTransaction(
      transaction.inversePatch,
      transaction.patch,
      `undo:${transaction.reason}`,
      false
    );
    redoStack.push(transaction);
    updateHistoryButtons();
  }

  function redo() {
    const transaction = redoStack.pop();
    if (!transaction) return;
    applyTransaction(
      transaction.patch,
      transaction.inversePatch,
      `redo:${transaction.reason}`,
      false
    );
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

    const selectedEdgeKeys = new Set(selection.edges.map(edgeSelectionKey));
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
      node_type: "task",
      label: `新しいノード ${id}`,
      description: "",
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

  designer.on("document:change", (transaction) => {
    applyTransaction(
      transaction.patch,
      transaction.inversePatch,
      transaction.reason,
      true
    );
  });

  designer.on("node:add-request", ({ step_id: stepId, position }) => {
    addNode(stepId, position);
  });

  designer.on("connect:create-request", (payload) => {
    addConnection(payload);
  });

  designer.on("delete:request", ({ selection }) => {
    deleteSelection(selection);
  });

  designer.on("command:execute", ({ commandId }) => {
    if (commandId === "history.undo") undo();
    if (commandId === "history.redo") redo();
  });

  designer.mount();
  updateHistoryButtons();
})();
