(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};
  const SVG_NS = "http://www.w3.org/2000/svg";

  function element(tagName, className, attributes = {}) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    Object.entries(attributes).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      node.setAttribute(name, String(value));
    });
    return node;
  }

  function svgElement(tagName, className, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tagName);
    if (className) node.setAttribute("class", className);
    Object.entries(attributes).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      node.setAttribute(name, String(value));
    });
    return node;
  }

  function toolbarButton(command, text, label) {
    const button = element("button", "zwd-tool", {
      type: "button",
      "data-zwd-command": command,
      "aria-label": label,
      title: label
    });
    button.textContent = text;
    return button;
  }

  function createShell(rootElement, commandLabels = {}) {
    if (!(rootElement instanceof HTMLElement)) {
      throw new TypeError("WorkflowDesigner root must be an HTMLElement");
    }
    rootElement.innerHTML = "";

    const shell = element("div", "zwd", {
      tabindex: "0",
      "data-workflow-designer": "",
      role: "application",
      "aria-label": commandLabels.designer || "Workflow designer"
    });
    shell.style.position = "relative";
    const toolbar = element("div", "zwd-toolbar", {
      role: "toolbar",
      "aria-label": commandLabels.canvasTools || "Workflow tools"
    });
    toolbar.style.position = "absolute";
    toolbar.style.top = "12px";
    toolbar.style.right = "12px";
    toolbar.style.zIndex = "30";
    toolbar.appendChild(toolbarButton(
      "viewport.zoom-in",
      "+",
      commandLabels.zoomIn || "Zoom in"
    ));
    toolbar.appendChild(toolbarButton(
      "viewport.zoom-out",
      "−",
      commandLabels.zoomOut || "Zoom out"
    ));
    toolbar.appendChild(toolbarButton(
      "history.redo",
      "↷",
      commandLabels.redo || "Redo"
    ));
    toolbar.appendChild(toolbarButton(
      "history.undo",
      "↶",
      commandLabels.undo || "Undo"
    ));
    toolbar.appendChild(toolbarButton(
      "annotation.add",
      "▤",
      commandLabels.addNote || "Add sticky note"
    ));
    toolbar.appendChild(toolbarButton(
      "workflow.run",
      "▶",
      commandLabels.runWorkflow || "Run workflow"
    ));

    const viewport = element("div", "zwd-viewport", {
      tabindex: "0",
      "data-zwd-viewport": ""
    });
    viewport.style.position = "relative";
    const world = element("div", "zwd-world", { "data-zwd-world": "" });
    const frameLayer = element("div", "zwd-layer zwd-layer--frames");
    const edges = svgElement("svg", "zwd-layer zwd-layer--edges", {
      "aria-hidden": "true",
      overflow: "visible"
    });
    const defs = svgElement("defs");
    const marker = svgElement("marker", "", {
      id: `zwd-arrow-${Math.random().toString(36).slice(2)}`,
      markerWidth: "8",
      markerHeight: "8",
      refX: "7",
      refY: "4",
      orient: "auto",
      markerUnits: "strokeWidth"
    });
    marker.appendChild(svgElement("path", "zwd-arrow", { d: "M0,0 L8,4 L0,8 Z" }));
    defs.appendChild(marker);
    edges.appendChild(defs);
    edges.dataset.markerId = marker.id;
    const edgeGroup = svgElement("g", "zwd-edge-group");
    const connectionPreview = svgElement("path", "zwd-connection-preview", {
      hidden: "hidden"
    });
    edges.appendChild(edgeGroup);
    edges.appendChild(connectionPreview);

    const nodeLayer = element("div", "zwd-layer zwd-layer--nodes");
    const noteLayer = element("div", "zwd-layer zwd-layer--notes");
    world.appendChild(frameLayer);
    world.appendChild(edges);
    world.appendChild(nodeLayer);
    world.appendChild(noteLayer);
    viewport.appendChild(world);

    const selectionBox = element("div", "zwd-selection-box", {
      hidden: "hidden",
      "aria-hidden": "true"
    });
    selectionBox.style.position = "absolute";
    selectionBox.style.pointerEvents = "none";
    selectionBox.style.border = "1px dashed currentColor";
    selectionBox.style.background = "rgba(64, 128, 255, 0.12)";
    viewport.appendChild(selectionBox);

    const menu = element("div", "zwd-context-menu", {
      role: "menu",
      hidden: "hidden"
    });
    const message = element("div", "zwd-message", {
      role: "status",
      "aria-live": "polite",
      hidden: "hidden"
    });

    shell.appendChild(toolbar);
    shell.appendChild(viewport);
    shell.appendChild(menu);
    shell.appendChild(message);
    rootElement.appendChild(shell);
    return {
      rootElement,
      shell,
      toolbar,
      viewport,
      world,
      frameLayer,
      edges,
      edgeGroup,
      connectionPreview,
      nodeLayer,
      noteLayer,
      selectionBox,
      menu,
      message
    };
  }

  function isDomElement(value) {
    if (!value || typeof value !== "object") return false;
    if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
      return true;
    }
    return typeof SVGElement !== "undefined" && value instanceof SVGElement;
  }

  function createDefaultNodeContent(node, iconElement = null) {
    const content = element("div", "zwd-node__content");

    if (node.kind === "step") {
      const visual = element("div", "zwd-node__visual");
      const icon = element("div", "zwd-node__icon", {
        hidden: iconElement ? null : "hidden",
        "aria-hidden": "true"
      });
      if (iconElement) icon.appendChild(iconElement);
      visual.appendChild(icon);

      const label = element("div", "zwd-node__label");
      label.textContent = String(node.label || node.ref?.node_id || "");

      const descriptionText = String(node.step?.description || "").trim();
      const description = element("div", "zwd-node__description", {
        hidden: descriptionText ? null : "hidden"
      });
      description.textContent = descriptionText;

      content.appendChild(visual);
      content.appendChild(label);
      content.appendChild(description);
      return content;
    }

    if (node.kind === "start" || node.kind === "end") {
      const visual = element("div", "zwd-node__visual", {
        "aria-hidden": "true"
      });
      const label = element("div", "zwd-node__label");
      label.textContent = String(node.label || node.ref?.node_id || "");
      content.appendChild(visual);
      content.appendChild(label);
      return content;
    }

    const label = element("div", "zwd-node__label");
    label.textContent = String(node.label || node.ref?.node_id || "");
    content.appendChild(label);
    return content;
  }


  function createNodePorts(node) {
    let definitions = [];
    if (node.kind === "step") {
      definitions = node.nodeType === "loop"
        ? [
            { role: "enter" },
            { role: "return" },
            { role: "done", label: "done" },
            { role: "loop", label: "loop" }
          ]
        : [{ role: "in" }, { role: "out" }];
    } else if (node.nodeType === "start") {
      definitions = [{ role: "out" }];
    } else if (node.nodeType === "end") {
      definitions = [{ role: "in" }];
    }
    if (!definitions.length) return null;

    const ports = element("div", "zwd-node__ports", {
      "aria-hidden": "true"
    });
    definitions.forEach(({ role, label: text }) => {
      const port = element(
        "span",
        `zwd-node__port zwd-node__port--${role}`,
        { "data-zwd-port-role": role }
      );
      if (text) {
        const label = element("span", "zwd-node__port-label");
        label.textContent = text;
        port.appendChild(label);
      }
      ports.appendChild(port);
    });
    return ports;
  }

  function createNodeElement(node, renderer, context) {
    const wrapper = element("div", `zwd-node zwd-node--${node.kind}`, {
      tabindex: "0",
      role: "button",
      "data-node-key": node.key,
      "data-node-id": node.ref.node_id,
      "data-node-type": node.nodeType,
      "data-readonly": context.readonly ? "true" : "false",
      "aria-label": String(node.label || node.ref.node_id)
    });
    wrapper.style.left = `${node.x}px`;
    wrapper.style.top = `${node.y}px`;
    wrapper.style.width = `${node.width}px`;
    wrapper.style.height = `${node.height}px`;

    let rendered = null;
    if (renderer && typeof renderer.render === "function") {
      rendered = renderer.render(node.step || node, context);
      if (!isDomElement(rendered)) {
        throw new TypeError("node renderer must return an HTMLElement or SVGElement");
      }
    }

    let icon = null;
    if (!rendered && renderer && typeof renderer.renderIcon === "function") {
      icon = renderer.renderIcon(node.step || node, context);
      if (icon !== null && icon !== undefined && !isDomElement(icon)) {
        throw new TypeError("node icon renderer must return an HTMLElement or SVGElement");
      }
    }
    wrapper.appendChild(rendered || createDefaultNodeContent(node, icon));
    const ports = createNodePorts(node);
    if (ports) wrapper.appendChild(ports);

    const status = element("span", "zwd-node__status", {
      hidden: "hidden",
      "aria-live": "polite"
    });
    const validation = element("span", "zwd-node__validation", {
      hidden: "hidden",
      "aria-label": "Validation"
    });
    validation.textContent = "!";
    wrapper.appendChild(status);
    wrapper.appendChild(validation);
    return wrapper;
  }

  function createLoopFrame(frame) {
    const wrapper = element("div", "zwd-loop-frame", {
      "data-loop-owner-id": frame.ownerId
    });
    wrapper.style.left = `${frame.x}px`;
    wrapper.style.top = `${frame.y}px`;
    wrapper.style.width = `${frame.width}px`;
    wrapper.style.height = `${frame.height}px`;
    const label = element("div", "zwd-loop-frame__label");
    label.textContent = String(frame.label || frame.ownerId);
    wrapper.appendChild(label);
    return wrapper;
  }

  modules.createWorkflowDesignerShell = createShell;
  modules.createWorkflowNodeElement = createNodeElement;
  modules.createWorkflowLoopFrame = createLoopFrame;
  modules.createWorkflowSvgElement = svgElement;
  modules.createWorkflowElement = element;
})(window);
