(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function movedNode(node, movedKeys, dx, dy) {
    if (!movedKeys?.has?.(node.key)) return node;
    return {
      ...node,
      x: node.x + dx,
      y: node.y + dy
    };
  }

  function nodeAnchor(node, port) {
    if (typeof modules.workflowNodeAnchor === "function") {
      return modules.workflowNodeAnchor(node, port);
    }
    const relative = node?.anchors?.[port];
    return {
      x: Number(node?.x || 0) + Number(
        relative?.x ?? (port === "in" ? 0 : node?.width || 0)
      ),
      y: Number(node?.y || 0) + Number(
        relative?.y ?? (Number(node?.height || 0) / 2)
      )
    };
  }

  const EDGE_CORNER_RADIUS = 8;
  const EDGE_STUB = 32;
  const EDGE_ESCAPE = 48;

  function formatCoordinate(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number)
      ? String(number)
      : String(Math.round(number * 1000) / 1000);
  }

  function samePoint(left, right) {
    return left.x === right.x && left.y === right.y;
  }

  function collinear(left, middle, right) {
    return (left.x === middle.x && middle.x === right.x) ||
      (left.y === middle.y && middle.y === right.y);
  }

  function compactOrthogonalPoints(points) {
    const compact = [];
    points.forEach((point) => {
      const normalized = {
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0
      };
      if (!compact.length || !samePoint(compact[compact.length - 1], normalized)) {
        compact.push(normalized);
      }
    });
    let changed = true;
    while (changed && compact.length > 2) {
      changed = false;
      for (let index = 1; index < compact.length - 1; index += 1) {
        if (!collinear(compact[index - 1], compact[index], compact[index + 1])) {
          continue;
        }
        compact.splice(index, 1);
        changed = true;
        break;
      }
    }
    return compact;
  }

  function roundedPathFromPoints(points, radius = EDGE_CORNER_RADIUS) {
    const compact = compactOrthogonalPoints(points);
    if (!compact.length) return "";
    const commands = [
      `M ${formatCoordinate(compact[0].x)} ${formatCoordinate(compact[0].y)}`
    ];
    if (compact.length === 1) return commands.join(" ");

    for (let index = 1; index < compact.length - 1; index += 1) {
      const previous = compact[index - 1];
      const current = compact[index];
      const next = compact[index + 1];
      const incomingLength = Math.hypot(
        current.x - previous.x,
        current.y - previous.y
      );
      const outgoingLength = Math.hypot(
        next.x - current.x,
        next.y - current.y
      );
      const cornerRadius = Math.min(
        radius,
        incomingLength / 2,
        outgoingLength / 2
      );
      if (!cornerRadius) {
        commands.push(`L ${formatCoordinate(current.x)} ${formatCoordinate(current.y)}`);
        continue;
      }
      const before = {
        x: current.x + ((previous.x - current.x) / incomingLength) * cornerRadius,
        y: current.y + ((previous.y - current.y) / incomingLength) * cornerRadius
      };
      const after = {
        x: current.x + ((next.x - current.x) / outgoingLength) * cornerRadius,
        y: current.y + ((next.y - current.y) / outgoingLength) * cornerRadius
      };
      commands.push(
        `L ${formatCoordinate(before.x)} ${formatCoordinate(before.y)}`,
        `Q ${formatCoordinate(current.x)} ${formatCoordinate(current.y)} ` +
          `${formatCoordinate(after.x)} ${formatCoordinate(after.y)}`
      );
    }

    const last = compact[compact.length - 1];
    commands.push(`L ${formatCoordinate(last.x)} ${formatCoordinate(last.y)}`);
    return commands.join(" ");
  }

  function roundedOrthogonalPath(sourcePoint, targetPoint) {
    const source = {
      x: Number(sourcePoint?.x) || 0,
      y: Number(sourcePoint?.y) || 0
    };
    const target = {
      x: Number(targetPoint?.x) || 0,
      y: Number(targetPoint?.y) || 0
    };
    const horizontalGap = target.x - source.x;
    const verticalGap = target.y - source.y;
    let points;

    if (horizontalGap >= 0) {
      if (verticalGap === 0) {
        points = [source, target];
      } else {
        const middleX = (source.x + target.x) / 2;
        points = [
          source,
          { x: middleX, y: source.y },
          { x: middleX, y: target.y },
          target
        ];
      }
    } else {
      const routeY = target.y >= source.y
        ? Math.max(source.y, target.y) + EDGE_ESCAPE
        : Math.min(source.y, target.y) - EDGE_ESCAPE;
      points = [
        source,
        { x: source.x + EDGE_STUB, y: source.y },
        { x: source.x + EDGE_STUB, y: routeY },
        { x: target.x - EDGE_STUB, y: routeY },
        { x: target.x - EDGE_STUB, y: target.y },
        target
      ];
    }
    return roundedPathFromPoints(points);
  }

  function edgePath(edge, source, target) {
    return roundedOrthogonalPath(
      nodeAnchor(source, edge.sourcePort || "out"),
      nodeAnchor(target, edge.targetPort || "in")
    );
  }

  function previewEdgePath(edge, source, target, movedKeys, dx, dy) {
    return edgePath(
      edge,
      movedNode(source, movedKeys, dx, dy),
      movedNode(target, movedKeys, dx, dy)
    );
  }

  function rendererFor(node, renderers) {
    if (!renderers || typeof renderers !== "object") return null;
    return renderers[node.nodeType] || renderers.default || null;
  }

  function statusText(value) {
    return {
      waiting: "Waiting",
      running: "Running",
      success: "Success",
      error: "ERROR",
      skipped: "Skipped",
      idle: ""
    }[value] || "";
  }

  function createRenderer(shell) {
    let model = null;
    let nodeElements = new Map();
    let edgeElements = new Map();
    let edgeModelsByKey = new Map();
    let incidentEdgeKeysByNode = new Map();
    let noteElements = new Map();
    let movePreview = null;
    let movePreviewFrame = 0;
    let previewNodeKeys = new Set();
    const feedback = modules.createWorkflowFeedback(shell);
    const requestFrame = typeof root.requestAnimationFrame === "function"
      ? root.requestAnimationFrame.bind(root)
      : (callback) => root.setTimeout(callback, 16);
    const cancelFrame = typeof root.cancelAnimationFrame === "function"
      ? root.cancelAnimationFrame.bind(root)
      : root.clearTimeout.bind(root);

    function clearLayer(layer) {
      while (layer.firstChild) layer.firstChild.remove();
    }

    function renderFrames() {
      clearLayer(shell.frameLayer);
      model.loopFrames.forEach((frame) => {
        shell.frameLayer.appendChild(modules.createWorkflowLoopFrame(frame));
      });
    }

    function renderEdges() {
      clearLayer(shell.edgeGroup);
      edgeElements = new Map();
      edgeModelsByKey = new Map();
      incidentEdgeKeysByNode = new Map();
      const markerId = shell.edges.dataset.markerId;
      model.edges.forEach((edge) => {
        const source = model.nodeByKey.get(edge.sourceKey);
        const target = model.nodeByKey.get(edge.targetKey);
        if (!source || !target) return;
        const group = modules.createWorkflowSvgElement("g", "zwd-edge", {
          "data-edge-key": edge.key,
          "data-edge-scope": edge.ref.flow_id
            ? "flow"
            : (edge.ref.loop_owner_id ? "loop" : "unassigned")
        });
        const visible = modules.createWorkflowSvgElement("path", "zwd-edge__line", {
          d: edgePath(edge, source, target),
          "marker-end": `url(#${markerId})`
        });
        const hit = modules.createWorkflowSvgElement("path", "zwd-edge__hit", {
          d: edgePath(edge, source, target)
        });
        group.appendChild(visible);
        group.appendChild(hit);
        shell.edgeGroup.appendChild(group);
        edgeElements.set(edge.key, group);
        edgeModelsByKey.set(edge.key, edge);
        [edge.sourceKey, edge.targetKey].forEach((nodeKey) => {
          const keys = incidentEdgeKeysByNode.get(nodeKey) || new Set();
          keys.add(edge.key);
          incidentEdgeKeysByNode.set(nodeKey, keys);
        });
      });
    }

    function renderNodes(renderers, readonly) {
      clearLayer(shell.nodeLayer);
      nodeElements = new Map();
      model.nodes.forEach((node) => {
        const context = Object.freeze({
          nodeRef: modules.cloneValue(node.ref),
          nodeType: node.nodeType,
          kind: node.kind,
          readonly: !!readonly
        });
        const wrapper = modules.createWorkflowNodeElement(
          node,
          rendererFor(node, renderers),
          context
        );
        shell.nodeLayer.appendChild(wrapper);
        nodeElements.set(node.key, wrapper);
      });
    }

    function renderNotes(readonly) {
      clearLayer(shell.noteLayer);
      noteElements = new Map();
      model.notes.forEach((note) => {
        const wrapper = modules.createWorkflowNoteElement(note, readonly);
        shell.noteLayer.appendChild(wrapper);
        noteElements.set(note.noteId, wrapper);
      });
    }

    function cancelMovePreviewFrame() {
      if (!movePreviewFrame) return;
      cancelFrame(movePreviewFrame);
      movePreviewFrame = 0;
    }

    function renderDocument(nextModel, options = {}) {
      cancelMovePreviewFrame();
      movePreview = null;
      previewNodeKeys = new Set();
      model = nextModel;
      const width = Math.max(2400, model.bounds.x + model.bounds.width + 480);
      const height = Math.max(1600, model.bounds.y + model.bounds.height + 360);
      shell.world.style.width = `${width}px`;
      shell.world.style.height = `${height}px`;
      shell.edges.setAttribute("width", String(width));
      shell.edges.setAttribute("height", String(height));
      renderFrames();
      renderEdges();
      renderNodes(options.nodeRenderers, options.readonly);
      renderNotes(options.readonly);
      applySelection(options.selection);
      applyStatus(options.status);
      applyAnnotationMode(options.annotationMode);
    }

    function applySelection(selection) {
      const normalized = modules.normalizeSelection(selection);
      const selectedNodes = new Set(normalized.nodes.map(modules.nodeRefKey));
      const selectedEdges = new Set(normalized.edges.map(modules.edgeRefKey));
      const selectedNotes = new Set(normalized.annotation_ids);
      nodeElements.forEach((element, key) => {
        element.dataset.selected = selectedNodes.has(key) ? "true" : "false";
      });
      edgeElements.forEach((element, key) => {
        element.dataset.selected = selectedEdges.has(key) ? "true" : "false";
      });
      noteElements.forEach((element, key) => {
        element.dataset.selected = selectedNotes.has(key) ? "true" : "false";
      });
    }

    function applyStatus(status) {
      const normalized = modules.normalizeStatus(status);
      if (!model) return;
      model.nodes.forEach((node) => {
        const wrapper = nodeElements.get(node.key);
        if (!wrapper) return;
        const nodeId = String(node.ref.node_id || "");
        const value = normalized.nodeStatus[node.key] ||
          normalized.nodeStatus[nodeId] ||
          "idle";
        wrapper.dataset.runStatus = value;
        const label = wrapper.querySelector(".zwd-node__status");
        if (label) {
          label.textContent = statusText(value);
          label.hidden = !label.textContent;
        }
        const entries = normalized.validation[node.key] ||
          normalized.validation[nodeId] ||
          [];
        const validation = wrapper.querySelector(".zwd-node__validation");
        const level = entries.some((entry) => entry.level === "error")
          ? "error"
          : (entries.length ? "warning" : "");
        if (level) wrapper.dataset.validationLevel = level;
        else delete wrapper.dataset.validationLevel;
        if (validation) {
          validation.hidden = !entries.length;
          validation.title = entries.map((entry) => entry.message).join("\n");
        }
      });
    }

    function applyViewport(viewport) {
      const value = modules.normalizeViewport(viewport);
      shell.world.style.transform =
        `translate(${value.x}px, ${value.y}px) scale(${value.zoom})`;
    }

    function applyAnnotationMode(active) {
      const enabled = !!active;
      if (shell.shell?.dataset) {
        shell.shell.dataset.annotationMode = enabled ? "active" : "inactive";
      }
      const toggle = shell.toolbar?.querySelector?.(
        '[data-zwd-command="annotation.mode-toggle"]'
      );
      toggle?.setAttribute("aria-pressed", enabled ? "true" : "false");
      const noteControls = shell.noteLayer?.querySelectorAll?.(
        "[data-note-color], [data-note-resize]"
      ) || [];
      noteControls.forEach((control) => {
        control.disabled = !enabled;
        control.setAttribute("aria-disabled", enabled ? "false" : "true");
      });
    }

    function nodeCenter(nodeKey, port = "out") {
      const node = model?.nodeByKey.get(nodeKey);
      return node ? nodeAnchor(node, port) : null;
    }

    function showConnection(sourceKey, targetPoint, sourcePort = "out") {
      const source = nodeCenter(sourceKey, sourcePort);
      if (!source || !targetPoint) return;
      shell.connectionPreview.setAttribute(
        "d",
        roundedOrthogonalPath(source, targetPoint)
      );
      shell.connectionPreview.hidden = false;
    }

    function hideConnection() {
      shell.connectionPreview.hidden = true;
      shell.connectionPreview.removeAttribute("d");
    }

    function setPreviewTransform(keys, dx, dy) {
      const keySet = new Set(keys || []);
      nodeElements.forEach((element, key) => {
        element.style.transform = keySet.has(key)
          ? `translate(${dx}px, ${dy}px)`
          : "";
      });
    }

    function setEdgeElementPath(group, path) {
      if (!group) return;
      Array.from(group.children || []).forEach((element) => {
        if (typeof element.setAttribute === "function") {
          element.setAttribute("d", path);
        }
      });
    }

    function canonicalEdgePath(edge) {
      const source = model?.nodeByKey.get(edge.sourceKey);
      const target = model?.nodeByKey.get(edge.targetKey);
      return source && target ? edgePath(edge, source, target) : "";
    }

    function applyNodeMovePreview() {
      movePreviewFrame = 0;
      if (!movePreview || !model) return;
      const nextKeys = new Set(movePreview.keys);
      const affectedNodeKeys = new Set([...previewNodeKeys, ...nextKeys]);
      affectedNodeKeys.forEach((key) => {
        const element = nodeElements.get(key);
        if (!element) return;
        element.style.transform = nextKeys.has(key)
          ? `translate(${movePreview.dx}px, ${movePreview.dy}px)`
          : "";
      });
      const affectedEdgeKeys = new Set();
      affectedNodeKeys.forEach((nodeKey) => {
        incidentEdgeKeysByNode.get(nodeKey)?.forEach((edgeKey) => {
          affectedEdgeKeys.add(edgeKey);
        });
      });
      affectedEdgeKeys.forEach((edgeKey) => {
        const edge = edgeModelsByKey.get(edgeKey);
        if (!edge) return;
        const source = model.nodeByKey.get(edge.sourceKey);
        const target = model.nodeByKey.get(edge.targetKey);
        if (!source || !target) return;
        const moving = nextKeys.has(edge.sourceKey) || nextKeys.has(edge.targetKey);
        const path = moving
          ? previewEdgePath(
            edge,
            source,
            target,
            nextKeys,
            movePreview.dx,
            movePreview.dy
          )
          : edgePath(edge, source, target);
        setEdgeElementPath(edgeElements.get(edge.key), path);
      });
      previewNodeKeys = nextKeys;
    }

    function setNodeMovePreview(keys, dx, dy) {
      movePreview = {
        keys: Array.from(new Set(keys || [])),
        dx: Number(dx) || 0,
        dy: Number(dy) || 0
      };
      if (movePreviewFrame) return;
      movePreviewFrame = requestFrame(applyNodeMovePreview);
    }

    function clearNodeMovePreview() {
      cancelMovePreviewFrame();
      movePreview = null;
      nodeElements.forEach((element) => {
        element.style.transform = "";
      });
      if (model) {
        model.edges.forEach((edge) => {
          const path = canonicalEdgePath(edge);
          if (path) setEdgeElementPath(edgeElements.get(edge.key), path);
        });
      }
      previewNodeKeys = new Set();
    }

    function showSelectionBox(start, current) {
      const box = shell.selectionBox;
      if (!box || !start || !current) return;
      const left = Math.min(start.x, current.x);
      const top = Math.min(start.y, current.y);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(current.x - start.x)}px`;
      box.style.height = `${Math.abs(current.y - start.y)}px`;
      box.hidden = false;
    }

    function hideSelectionBox() {
      if (!shell.selectionBox) return;
      shell.selectionBox.hidden = true;
      shell.selectionBox.style.width = "0px";
      shell.selectionBox.style.height = "0px";
    }

    function setNotePreview(noteId, values = {}) {
      const note = noteElements.get(String(noteId || ""));
      if (!note) return;
      if (Number.isFinite(values.dx) || Number.isFinite(values.dy)) {
        note.style.transform =
          `translate(${Number(values.dx) || 0}px, ${Number(values.dy) || 0}px)`;
      }
      if (Number.isFinite(values.width)) note.style.width = `${values.width}px`;
      if (Number.isFinite(values.height)) note.style.height = `${values.height}px`;
    }

    function clearPreviews() {
      clearNodeMovePreview();
      noteElements.forEach((element) => {
        element.style.transform = "";
      });
      hideConnection();
      hideSelectionBox();
    }

    function destroy() {
      cancelMovePreviewFrame();
      feedback.destroy();
      shell.rootElement.innerHTML = "";
      model = null;
      nodeElements.clear();
      edgeElements.clear();
      edgeModelsByKey.clear();
      incidentEdgeKeysByNode.clear();
      noteElements.clear();
    }

    return Object.freeze({
      renderDocument,
      applySelection,
      applyStatus,
      applyViewport,
      applyAnnotationMode,
      showConnection,
      hideConnection,
      setPreviewTransform,
      setNodeMovePreview,
      showSelectionBox,
      hideSelectionBox,
      setNotePreview,
      clearPreviews,
      showMessage: feedback.showMessage,
      showContextMenu: feedback.showContextMenu,
      hideContextMenu: feedback.hideContextMenu,
      getNodeElement: (key) => nodeElements.get(key) || null,
      getNoteElement: (id) => noteElements.get(id) || null,
      getModel: () => model,
      destroy
    });
  }

  modules.workflowRoundedOrthogonalPath = roundedOrthogonalPath;
  modules.workflowPreviewEdgePath = previewEdgePath;
  modules.createWorkflowRenderer = createRenderer;
})(window);
