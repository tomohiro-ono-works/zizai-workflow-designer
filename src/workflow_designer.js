(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function normalizeRenderers(value) {
    if (!value) return {};
    if (Array.isArray(value)) {
      return Object.fromEntries(value
        .filter((item) => item && (
          typeof item.render === "function" ||
          typeof item.renderIcon === "function"
        ))
        .map((item) => [String(item.type || "default"), item]));
    }
    if (typeof value !== "object") {
      throw new TypeError("nodeRenderers must be an object or array");
    }
    return { ...value };
  }

  function normalizeTheme(value) {
    const theme = value && typeof value === "object" ? value : {};
    return Object.fromEntries(Object.entries(theme)
      .filter(([key, item]) => (
        String(key).startsWith("--zwd-") &&
        ["string", "number"].includes(typeof item)
      )));
  }

  function normalizeGraphMode(value) {
    return String(value || "").trim().toLowerCase() === "dag"
      ? "dag"
      : "graph";
  }

  function createWorkflowDesigner(options = {}) {
    const rootElement = options.root;
    if (!(rootElement instanceof HTMLElement)) {
      throw new TypeError("createWorkflowDesigner requires an HTMLElement root");
    }

    let documentSnapshot = modules.cloneValue(options.document || {
      metadata: {},
      steps: [],
      flows: {},
      notes: []
    });
    modules.assertWorkflowDocument(documentSnapshot);
    let selection = modules.normalizeSelection(options.selection);
    let viewport = modules.normalizeViewport(options.viewport);
    let status = modules.normalizeStatus(options.status);
    let readonly = !!options.readonly;
    let nodeRenderers = normalizeRenderers(options.nodeRenderers);
    let mounted = false;
    let shell = null;
    let renderer = null;
    let interaction = null;
    let transactionSequence = 0;
    const emitter = modules.createEmitter();
    const idManager = modules.createWorkflowIdManager(
      options.idAllocator,
      documentSnapshot
    );
    const commandLabels = options.commandLabels || {};
    const graphMode = normalizeGraphMode(options.graphMode);
    const nodeGrid = modules.normalizeWorkflowGrid(options.nodeGrid);
    const connectionSnapDistance = Math.max(
      0,
      modules.asFiniteNumber(options.connectionSnapDistance, 0)
    );
    const graphConstraints = typeof options.graphConstraints === "function"
      ? options.graphConstraints
      : null;

    function cycleValidationKey(scope, nodeId) {
      const id = String(nodeId || "");
      if (scope?.kind === "flow" && ["START", "END"].includes(id)) {
        return `flow:${scope.id}:node:${id}`;
      }
      if (scope?.kind === "loop" && ["START", "END"].includes(id)) {
        return String(scope.id);
      }
      if (scope?.kind === "unassigned" && id === "START") {
        return "unassigned:node:START";
      }
      return id;
    }

    function effectiveStatus() {
      const merged = modules.normalizeStatus(status);
      if (graphMode !== "dag" ||
          typeof modules.findWorkflowGraphCycles !== "function") {
        return merged;
      }
      const validation = modules.cloneValue(merged.validation || {});
      modules.findWorkflowGraphCycles(documentSnapshot).forEach((cycle) => {
        (Array.isArray(cycle?.nodeIds) ? cycle.nodeIds : []).forEach((nodeId) => {
          const key = cycleValidationKey(cycle.scope, nodeId);
          if (!key) return;
          const entries = validation[key] || [];
          const message = String(
            cycle?.message || "循環する接続が含まれています。"
          );
          if (!entries.some((entry) => (
            entry.level === "error" && entry.message === message
          ))) {
            entries.push({ level: "error", message });
          }
          validation[key] = entries;
        });
      });
      return modules.normalizeStatus({
        nodeStatus: merged.nodeStatus,
        validation
      });
    }

    function renderDocument() {
      if (!mounted) return;
      const model = modules.buildWorkflowGraphModel(documentSnapshot);
      renderer.renderDocument(model, {
        nodeRenderers,
        readonly,
        selection,
        status: effectiveStatus()
      });
      renderer.applyViewport(viewport);
    }

    function transactionId() {
      transactionSequence += 1;
      return `zwdtx_${Date.now()}_${transactionSequence}`;
    }

    function commit(patch, reason) {
      if (readonly) return null;
      if (!Array.isArray(patch) || !patch.length) return null;
      const checked = modules.applyDocumentPatchWithInverse(
        documentSnapshot,
        patch
      );
      const payload = {
        patch: modules.cloneValue(patch),
        inversePatch: checked.inversePatch,
        reason: String(reason || "document.edit"),
        transactionId: transactionId()
      };
      emitter.emit("document:change", payload);
      return modules.cloneValue(payload);
    }

    function selectFromUi(value, reason) {
      const next = modules.normalizeSelection(value);
      if (modules.sameValue(selection, next)) return;
      selection = next;
      renderer?.applySelection(selection);
      emitter.emit("selection:change", {
        selection: modules.cloneValue(selection),
        reason: String(reason || "ui")
      });
    }

    function changeViewportFromUi(value) {
      const next = modules.normalizeViewport(value);
      if (modules.sameValue(viewport, next)) return;
      viewport = next;
      renderer?.applyViewport(viewport);
      emitter.emit("viewport:change", {
        viewport: modules.cloneValue(viewport)
      });
    }

    function zoomBy(factor) {
      if (!mounted) return;
      const rect = shell.viewport.getBoundingClientRect();
      const nextZoom = Math.min(
        2.5,
        Math.max(0.25, viewport.zoom * factor)
      );
      const center = { x: rect.width / 2, y: rect.height / 2 };
      const worldX = (center.x - viewport.x) / viewport.zoom;
      const worldY = (center.y - viewport.y) / viewport.zoom;
      changeViewportFromUi({
        x: center.x - worldX * nextZoom,
        y: center.y - worldY * nextZoom,
        zoom: nextZoom
      });
    }

    function addNote(point) {
      if (readonly) return null;
      const noteId = idManager.allocate("note", 1, documentSnapshot)[0];
      const tokenColor = window.getComputedStyle(rootElement)
        .getPropertyValue("--surface-hover")
        .trim();
      const location = modules.normalizePosition(point, {
        x: 320,
        y: 240
      });
      const note = {
        note_id: noteId,
        ui_position: {
          x: Math.round(location.x),
          y: Math.round(location.y)
        },
        size: { width: 240, height: 144 },
        text: "",
        color: String(options.noteColors?.[0] || tokenColor)
      };
      const notes = Array.isArray(documentSnapshot.notes)
        ? documentSnapshot.notes
        : null;
      const patch = notes
        ? [{ op: "add", path: ["notes", notes.length], value: note }]
        : [{ op: "add", path: ["notes"], value: [note] }];
      const result = commit(patch, "annotation.add");
      selectFromUi({
        nodes: [],
        edges: [],
        annotation_ids: [noteId]
      }, "annotation.add");
      return result;
    }

    function copy(value = selection) {
      return modules.copyWorkflowSelection(documentSnapshot, value);
    }

    function cloneFromFragment(fragment, mode) {
      if (readonly) return null;
      const result = modules.cloneWorkflowFragment(
        documentSnapshot,
        fragment,
        {
          mode,
          sourceDocument: fragment.source_document || documentSnapshot,
          idManager,
          referenceRewriter: options.referenceRewriter,
          offset: { x: 48, y: 48 },
          nodeGrid
        }
      );
      const patch = modules.diffWorkflowDocuments(
        documentSnapshot,
        result.document
      );
      const transaction = commit(
        patch,
        mode === "duplicate" ? "graph.duplicate" : "graph.paste"
      );
      selectFromUi(result.selection, mode);
      return {
        transaction,
        stepIdMap: Object.fromEntries(result.stepIdMap.entries()),
        flowIdMap: Object.fromEntries(result.flowIdMap.entries()),
        selection: modules.cloneValue(result.selection)
      };
    }

    function duplicate(value = selection) {
      const fragment = copy(value);
      const hasContent = fragment.steps.length || fragment.notes.length;
      if (!hasContent && fragment.kind !== "flow") return null;
      return cloneFromFragment(fragment, "duplicate");
    }

    function paste(fragment) {
      return cloneFromFragment(modules.cloneValue(fragment), "paste");
    }

    function validateConnection(source, target) {
      const standard = modules.validateWorkflowConnection(
        renderer?.getModel(),
        source,
        target,
        { graphMode }
      );
      if (!standard.allowed) return standard;

      const payload = {
        source_node_ref: modules.cloneValue(source.ref),
        target_node_ref: modules.cloneValue(target.ref)
      };
      if (source.connectionPort) {
        payload.source_port = String(source.connectionPort);
      }
      if (!graphConstraints) return { allowed: true, payload };

      const result = graphConstraints({
        operation: "connect",
        document: modules.cloneValue(documentSnapshot),
        sourceNodeRef: payload.source_node_ref,
        targetNodeRef: payload.target_node_ref
      });
      if (result && typeof result.then === "function") {
        throw new Error("graphConstraints must be synchronous");
      }
      if (result === false || result?.allowed === false) {
        return {
          allowed: false,
          message: String(result?.message || "This connection is not allowed.")
        };
      }
      return { allowed: true, payload };
    }

    function findConnectionTarget(point, source) {
      if (!renderer || connectionSnapDistance <= 0) return null;
      return modules.rankWorkflowConnectionTargets(
        renderer.getModel(),
        source,
        point,
        viewport,
        connectionSnapDistance,
        (target) => validateConnection(source, target).allowed
      )[0] || null;
    }

    function requestConnect(source, target) {
      const result = validateConnection(source, target);
      if (!result.allowed) {
        renderer?.showMessage(result.message, "error");
        return false;
      }
      emitter.emit("connect:create-request", result.payload);
      return true;
    }

    function currentNodeTarget(target) {
      if (target?.kind === "node") return target.node;
      const selected = selection.nodes[0];
      if (!selected) return null;
      return renderer?.getModel()?.nodes.find(
        (node) => modules.nodeRefKey(node.ref) === modules.nodeRefKey(selected)
      ) || null;
    }

    function targetSelection(target) {
      if (target?.kind === "selection") {
        return modules.cloneValue(target.selection || selection);
      }
      if (target?.kind === "node") {
        return {
          nodes: [modules.cloneValue(target.node.ref)],
          edges: [],
          annotation_ids: []
        };
      }
      if (target?.kind === "edge") {
        return {
          nodes: [],
          edges: [modules.cloneValue(target.edge.ref)],
          annotation_ids: []
        };
      }
      if (target?.kind === "note") {
        return {
          nodes: [],
          edges: [],
          annotation_ids: [String(target.noteId)]
        };
      }
      return modules.cloneValue(selection);
    }

    function executeCommand(commandId, target, point) {
      const command = String(commandId || "").trim();
      const editCommands = new Set([
        "node.add",
        "annotation.add",
        "selection.delete",
        "selection.duplicate",
        "selection.paste"
      ]);
      if (readonly && editCommands.has(command)) return;
      if (command === "viewport.zoom-in") zoomBy(1.15);
      else if (command === "viewport.zoom-out") zoomBy(1 / 1.15);
      else if (command === "node.add") {
        const location = modules.normalizePosition(target?.point || point, {
          x: 0,
          y: 0
        });
        const stepId = idManager.allocate("step", 1, documentSnapshot)[0];
        emitter.emit("node:add-request", {
          step_id: stepId,
          position: modules.snapWorkflowPosition(location, nodeGrid)
        });
      }
      else if (command === "annotation.add") addNote(point);
      else if (command === "workflow.run") {
        emitter.emit("run:request", { mode: "workflow" });
      }
      else if (command === "selection.duplicate") duplicate(targetSelection(target));
      else if (command === "selection.delete") {
        emitter.emit("delete:request", {
          selection: targetSelection(target)
        });
      } else if (command === "node.open") {
        const node = currentNodeTarget(target);
        if (node) {
          emitter.emit("node:open-detail", {
            node_ref: modules.cloneValue(node.ref)
          });
        }
      } else if (command === "node.run") {
        const node = currentNodeTarget(target);
        if (node) {
          emitter.emit("run:request", {
            node_ref: modules.cloneValue(node.ref),
            mode: node.ref.flow_id ? "flow" : "step"
          });
        }
      }
      let publicTarget = null;
      if (target?.kind === "node") {
        publicTarget = {
          kind: "node",
          node_ref: modules.cloneValue(target.node.ref)
        };
      } else if (target?.kind === "selection") {
        publicTarget = {
          kind: "selection",
          selection: targetSelection(target)
        };
      } else if (target?.kind === "edge") {
        publicTarget = {
          kind: "edge",
          edge_ref: modules.cloneValue(target.edge.ref)
        };
      } else if (target?.kind === "note") {
        publicTarget = {
          kind: "annotation",
          annotation_id: String(target.noteId)
        };
      } else if (target?.kind === "canvas") {
        publicTarget = { kind: "canvas" };
      }
      emitter.emit("command:execute", {
        commandId: command,
        target: publicTarget
      });
    }

    const controller = Object.freeze({
      getDocument: () => documentSnapshot,
      getSelection: () => selection,
      getViewport: () => viewport,
      getCommandLabels: () => commandLabels,
      isReadonly: () => readonly,
      snapNodePosition: (value) => modules.snapWorkflowPosition(value, nodeGrid),
      snapNodeDelta: (value) => modules.snapWorkflowDelta(value, nodeGrid),
      findConnectionTarget,
      select: selectFromUi,
      changeViewport: changeViewportFromUi,
      commit,
      emit: emitter.emit,
      addNote,
      duplicate,
      executeCommand,
      requestConnect,
      refresh: renderDocument
    });

    function mount() {
      if (mounted) return api;
      shell = modules.createWorkflowDesignerShell(rootElement, commandLabels);
      shell.shell.dataset.nodeGrid = nodeGrid.enabled ? "enabled" : "disabled";
      shell.shell.style.setProperty("--zwd-grid-size", `${nodeGrid.size}px`);
      Object.entries(normalizeTheme(options.theme)).forEach(([key, value]) => {
        shell.shell.style.setProperty(key, String(value));
      });
      renderer = modules.createWorkflowRenderer(shell);
      mounted = true;
      renderDocument();
      interaction = modules.createWorkflowInteraction(
        shell,
        renderer,
        controller
      );
      return api;
    }

    function destroy() {
      if (!mounted) return;
      interaction?.destroy();
      renderer?.destroy();
      emitter.clear();
      interaction = null;
      renderer = null;
      shell = null;
      mounted = false;
    }

    const api = Object.freeze({
      mount,
      destroy,
      setDocument(value) {
        modules.assertWorkflowDocument(value);
        documentSnapshot = modules.cloneValue(value);
        idManager.observe(documentSnapshot);
        renderDocument();
      },
      getDocument() {
        return modules.cloneValue(documentSnapshot);
      },
      updateDocument(patch) {
        documentSnapshot = modules.applyDocumentPatch(documentSnapshot, patch);
        idManager.observe(documentSnapshot);
        renderDocument();
        return modules.cloneValue(documentSnapshot);
      },
      setSelection(value) {
        selection = modules.normalizeSelection(value);
        renderer?.applySelection(selection);
      },
      getSelection() {
        return modules.cloneValue(selection);
      },
      setViewport(value) {
        viewport = modules.normalizeViewport(value);
        renderer?.applyViewport(viewport);
      },
      getViewport() {
        return modules.cloneValue(viewport);
      },
      setStatus(value) {
        status = modules.normalizeStatus(value);
        renderer?.applyStatus(effectiveStatus());
      },
      setReadonly(value) {
        readonly = !!value;
        renderDocument();
      },
      setNodeRenderers(value) {
        nodeRenderers = normalizeRenderers(value);
        renderDocument();
      },
      duplicate,
      copy,
      paste,
      on: emitter.on,
      off: emitter.off
    });
    return api;
  }

  packages.workflowDesigner = Object.freeze({
    createWorkflowDesigner,
    applyDocumentPatch: modules.applyDocumentPatch
  });
})(window);
