(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  const NODE_WIDTH = 132;
  const NODE_HEIGHT = 132;
  const NODE_VISUAL_SIZE = 88;
  const NODE_VISUAL_OFFSET_X = 22;
  const TERMINAL_WIDTH = NODE_WIDTH;
  const TERMINAL_HEIGHT = NODE_HEIGHT;
  const UNASSIGNED_START_HEIGHT = 48;
  const DEFAULT_GAP_X = 252;
  const DEFAULT_GAP_Y = 180;

  function position(value, fallback) {
    return modules.normalizePosition(value, fallback);
  }

  function stepKey(stepId) {
    return `step:${String(stepId)}`;
  }

  function flowNodeKey(flowId, nodeId) {
    return `flow:${String(flowId)}:node:${nodeId}`;
  }

  function unassignedNodeKey(nodeId) {
    return `unassigned:node:${nodeId}`;
  }

  function createStepNode(step, index) {
    const stepId = String(step?.step_id || "").trim();
    if (!stepId) return null;
    const fallback = {
      x: 280 + (index % 4) * DEFAULT_GAP_X,
      y: 120 + Math.floor(index / 4) * DEFAULT_GAP_Y
    };
    const nodeType = String(step?.node_type || "task").trim() || "task";
    const anchors = nodeType === "loop"
      ? {
          enter: { x: NODE_VISUAL_OFFSET_X, y: 26 },
          return: { x: NODE_VISUAL_OFFSET_X, y: 62 },
          done: { x: NODE_VISUAL_OFFSET_X + NODE_VISUAL_SIZE, y: 26 },
          loop: { x: NODE_VISUAL_OFFSET_X + NODE_VISUAL_SIZE, y: 62 }
        }
      : {
          in: { x: NODE_VISUAL_OFFSET_X, y: NODE_VISUAL_SIZE / 2 },
          out: {
            x: NODE_VISUAL_OFFSET_X + NODE_VISUAL_SIZE,
            y: NODE_VISUAL_SIZE / 2
          }
        };
    return {
      key: stepKey(stepId),
      kind: "step",
      nodeType,
      label: String(step?.label || stepId),
      ref: { node_id: stepId },
      step,
      x: position(step?.ui_position, fallback).x,
      y: position(step?.ui_position, fallback).y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      anchors,
      documentPath: ["steps", index, "ui_position"]
    };
  }

  function createTerminalNode(flowId, flow, nodeId, flowIndex) {
    const isStart = nodeId === "START";
    const fallback = {
      x: isStart ? 72 : 900,
      y: 96 + flowIndex * 360
    };
    const source = isStart ? flow?.start : flow?.end;
    const point = position(source?.ui_position, fallback);
    const field = isStart ? "start" : "end";
    return {
      key: flowNodeKey(flowId, nodeId),
      kind: isStart ? "start" : "end",
      nodeType: isStart ? "start" : "end",
      label: nodeId,
      ref: { node_id: nodeId, flow_id: flowId },
      x: point.x,
      y: point.y,
      width: TERMINAL_WIDTH,
      height: TERMINAL_HEIGHT,
      anchors: isStart
        ? { out: { x: NODE_VISUAL_OFFSET_X + NODE_VISUAL_SIZE, y: NODE_VISUAL_SIZE / 2 } }
        : { in: { x: NODE_VISUAL_OFFSET_X, y: NODE_VISUAL_SIZE / 2 } },
      documentPath: ["flows", flowId, field, "ui_position"]
    };
  }

  function createEdge(
    ref,
    sourceKey,
    targetKey,
    edge,
    kind = "main",
    sourcePort = "out",
    targetPort = "in"
  ) {
    return {
      key: modules.edgeRefKey(ref),
      ref,
      sourceKey,
      targetKey,
      sourcePort,
      targetPort,
      order: Number.isFinite(Number(edge?.order)) ? Number(edge.order) : 0,
      kind
    };
  }

  function buildMainEdges(document, nodeByKey) {
    const edges = [];
    Object.entries(document?.flows || {}).forEach(([flowId, flow]) => {
      (Array.isArray(flow?.edges) ? flow.edges : []).forEach((edge) => {
        const from = String(edge?.from || "").trim();
        const to = String(edge?.to || "").trim();
        if (!from || !to) return;
        const sourceKey = from === "START" || from === "END"
          ? flowNodeKey(flowId, from)
          : stepKey(from);
        const targetKey = to === "START" || to === "END"
          ? flowNodeKey(flowId, to)
          : stepKey(to);
        if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) return;
        const source = nodeByKey.get(sourceKey);
        const target = nodeByKey.get(targetKey);
        edges.push(createEdge(
          { flow_id: flowId, from, to },
          sourceKey,
          targetKey,
          edge,
          "main",
          source?.nodeType === "loop" ? "done" : "out",
          target?.nodeType === "loop" ? "enter" : "in"
        ));
      });
    });
    return edges;
  }

  function buildLoopEdges(document, nodeByKey) {
    const edges = [];
    Object.entries(document?.loop?.flows || {}).forEach(([ownerId, graph]) => {
      const ownerKey = stepKey(ownerId);
      if (!nodeByKey.has(ownerKey)) return;
      (Array.isArray(graph?.edges) ? graph.edges : []).forEach((edge) => {
        const from = String(edge?.from || "").trim();
        const to = String(edge?.to || "").trim();
        if (!from || !to) return;
        const sourceKey = from === "START" || from === "END"
          ? ownerKey
          : stepKey(from);
        const targetKey = to === "START" || to === "END"
          ? ownerKey
          : stepKey(to);
        if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) return;
        const target = nodeByKey.get(targetKey);
        edges.push(createEdge(
          { loop_owner_id: ownerId, from, to },
          sourceKey,
          targetKey,
          edge,
          to === "END" ? "loop-back" : "loop",
          from === "START" ? "loop" : "out",
          to === "END" ? "return" : (target?.nodeType === "loop" ? "enter" : "in")
        ));
      });
    });
    return edges;
  }

  function buildUnassigned(document, nodes, nodeByKey) {
    const unassigned = document?.unassigned;
    if (!unassigned || typeof unassigned !== "object") return [];
    const fallback = { x: 72, y: 720 };
    const point = position(unassigned.start?.ui_position, fallback);
    const start = {
      key: unassignedNodeKey("START"),
      kind: "unassigned-start",
      nodeType: "start",
      label: "UNASSIGNED",
      ref: { node_id: "START", graph_scope: "unassigned" },
      x: point.x,
      y: point.y,
      width: 136,
      height: UNASSIGNED_START_HEIGHT,
      documentPath: ["unassigned", "start", "ui_position"]
    };
    nodes.push(start);
    nodeByKey.set(start.key, start);
    const edges = [];
    (Array.isArray(unassigned.edges) ? unassigned.edges : []).forEach((edge) => {
      const from = String(edge?.from || "").trim();
      const to = String(edge?.to || "").trim();
      if (!from || !to) return;
      const sourceKey = from === "START" ? start.key : stepKey(from);
      const targetKey = to === "START" ? start.key : stepKey(to);
      if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) return;
      edges.push(createEdge(
        { graph_scope: "unassigned", from, to },
        sourceKey,
        targetKey,
        edge,
        "unassigned"
      ));
    });
    return edges;
  }

  function buildLoopFrames(document, nodeByKey) {
    return Object.keys(document?.loop?.flows || {}).map((ownerId) => {
      const owner = nodeByKey.get(stepKey(ownerId));
      if (!owner) return null;
      const children = (Array.isArray(document?.steps) ? document.steps : [])
        .filter((step) => String(step?.loop_owner_id || "") === ownerId)
        .map((step) => nodeByKey.get(stepKey(step.step_id)))
        .filter(Boolean);
      const members = [owner, ...children];
      const minX = Math.min(...members.map((node) => node.x)) - 28;
      const minY = Math.min(...members.map((node) => node.y)) - 42;
      const maxX = Math.max(...members.map((node) => node.x + node.width)) + 28;
      const maxY = Math.max(...members.map((node) => node.y + node.height)) + 28;
      return {
        ownerId,
        label: owner.label,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      };
    }).filter(Boolean);
  }

  function normalizeNotes(document) {
    return (Array.isArray(document?.notes) ? document.notes : [])
      .map((note, index) => {
        const noteId = String(note?.note_id || "").trim();
        if (!noteId) return null;
        const point = position(note.ui_position, {
          x: 320 + index * 24,
          y: 560 + index * 24
        });
        const width = Math.max(160, modules.asFiniteNumber(note.size?.width, 240));
        const height = Math.max(96, modules.asFiniteNumber(note.size?.height, 144));
        return {
          note,
          noteId,
          key: `note:${noteId}`,
          x: point.x,
          y: point.y,
          width,
          height,
          positionPath: ["notes", index, "ui_position"],
          sizePath: ["notes", index, "size"],
          textPath: ["notes", index, "text"],
          colorPath: ["notes", index, "color"]
        };
      })
      .filter(Boolean);
  }

  function buildBounds(nodes, frames, notes) {
    const items = [
      ...nodes.map((item) => ({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height
      })),
      ...frames,
      ...notes
    ];
    if (!items.length) return { x: 0, y: 0, width: 960, height: 640 };
    const minX = Math.min(...items.map((item) => item.x));
    const minY = Math.min(...items.map((item) => item.y));
    const maxX = Math.max(...items.map((item) => item.x + item.width));
    const maxY = Math.max(...items.map((item) => item.y + item.height));
    return {
      x: minX,
      y: minY,
      width: Math.max(320, maxX - minX),
      height: Math.max(240, maxY - minY)
    };
  }

  function buildGraphModel(document) {
    const nodes = [];
    const nodeByKey = new Map();
    Object.entries(document?.flows || {}).forEach(([flowId, flow], index) => {
      ["START", "END"].forEach((nodeId) => {
        const node = createTerminalNode(flowId, flow, nodeId, index);
        nodes.push(node);
        nodeByKey.set(node.key, node);
      });
    });
    (Array.isArray(document?.steps) ? document.steps : []).forEach((step, index) => {
      const node = createStepNode(step, index);
      if (!node) return;
      nodes.push(node);
      nodeByKey.set(node.key, node);
    });
    const edges = [
      ...buildMainEdges(document, nodeByKey),
      ...buildLoopEdges(document, nodeByKey),
      ...buildUnassigned(document, nodes, nodeByKey)
    ];
    const loopFrames = [];
    const notes = normalizeNotes(document);
    return {
      nodes,
      edges,
      loopFrames,
      notes,
      nodeByKey,
      bounds: buildBounds(nodes, loopFrames, notes)
    };
  }


  function graphScopeForNode(node) {
    const loopOwnerId = String(node?.step?.loop_owner_id || "").trim();
    if (loopOwnerId) return { kind: "loop", id: loopOwnerId };
    if (node?.kind === "unassigned-start") {
      return { kind: "unassigned", id: "unassigned" };
    }
    const flowId = String(
      node?.ref?.flow_id || node?.step?.flow_id || ""
    ).trim();
    if (flowId) return { kind: "flow", id: flowId };
    if (node?.kind === "step") {
      return { kind: "unassigned", id: "unassigned" };
    }
    return null;
  }

  function sameScope(left, right) {
    return !!left && !!right && left.kind === right.kind && left.id === right.id;
  }

  function resolveConnectionScope(source, target) {
    const sourceLoop = String(source?.step?.loop_owner_id || "").trim();
    const targetLoop = String(target?.step?.loop_owner_id || "").trim();
    const sourceId = String(source?.ref?.node_id || "").trim();
    const targetId = String(target?.ref?.node_id || "").trim();

    if (sourceLoop || targetLoop) {
      const ownerId = sourceLoop || targetLoop;
      const sourceInside = sourceLoop === ownerId || sourceId === ownerId;
      const targetInside = targetLoop === ownerId || targetId === ownerId;
      if (sourceInside && targetInside && (!sourceLoop || sourceLoop === ownerId) &&
          (!targetLoop || targetLoop === ownerId)) {
        return { kind: "loop", id: ownerId };
      }
      return null;
    }

    const sourceScope = graphScopeForNode(source);
    const targetScope = graphScopeForNode(target);
    return sameScope(sourceScope, targetScope) ? sourceScope : null;
  }

  function logicalNodeId(node, scope, role) {
    const nodeId = String(node?.ref?.node_id || "").trim();
    if (scope?.kind === "loop" && nodeId === scope.id &&
        !String(node?.step?.loop_owner_id || "").trim()) {
      return role === "source" ? "START" : "END";
    }
    return nodeId;
  }

  function edgeMatchesScope(edge, scope) {
    const ref = edge?.ref || edge || {};
    if (scope?.kind === "flow") {
      return String(ref.flow_id || "") === scope.id;
    }
    if (scope?.kind === "loop") {
      return String(ref.loop_owner_id || "") === scope.id;
    }
    return scope?.kind === "unassigned" &&
      String(ref.graph_scope || "") === "unassigned";
  }

  function scopedEdges(model, scope) {
    return (Array.isArray(model?.edges) ? model.edges : [])
      .filter((edge) => edgeMatchesScope(edge, scope))
      .map((edge) => ({
        from: String(edge?.ref?.from || "").trim(),
        to: String(edge?.ref?.to || "").trim()
      }))
      .filter((edge) => edge.from && edge.to);
  }

  function isReachable(edges, start, goal) {
    if (!start || !goal) return false;
    const adjacency = new Map();
    edges.forEach(({ from, to }) => {
      const targets = adjacency.get(from) || [];
      targets.push(to);
      adjacency.set(from, targets);
    });
    const pending = [start];
    const visited = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (current === goal) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      (adjacency.get(current) || []).forEach((next) => {
        if (!visited.has(next)) pending.push(next);
      });
    }
    return false;
  }

  function wouldCreateCycle(model, source, target) {
    const scope = resolveConnectionScope(source, target);
    if (!scope) return false;
    const sourceId = logicalNodeId(source, scope, "source");
    const targetId = logicalNodeId(target, scope, "target");
    return isReachable(scopedEdges(model, scope), targetId, sourceId);
  }

  function stronglyConnectedCycles(edges) {
    const adjacency = new Map();
    const nodes = new Set();
    edges.forEach(({ from, to }) => {
      nodes.add(from);
      nodes.add(to);
      const targets = adjacency.get(from) || [];
      targets.push(to);
      adjacency.set(from, targets);
    });

    let nextIndex = 0;
    const indexByNode = new Map();
    const lowByNode = new Map();
    const stack = [];
    const onStack = new Set();
    const cycles = [];

    function visit(nodeId) {
      indexByNode.set(nodeId, nextIndex);
      lowByNode.set(nodeId, nextIndex);
      nextIndex += 1;
      stack.push(nodeId);
      onStack.add(nodeId);

      (adjacency.get(nodeId) || []).forEach((targetId) => {
        if (!indexByNode.has(targetId)) {
          visit(targetId);
          lowByNode.set(
            nodeId,
            Math.min(lowByNode.get(nodeId), lowByNode.get(targetId))
          );
        } else if (onStack.has(targetId)) {
          lowByNode.set(
            nodeId,
            Math.min(lowByNode.get(nodeId), indexByNode.get(targetId))
          );
        }
      });

      if (lowByNode.get(nodeId) !== indexByNode.get(nodeId)) return;
      const component = [];
      let item = null;
      do {
        item = stack.pop();
        onStack.delete(item);
        component.push(item);
      } while (item !== nodeId);

      const selfLoop = component.length === 1 && edges.some(
        (edge) => edge.from === component[0] && edge.to === component[0]
      );
      if (component.length > 1 || selfLoop) cycles.push(component);
    }

    nodes.forEach((nodeId) => {
      if (!indexByNode.has(nodeId)) visit(nodeId);
    });
    return cycles;
  }

  function documentGraphScopes(document) {
    const scopes = [];
    Object.entries(document?.flows || {}).forEach(([flowId, flow]) => {
      scopes.push({
        scope: { kind: "flow", id: String(flowId) },
        edges: Array.isArray(flow?.edges) ? flow.edges : []
      });
    });
    Object.entries(document?.loop?.flows || {}).forEach(([ownerId, graph]) => {
      scopes.push({
        scope: { kind: "loop", id: String(ownerId) },
        edges: Array.isArray(graph?.edges) ? graph.edges : []
      });
    });
    if (document?.unassigned && typeof document.unassigned === "object") {
      scopes.push({
        scope: { kind: "unassigned", id: "unassigned" },
        edges: Array.isArray(document.unassigned.edges)
          ? document.unassigned.edges
          : []
      });
    }
    return scopes;
  }

  function findGraphCycles(document) {
    const output = [];
    documentGraphScopes(document).forEach(({ scope, edges }) => {
      const normalized = edges.map((edge) => ({
        from: String(edge?.from || "").trim(),
        to: String(edge?.to || "").trim()
      })).filter((edge) => edge.from && edge.to);
      stronglyConnectedCycles(normalized).forEach((nodeIds) => {
        output.push({
          scope: { ...scope },
          nodeIds: [...nodeIds],
          message: "循環する接続が含まれています。"
        });
      });
    });
    return output;
  }

  function validateConnection(model, source, target, options = {}) {
    if (!source || !target) {
      return { allowed: false, message: "Connection target is missing." };
    }
    if (source.key === target.key) {
      return { allowed: false, message: "A node cannot connect to itself." };
    }
    if (source.kind === "end") {
      return { allowed: false, message: "END cannot be a connection source." };
    }
    if (["start", "unassigned-start"].includes(target.kind)) {
      return { allowed: false, message: "START cannot be a connection target." };
    }

    const duplicateByKey = (Array.isArray(model?.edges) ? model.edges : []).some(
      (edge) => edge.sourceKey === source.key && edge.targetKey === target.key
    );
    if (duplicateByKey) {
      return { allowed: false, message: "This connection already exists." };
    }

    const sourceIdForPort = String(source?.ref?.node_id || "").trim();
    const targetLoopForPort = String(target?.step?.loop_owner_id || "").trim();
    if (source?.nodeType === "loop") {
      const sourcePort = String(source.connectionPort || "done");
      if (sourcePort === "loop" && targetLoopForPort !== sourceIdForPort) {
        return {
          allowed: false,
          message: "The loop output can connect only to nodes inside this loop."
        };
      }
      if (sourcePort === "done" && targetLoopForPort === sourceIdForPort) {
        return {
          allowed: false,
          message: "The done output cannot connect to nodes inside this loop."
        };
      }
    }

    const scope = resolveConnectionScope(source, target);
    if (!scope) {
      return {
        allowed: false,
        message: "Nodes in different graph scopes cannot be connected."
      };
    }
    const sourceId = logicalNodeId(source, scope, "source");
    const targetId = logicalNodeId(target, scope, "target");
    const duplicate = scopedEdges(model, scope).some(
      (edge) => edge.from === sourceId && edge.to === targetId
    );
    if (duplicate) {
      return { allowed: false, message: "This connection already exists." };
    }
    if (options.graphMode === "dag" && wouldCreateCycle(model, source, target)) {
      return { allowed: false, message: "循環する接続は作成できません。" };
    }
    return { allowed: true };
  }

  modules.buildWorkflowGraphModel = buildGraphModel;
  modules.workflowStepKey = stepKey;
  modules.workflowFlowNodeKey = flowNodeKey;
  modules.workflowGraphScopeForNode = graphScopeForNode;
  modules.resolveWorkflowConnectionScope = resolveConnectionScope;
  modules.workflowWouldCreateCycle = wouldCreateCycle;
  modules.findWorkflowGraphCycles = findGraphCycles;
  modules.validateWorkflowConnection = validateConnection;
})(window);
