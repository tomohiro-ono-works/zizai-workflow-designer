(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};
  const DRAG_THRESHOLD = 5;

  function createInteraction(shell, renderer, controller) {
    const noteEditor = modules.createWorkflowNoteEditor(renderer, controller);
    const selection = modules.createWorkflowSelectionController(controller);
    const commandInteraction = modules.createWorkflowCommandInteraction(
      shell,
      renderer,
      controller,
      selection
    );
    const cleanup = [];
    let gesture = null;
    let suppressClick = false;
    let suppressContextMenu = false;

    function listen(target, eventName, handler, options) {
      target.addEventListener(eventName, handler, options);
      cleanup.push(() => target.removeEventListener(eventName, handler, options));
    }

    function clientPoint(event) {
      const rect = shell.viewport.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function worldPoint(event) {
      const point = clientPoint(event);
      const viewport = controller.getViewport();
      return {
        x: (point.x - viewport.x) / viewport.zoom,
        y: (point.y - viewport.y) / viewport.zoom
      };
    }

    function reachedThreshold(start, current) {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      return Math.hypot(dx, dy) >= DRAG_THRESHOLD;
    }

    function nodeFromElement(element) {
      return element
        ? renderer.getModel()?.nodeByKey.get(element.dataset.nodeKey) || null
        : null;
    }

    function noteFromElement(element) {
      return element
        ? renderer.getModel()?.notes.find(
          (item) => item.noteId === element.dataset.noteId
        ) || null
        : null;
    }

    function edgeFromElement(element) {
      const key = element?.dataset?.edgeKey;
      return key
        ? renderer.getModel()?.edges.find((item) => item.key === key) || null
        : null;
    }

    function selectedNodeKeys() {
      return new Set(controller.getSelection().nodes.map(modules.nodeRefKey));
    }

    function beginNodeMove(event, node) {
      const current = controller.getSelection();
      const selected = new Set(current.nodes.map(modules.nodeRefKey));
      const preserveGroup = current.nodes.length > 1 && selected.has(node.key);
      selection.selectNode(node, preserveGroup);
      if (controller.isReadonly()) return;

      const keys = selectedNodeKeys();
      const nodes = renderer.getModel().nodes.filter((item) => keys.has(item.key));
      gesture = {
        kind: "node-move",
        button: 0,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        startWorld: worldPoint(event),
        nodes,
        dx: 0,
        dy: 0,
        activated: false
      };
    }

    function beginNoteGesture(event, note, kind) {
      selection.selectNote(note.noteId, event.shiftKey);
      if (controller.isReadonly()) return;
      gesture = {
        kind,
        button: 0,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        startWorld: worldPoint(event),
        note,
        dx: 0,
        dy: 0,
        width: note.width,
        height: note.height,
        activated: false
      };
    }

    function beginLeftGesture(event, targets) {
      const model = renderer.getModel();
      const annotationMode = controller.getAnnotationMode();
      if (targets.noteElement) {
        if (!annotationMode) return;
        const note = noteFromElement(targets.noteElement);
        if (!note) return;
        if (event.target.closest("[data-note-resize]")) {
          beginNoteGesture(event, note, "note-resize");
        } else if (event.target.closest("[data-note-drag-handle]")) {
          beginNoteGesture(event, note, "note-drag");
        } else {
          selection.selectNote(note.noteId, event.shiftKey);
        }
        return;
      }
      // Annotation mode is note-edit only: nodes and edges are inert, while a
      // blank-canvas drag still pans the viewport.
      if (annotationMode && (targets.nodeElement || targets.edgeElement)) return;
      if (targets.nodeElement) {
        const node = nodeFromElement(targets.nodeElement);
        if (!node) return;
        const selectedPort = String(
          targets.portElement?.dataset?.zwdPortRole || ""
        );
        if (selectedPort) {
          if (["in", "enter", "return"].includes(selectedPort) || controller.isReadonly()) return;
          const connectionPort = node.nodeType === "loop"
            ? (selectedPort === "loop" ? "loop" : "done")
            : "out";
          gesture = {
            kind: "connect",
            button: 0,
            pointerId: event.pointerId,
            startClient: clientPoint(event),
            startWorld: worldPoint(event),
            source: { ...node, connectionPort },
            point: worldPoint(event),
            activated: false
          };
          return;
        }
        beginNodeMove(event, node);
        return;
      }
      if (targets.edgeElement) return;
      if (!model) return;
      gesture = {
        kind: "pan",
        button: 0,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        viewport: controller.getViewport(),
        activated: false
      };
    }

    function beginRightGesture(event, targets) {
      suppressContextMenu = false;
      if (controller.getAnnotationMode()) {
        // Note-edit only: no connection gesture and no node box selection.
        gesture = {
          kind: "right-noop",
          button: 2,
          pointerId: event.pointerId,
          startClient: clientPoint(event),
          activated: false
        };
        return;
      }
      if (targets.nodeElement) {
        const node = nodeFromElement(targets.nodeElement);
        if (!node) return;
        if (controller.isReadonly()) return;
        const selectedPort = String(
          targets.portElement?.dataset?.zwdPortRole || ""
        );
        if (["in", "enter", "return"].includes(selectedPort)) {
          gesture = {
            kind: "right-noop",
            button: 2,
            pointerId: event.pointerId,
            startClient: clientPoint(event),
            activated: false
          };
          return;
        }
        const connectionPort = node.nodeType === "loop"
          ? (selectedPort === "loop" ? "loop" : "done")
          : "out";
        const current = controller.getSelection();
        const selected = new Set(current.nodes.map(modules.nodeRefKey));
        const multipleSelected = current.nodes.length > 1 && selected.has(node.key);
        gesture = {
          kind: multipleSelected ? "right-noop" : "right-connect",
          button: 2,
          pointerId: event.pointerId,
          startClient: clientPoint(event),
          startWorld: worldPoint(event),
          source: { ...node, connectionPort },
          point: worldPoint(event),
          activated: false
        };
        return;
      }
      if (targets.edgeElement || targets.noteElement) {
        gesture = {
          kind: "right-noop",
          button: 2,
          pointerId: event.pointerId,
          startClient: clientPoint(event),
          activated: false
        };
        return;
      }
      gesture = {
        kind: "box-select",
        button: 2,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        startWorld: worldPoint(event),
        currentWorld: worldPoint(event),
        toggle: !!(event.ctrlKey || event.metaKey),
        activated: false
      };
    }

    function onPointerDown(event) {
      if (event.button !== 0 && event.button !== 2) return;
      renderer.hideContextMenu();
      const targets = {
        nodeElement: event.target.closest("[data-node-key]"),
        noteElement: event.target.closest("[data-note-id]"),
        edgeElement: event.target.closest("[data-edge-key]"),
        portElement: event.target.closest("[data-zwd-port-role]")
      };

      if (event.button === 0) beginLeftGesture(event, targets);
      else beginRightGesture(event, targets);

      if (gesture) {
        shell.viewport.setPointerCapture(event.pointerId);
        if (event.button === 0) event.preventDefault();
      }
    }

    function activateGesture(event) {
      if (gesture.activated) return true;
      const current = clientPoint(event);
      if (!reachedThreshold(gesture.startClient, current)) return false;
      gesture.activated = true;
      if (gesture.button === 0) suppressClick = true;
      if (gesture.button === 2) suppressContextMenu = true;
      return true;
    }

    function onPointerMove(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (!activateGesture(event)) return;
      if (gesture.button === 2) event.preventDefault();

      if (gesture.kind === "pan") {
        const point = clientPoint(event);
        controller.changeViewport({
          ...gesture.viewport,
          x: gesture.viewport.x + point.x - gesture.startClient.x,
          y: gesture.viewport.y + point.y - gesture.startClient.y
        });
        return;
      }

      if (gesture.kind === "right-noop") return;
      const point = worldPoint(event);
      const rawDx = point.x - gesture.startWorld.x;
      const rawDy = point.y - gesture.startWorld.y;

      if (gesture.kind === "node-move") {
        const snapped = controller.snapNodeDelta({ x: rawDx, y: rawDy });
        if (gesture.dx === snapped.x && gesture.dy === snapped.y) return;
        gesture.dx = snapped.x;
        gesture.dy = snapped.y;
        renderer.setNodeMovePreview(
          gesture.nodes.map((node) => node.key),
          gesture.dx,
          gesture.dy
        );
      } else if (gesture.kind === "right-connect" || gesture.kind === "connect") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        gesture.point = point;
        renderer.showConnection(
          gesture.source.key,
          point,
          gesture.source.connectionPort
        );
      } else if (gesture.kind === "box-select") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        gesture.currentWorld = point;
        renderer.showSelectionBox(gesture.startClient, clientPoint(event));
      } else if (gesture.kind === "note-drag") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        renderer.setNotePreview(gesture.note.noteId, {
          dx: gesture.dx,
          dy: gesture.dy
        });
      } else if (gesture.kind === "note-resize") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        gesture.width = Math.max(160, gesture.note.width + gesture.dx);
        gesture.height = Math.max(96, gesture.note.height + gesture.dy);
        renderer.setNotePreview(gesture.note.noteId, {
          width: gesture.width,
          height: gesture.height
        });
      }
    }

    function positionOperation(path, value) {
      const current = modules.getDocumentPathValue(controller.getDocument(), path);
      return {
        op: current.exists ? "replace" : "add",
        path: modules.cloneValue(path),
        value
      };
    }

    function finishConnect(event, current) {
      if (controller.isReadonly()) return;
      const snapped = controller.findConnectionTarget(
        clientPoint(event),
        current.source
      );
      if (snapped) {
        controller.requestConnect(current.source, snapped);
        return;
      }
      const targetElement = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-node-key]");
      const target = nodeFromElement(targetElement);
      if (target) {
        controller.requestConnect(current.source, target);
        return;
      }
      const edgeElement = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-edge-key]");
      const edge = edgeFromElement(edgeElement);
      const drop = {
        kind: edge ? "edge" : "canvas",
        position: worldPoint(event)
      };
      if (edge) drop.edge_ref = modules.cloneValue(edge.ref);
      controller.requestConnectDrop(current.source, drop);
    }

    function rectangleNodes(current) {
      const left = Math.min(current.startWorld.x, current.currentWorld.x);
      const right = Math.max(current.startWorld.x, current.currentWorld.x);
      const top = Math.min(current.startWorld.y, current.currentWorld.y);
      const bottom = Math.max(current.startWorld.y, current.currentWorld.y);
      return renderer.getModel().nodes.filter((node) => (
        node.x <= right &&
        node.x + node.width >= left &&
        node.y <= bottom &&
        node.y + node.height >= top
      ));
    }

    function onPointerUp(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const current = gesture;
      gesture = null;
      renderer.clearPreviews();
      if (!current.activated) return;

      if (current.kind === "node-move" && (current.dx || current.dy)) {
        controller.commit(current.nodes.map((node) => positionOperation(
          node.documentPath,
          controller.snapNodePosition({
            x: node.x + current.dx,
            y: node.y + current.dy
          })
        )), "node.move");
      } else if (current.kind === "note-drag" && (current.dx || current.dy)) {
        controller.commit([positionOperation(current.note.positionPath, {
          x: Math.round(current.note.x + current.dx),
          y: Math.round(current.note.y + current.dy)
        })], "annotation.move");
      } else if (current.kind === "note-resize" && (current.dx || current.dy)) {
        controller.commit([positionOperation(current.note.sizePath, {
          width: Math.round(current.width),
          height: Math.round(current.height)
        })], "annotation.resize");
      } else if (current.kind === "right-connect" || current.kind === "connect") {
        if (current.kind === "connect") suppressClick = false;
        finishConnect(event, current);
      } else if (current.kind === "box-select") {
        selection.selectNodes(rectangleNodes(current), current.toggle);
      }
    }

    function onPointerCancel(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (gesture.button === 2 && gesture.activated) suppressContextMenu = true;
      gesture = null;
      renderer.clearPreviews();
      suppressClick = true;
    }

    function onContextMenuCapture(event) {
      if (!suppressContextMenu) return;
      suppressContextMenu = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function onClick(event) {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const command = event.target.closest("[data-zwd-command]")?.dataset.zwdCommand;
      if (command) {
        controller.executeCommand(command, null, worldPoint(event));
        return;
      }
      const contextItem = event.target.closest("[data-context-command]");
      if (contextItem) {
        renderer.hideContextMenu();
        controller.executeCommand(
          contextItem.dataset.contextCommand,
          commandInteraction.getContextTarget(),
          worldPoint(event),
          contextItem.dataset.contextValue
        );
        return;
      }
      const external = event.target.closest("[data-external-url]")?.dataset.externalUrl;
      if (external) {
        event.preventDefault();
        // Annotation mode is note-edit only, so note editing takes priority
        // over following a link.
        if (controller.getAnnotationMode()) return;
        controller.emit("external-link:open-request", { url: external });
      }
    }

    function onDoubleClick(event) {
      const body = event.target.closest("[data-note-body]");
      if (body) noteEditor.begin(body.dataset.noteBody, body);
    }

    function onChange(event) {
      const input = event.target.closest("[data-note-color]");
      if (input) noteEditor.setColor(input.dataset.noteColor, input.value);
    }

    listen(shell.viewport, "pointerdown", onPointerDown);
    listen(shell.viewport, "pointermove", onPointerMove);
    listen(shell.viewport, "pointerup", onPointerUp);
    listen(shell.viewport, "pointercancel", onPointerCancel);
    listen(shell.shell, "contextmenu", onContextMenuCapture, true);
    listen(shell.shell, "click", onClick);
    listen(shell.shell, "dblclick", onDoubleClick);
    listen(shell.shell, "change", onChange);
    return Object.freeze({
      destroy() {
        gesture = null;
        noteEditor.close();
        commandInteraction.destroy();
        cleanup.splice(0).forEach((remove) => remove());
      }
    });
  }

  modules.createWorkflowInteraction = createInteraction;
})(window);
