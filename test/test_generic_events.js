"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(String(name), String(value));
  }

  getPropertyValue(name) {
    return this.values.get(String(name)) || "";
  }
}

function dataKey(name) {
  return name.slice(5).replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

class FakeHTMLElement {
  constructor(tagName = "div") {
    this.tagName = String(tagName).toUpperCase();
    this.className = "";
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = new FakeStyle();
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.listeners = new Map();
    this._rect = { left: 0, top: 0, width: 900, height: 700 };
  }

  get firstChild() {
    return this.children[0] || null;
  }

  get childElementCount() {
    return this.children.length;
  }

  get innerHTML() {
    return "";
  }

  set innerHTML(_value) {
    this.children.forEach((child) => {
      child.parentNode = null;
    });
    this.children = [];
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    const text = String(value);
    this.attributes.set(name, text);
    if (name === "class") this.className = text;
    if (name === "id") this.id = text;
    if (name === "hidden") this.hidden = true;
    if (name.startsWith("data-")) this.dataset[dataKey(name)] = text;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "hidden") this.hidden = false;
    if (name.startsWith("data-")) delete this.dataset[dataKey(name)];
  }

  addEventListener(eventName, handler, options) {
    const handlers = this.listeners.get(eventName) || [];
    handlers.push({ handler, options });
    this.listeners.set(eventName, handlers);
  }

  removeEventListener(eventName, handler, options) {
    const handlers = this.listeners.get(eventName) || [];
    this.listeners.set(eventName, handlers.filter((item) => (
      item.handler !== handler || item.options !== options
    )));
  }

  dispatch(eventName, init = {}) {
    const event = {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      deltaY: 0,
      key: "",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      target: this,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.propagationStopped = true;
      },
      ...init
    };
    for (const { handler } of this.listeners.get(eventName) || []) {
      handler(event);
      if (event.propagationStopped) break;
    }
    return event;
  }

  matches(selector) {
    return String(selector).split(",").some((part) => this.#matchesOne(part.trim()));
  }

  #matchesOne(selector) {
    if (!selector) return false;
    if (selector.startsWith(".")) {
      return this.className.split(/\s+/).includes(selector.slice(1));
    }
    const attribute = selector.match(/^\[([^=\]]+)(?:=(?:"([^"]*)"|'([^']*)'))?\]$/);
    if (attribute) {
      const name = attribute[1];
      const expected = attribute[2] ?? attribute[3];
      const actual = this.getAttribute(name);
      return expected === undefined ? actual !== null : actual === expected;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentNode;
    }
    return null;
  }

  querySelector(selector) {
    const pending = [...this.children];
    while (pending.length) {
      const current = pending.shift();
      if (current.matches(selector)) return current;
      pending.push(...current.children);
    }
    return null;
  }

  querySelectorAll(selector) {
    const found = [];
    const pending = [...this.children];
    while (pending.length) {
      const current = pending.shift();
      if (current.matches(selector)) found.push(current);
      pending.push(...current.children);
    }
    return found;
  }

  getBoundingClientRect() {
    return { ...this._rect };
  }

  setPointerCapture() {}
}

class FakeSVGElement extends FakeHTMLElement {}

const fakeDocument = {
  body: new FakeHTMLElement("body"),
  hitTarget: null,
  createElement(tagName) {
    return new FakeHTMLElement(tagName);
  },
  createElementNS(_namespace, tagName) {
    return new FakeSVGElement(tagName);
  },
  createTextNode(value) {
    const node = new FakeHTMLElement("#text");
    node.textContent = String(value);
    return node;
  },
  elementFromPoint() {
    return this.hitTarget;
  }
};

const context = {
  window: {},
  document: fakeDocument,
  HTMLElement: FakeHTMLElement,
  SVGElement: FakeSVGElement,
  console,
  setTimeout,
  clearTimeout
};
Object.assign(context.window, {
  window: context.window,
  document: fakeDocument,
  HTMLElement: FakeHTMLElement,
  SVGElement: FakeSVGElement,
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) {
    callback();
    return 1;
  },
  cancelAnimationFrame() {},
  getComputedStyle(element) {
    return {
      getPropertyValue(name) {
        return element.style.getPropertyValue(name);
      }
    };
  }
});
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "..", "src", "workflow_designer.js"), "utf8"),
  context,
  { filename: "workflow_designer.js" }
);

const { createWorkflowDesigner } = context.window.zizPackages.workflowDesigner;
const plain = (value) => JSON.parse(JSON.stringify(value));

function workflowDocument() {
  return {
    steps: [
      {
        step_id: "loop-1",
        flow_id: "flow-1",
        node_type: "loop",
        label: "Loop",
        ui_position: { x: 180, y: 120 }
      },
      {
        step_id: "node-2",
        flow_id: "flow-1",
        node_type: "task",
        label: "Task",
        ui_position: { x: 440, y: 120 }
      }
    ],
    flows: {
      "flow-1": {
        start: { ui_position: { x: 20, y: 120 } },
        end: { ui_position: { x: 700, y: 120 } },
        edges: [
          { from: "START", to: "loop-1", order: 1 },
          { from: "loop-1", to: "node-2", order: 2, kind: "merge" },
          { from: "node-2", to: "END", order: 3 }
        ]
      }
    },
    loop: { flows: { "loop-1": { edges: [] } } },
    notes: []
  };
}

function mount(extra = {}) {
  fakeDocument.hitTarget = null;
  const root = new FakeHTMLElement("div");
  const designer = createWorkflowDesigner({
    root,
    document: workflowDocument(),
    viewport: { x: 0, y: 0, zoom: 1 },
    ...extra
  });
  designer.mount();
  return {
    root,
    designer,
    shell: root.querySelector("[data-workflow-designer]"),
    viewport: root.querySelector("[data-zwd-viewport]")
  };
}

function openContext(shell, target, point = { x: 320, y: 240 }) {
  shell.dispatch("contextmenu", {
    target,
    clientX: point.x,
    clientY: point.y
  });
  return shell.querySelectorAll("[data-context-command]");
}

function click(shell, target, point = { x: 320, y: 240 }) {
  shell.dispatch("click", {
    target,
    clientX: point.x,
    clientY: point.y
  });
}

function rightDrag(viewport, target, destination, hitTarget = null) {
  viewport.dispatch("pointerdown", {
    target,
    button: 2,
    pointerId: 7,
    clientX: 220,
    clientY: 160
  });
  viewport.dispatch("pointermove", {
    target: viewport,
    button: 2,
    pointerId: 7,
    clientX: destination.x,
    clientY: destination.y
  });
  fakeDocument.hitTarget = hitTarget;
  viewport.dispatch("pointerup", {
    target: viewport,
    button: 2,
    pointerId: 7,
    clientX: destination.x,
    clientY: destination.y
  });
}

const tests = {
  // Catches a context menu implementation that ignores host-supplied actions
  // or leaks/mutates its private graph model through the provider payload.
  "context-actions"() {
    let providerInput = null;
    const { designer, shell } = mount({
      contextActions(input) {
        providerInput = input;
        input.target.position.x = -999;
        return [{ commandId: "host.canvas-action", label: "Canvas action" }];
      }
    });
    const received = [];
    designer.on("command:execute", (payload) => received.push(payload));
    const actions = openContext(shell, shell.querySelector("[data-zwd-viewport]"), {
      x: 320,
      y: 240
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].textContent, "Canvas action");
    assert.deepEqual(plain(providerInput), {
      target: { kind: "canvas", position: { x: -999, y: 240 } },
      readonly: false
    });
    click(shell, actions[0], { x: 320, y: 240 });
    assert.deepEqual(plain(received), [{
      commandId: "host.canvas-action",
      target: { kind: "canvas", position: { x: 320, y: 240 } }
    }]);
    designer.destroy();
  },

  // Catches a provider exception that prevents the standard menu fallback.
  "context-actions-provider-throw"() {
    const { designer, shell } = mount({
      contextActions() {
        throw new Error("provider failure");
      }
    });
    const actions = openContext(shell, shell.querySelector("[data-zwd-viewport]"));
    assert.deepEqual(actions.map((action) => action.dataset.contextCommand), [
      "node.add",
      "workflow.run"
    ]);
    designer.destroy();
  },

  // Catches an asynchronous provider result that suppresses the standard
  // menu even though the context-actions contract is synchronous.
  "context-actions-provider-promise"() {
    const { designer, shell } = mount({
      contextActions: () => Promise.resolve([])
    });
    const actions = openContext(shell, shell.querySelector("[data-zwd-viewport]"));
    assert.deepEqual(actions.map((action) => action.dataset.contextCommand), [
      "node.add",
      "workflow.run"
    ]);
    designer.destroy();
  },

  // Catches a malformed provider result that suppresses the standard menu.
  "context-actions-provider-nonarray"() {
    const { designer, shell } = mount({
      contextActions: () => ({ commandId: "host.invalid", label: "Invalid" })
    });
    const actions = openContext(shell, shell.querySelector("[data-zwd-viewport]"));
    assert.deepEqual(actions.map((action) => action.dataset.contextCommand), [
      "node.add",
      "workflow.run"
    ]);
    designer.destroy();
  },

  // Characterizes the valid empty-list signal and readonly provider input.
  "context-actions-empty-readonly"() {
    let receivedReadonly = null;
    const { designer, shell } = mount({
      readonly: true,
      contextActions({ readonly }) {
        receivedReadonly = readonly;
        return [];
      }
    });
    assert.equal(
      openContext(shell, shell.querySelector("[data-zwd-viewport]")).length,
      0,
      "a valid empty action list must keep the context menu hidden"
    );
    assert.equal(receivedReadonly, true);
    designer.destroy();
  },

  // Catches loop insertion actions that are rendered but lose their supplied
  // command ID or public loop node reference before reaching the host.
  "loop-actions"() {
    const { designer, shell } = mount({
      contextActions({ target }) {
        if (target.kind !== "node" || target.node_ref.node_id !== "loop-1") return [];
        return [
          { commandId: "loop.add-inside", label: "Add inside" },
          { commandId: "loop.add-after", label: "Add after" }
        ];
      }
    });
    const received = [];
    designer.on("command:execute", (payload) => received.push(plain(payload)));
    const loop = shell.querySelector('[data-node-key="step:loop-1"]');
    let actions = openContext(shell, loop);
    click(shell, actions[0]);
    actions = openContext(shell, loop);
    click(shell, actions[1]);
    assert.deepEqual(received, [
      {
        commandId: "loop.add-inside",
        target: { kind: "node", node_ref: { node_id: "loop-1" } }
      },
      {
        commandId: "loop.add-after",
        target: { kind: "node", node_ref: { node_id: "loop-1" } }
      }
    ]);
    designer.destroy();
  },

  // Catches a merge-detach context action that cannot preserve the selected
  // public edge reference for host-owned relationship removal.
  "merge-detach"() {
    const { designer, shell } = mount({
      contextActions({ target }) {
        return target.kind === "edge"
          ? [{ commandId: "merge.detach", label: "Detach merge" }]
          : [];
      }
    });
    const received = [];
    designer.on("command:execute", (payload) => received.push(plain(payload)));
    const edge = shell.querySelector(
      '[data-edge-key="flow:flow-1:edge:loop-1:node-2"]'
    );
    const actions = openContext(shell, edge);
    click(shell, actions[0]);
    assert.deepEqual(received, [{
      commandId: "merge.detach",
      target: {
        kind: "edge",
        edge_ref: { flow_id: "flow-1", from: "loop-1", to: "node-2" }
      }
    }]);
    designer.destroy();
  },

  // Catches a connection gesture that silently disappears when its endpoint
  // is blank canvas or an edge instead of another node.
  "connection-drop"() {
    const { designer, shell, viewport } = mount();
    const received = [];
    const connected = [];
    designer.on("connect:drop-request", (payload) => received.push(plain(payload)));
    designer.on("connect:create-request", (payload) => connected.push(plain(payload)));
    const source = shell.querySelector('[data-node-key="step:loop-1"]');
    rightDrag(viewport, source, { x: 600, y: 360 });
    const edge = shell.querySelector(
      '[data-edge-key="flow:flow-1:edge:loop-1:node-2"]'
    );
    rightDrag(viewport, source, { x: 420, y: 260 }, edge);
    const standardSource = shell.querySelector('[data-node-key="step:node-2"]');
    rightDrag(viewport, standardSource, { x: 300, y: 220 }, source);
    assert.deepEqual(received, [
      {
        source_node_ref: { node_id: "loop-1" },
        source_port: "done",
        drop: { kind: "canvas", position: { x: 600, y: 360 } }
      },
      {
        source_node_ref: { node_id: "loop-1" },
        source_port: "done",
        drop: {
          kind: "edge",
          position: { x: 420, y: 260 },
          edge_ref: { flow_id: "flow-1", from: "loop-1", to: "node-2" }
        }
      }
    ]);
    assert.deepEqual(connected, [{
      source_node_ref: { node_id: "node-2" },
      target_node_ref: { node_id: "loop-1" },
      source_port: "out"
    }]);
    designer.destroy();
  },

  // Catches readonly node drags that still enter connection preview or emit
  // create/drop requests while preserving readonly selection and canvas pan.
  "readonly-connections"() {
    const { designer, shell, viewport } = mount({ readonly: true });
    const dropped = [];
    const connected = [];
    designer.on("connect:drop-request", (payload) => dropped.push(plain(payload)));
    designer.on("connect:create-request", (payload) => connected.push(plain(payload)));
    const source = shell.querySelector('[data-node-key="step:loop-1"]');
    const preview = shell.querySelector(".zwd-connection-preview");

    viewport.dispatch("pointerdown", {
      target: source,
      button: 2,
      pointerId: 21,
      clientX: 220,
      clientY: 160
    });
    viewport.dispatch("pointermove", {
      target: viewport,
      button: 2,
      pointerId: 21,
      clientX: 600,
      clientY: 360
    });
    assert.equal(preview.hidden, true, "readonly must not start connection preview");
    viewport.dispatch("pointerup", {
      target: viewport,
      button: 2,
      pointerId: 21,
      clientX: 600,
      clientY: 360
    });

    const edge = shell.querySelector(
      '[data-edge-key="flow:flow-1:edge:loop-1:node-2"]'
    );
    const target = shell.querySelector('[data-node-key="step:node-2"]');
    rightDrag(viewport, source, { x: 420, y: 260 }, edge);
    rightDrag(viewport, source, { x: 480, y: 220 }, target);
    assert.deepEqual(dropped, []);
    assert.deepEqual(connected, []);

    viewport.dispatch("pointerdown", {
      target: source,
      button: 0,
      pointerId: 22,
      clientX: 220,
      clientY: 160
    });
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [{ node_id: "loop-1" }],
      edges: [],
      annotation_ids: []
    });

    viewport.dispatch("pointerdown", {
      target: viewport,
      button: 0,
      pointerId: 23,
      clientX: 100,
      clientY: 100
    });
    viewport.dispatch("pointermove", {
      target: viewport,
      button: 0,
      pointerId: 23,
      clientX: 150,
      clientY: 130
    });
    viewport.dispatch("pointerup", {
      target: viewport,
      button: 0,
      pointerId: 23,
      clientX: 150,
      clientY: 130
    });
    assert.deepEqual(plain(designer.getViewport()), { x: 50, y: 30, zoom: 1 });
    designer.destroy();
  },

  // Catches a connection gesture that began while writable but still emits a
  // request after readonly is enabled before its node, edge, or canvas drop.
  "readonly-during-connection"() {
    const { designer, shell, viewport } = mount();
    const dropped = [];
    const connected = [];
    const preview = shell.querySelector(".zwd-connection-preview");
    designer.on("connect:drop-request", (payload) => dropped.push(plain(payload)));
    designer.on("connect:create-request", (payload) => connected.push(plain(payload)));

    function beginConnection(pointerId) {
      const source = shell.querySelector('[data-node-key="step:node-2"]');
      viewport.dispatch("pointerdown", {
        target: source,
        button: 2,
        pointerId,
        clientX: 480,
        clientY: 160
      });
      viewport.dispatch("pointermove", {
        target: viewport,
        button: 2,
        pointerId,
        clientX: 600,
        clientY: 360
      });
      assert.equal(preview.hidden, false, "preview must be visible before readonly");
    }

    const blockedDrops = [
      null,
      () => shell.querySelector('[data-edge-key="flow:flow-1:edge:loop-1:node-2"]'),
      () => shell.querySelector('[data-node-key="step:loop-1"]')
    ];
    blockedDrops.forEach((hitTarget, index) => {
      const pointerId = 31 + index;
      beginConnection(pointerId);
      designer.setReadonly(true);
      fakeDocument.hitTarget = typeof hitTarget === "function" ? hitTarget() : null;
      viewport.dispatch("pointerup", {
        target: viewport,
        button: 2,
        pointerId,
        clientX: 600,
        clientY: 360
      });
      assert.equal(preview.hidden, true, "pointerup must clear the connection preview");
      designer.setReadonly(false);
    });
    assert.deepEqual(dropped, []);
    assert.deepEqual(connected, []);

    beginConnection(34);
    designer.setReadonly(true);
    viewport.dispatch("pointercancel", {
      target: viewport,
      button: 2,
      pointerId: 34,
      clientX: 600,
      clientY: 360
    });
    assert.equal(preview.hidden, true, "pointercancel must clear the connection preview");
    designer.setReadonly(false);

    const source = shell.querySelector('[data-node-key="step:node-2"]');
    const target = shell.querySelector('[data-node-key="step:loop-1"]');
    rightDrag(viewport, source, { x: 300, y: 220 }, target);
    assert.deepEqual(connected, [{
      source_node_ref: { node_id: "node-2" },
      target_node_ref: { node_id: "loop-1" },
      source_port: "out"
    }]);
    designer.destroy();
  },

  // Characterizes the existing generic toolbar command contract. The host,
  // not the designer, continues to own history state and mutation.
  "history-toolbar"() {
    const { designer, shell } = mount();
    const received = [];
    designer.on("command:execute", (payload) => received.push(plain(payload)));
    click(shell, shell.querySelector('[data-zwd-command="history.undo"]'));
    click(shell, shell.querySelector('[data-zwd-command="history.redo"]'));
    assert.deepEqual(received, [
      { commandId: "history.undo", target: null },
      { commandId: "history.redo", target: null }
    ]);
    designer.destroy();
  },

  // Catches a primary blank-canvas click that still creates a note. Note
  // creation is only ever triggered by the "annotation.add" toolbar/context
  // command while annotation mode is ON; a blank-canvas click never adds one.
  "annotation-placement"() {
    const document = workflowDocument();
    document.notes = [{
      note_id: "note-1",
      ui_position: { x: 40, y: 60 },
      size: { width: 240, height: 144 },
      text: "Existing",
      color: "#fff2a8"
    }];
    const { designer, shell, viewport } = mount({
      document,
      annotationMode: true,
      viewport: { x: 10, y: 20, zoom: 2 }
    });
    const changes = [];
    const modeChanges = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    designer.on("annotation:mode-change", (payload) => modeChanges.push(plain(payload)));

    click(shell, shell.querySelector('[data-node-key="step:loop-1"]'));
    click(shell, shell.querySelector(
      '[data-edge-key="flow:flow-1:edge:loop-1:node-2"]'
    ));
    click(shell, shell.querySelector('[data-note-id="note-1"]'));
    assert.equal(changes.length, 0, "node, edge, and note clicks must not add a note");

    viewport.dispatch("pointerdown", {
      target: viewport,
      button: 0,
      pointerId: 9,
      clientX: 210,
      clientY: 220
    });
    viewport.dispatch("pointerup", {
      target: viewport,
      button: 0,
      pointerId: 9,
      clientX: 210,
      clientY: 220
    });
    click(shell, viewport, { x: 210, y: 220 });

    assert.equal(changes.length, 0, "a blank-canvas click must never add a note");

    const actions = openContext(shell, viewport, { x: 210, y: 220 });
    assert.deepEqual(actions.map((action) => action.dataset.contextCommand), [
      "annotation.add"
    ]);
    click(shell, actions[0], { x: 210, y: 220 });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "annotation.add");
    assert.deepEqual(changes[0].patch[0].path, ["notes", 1]);
    assert.ok(changes[0].patch[0].value.note_id);
    assert.deepEqual(changes[0].patch[0].value.ui_position, { x: 100, y: 100 });
    assert.match(changes[0].transactionId, /^zwdtx_/);
    assert.equal(designer.getAnnotationMode(), true);
    assert.deepEqual(plain(designer.getViewport()), { x: 10, y: 20, zoom: 2 });
    assert.deepEqual(modeChanges, []);
    designer.destroy();
  },

  // Characterizes annotation mode as note-edit only: primary clicks select
  // notes but never nodes or edges, and a blank-canvas click still never adds
  // an annotation.
  "annotation-primary-selection"() {
    const document = workflowDocument();
    document.notes = [{
      note_id: "note-1",
      ui_position: { x: 40, y: 60 },
      size: { width: 240, height: 144 },
      text: "Existing",
      color: "#fff2a8"
    }];
    const { designer, shell, viewport } = mount({ document, annotationMode: true });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));

    function primaryClick(target, pointerId, point) {
      viewport.dispatch("pointerdown", {
        target,
        button: 0,
        pointerId,
        clientX: point.x,
        clientY: point.y
      });
      viewport.dispatch("pointerup", {
        target,
        button: 0,
        pointerId,
        clientX: point.x,
        clientY: point.y
      });
      click(shell, target, point);
    }

    primaryClick(shell.querySelector('[data-node-key="step:loop-1"]'), 41, {
      x: 220,
      y: 160
    });
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [],
      edges: [],
      annotation_ids: []
    }, "a node click must not select while annotation mode is ON");

    primaryClick(shell.querySelector(
      '[data-edge-key="flow:flow-1:edge:loop-1:node-2"]'
    ), 42, { x: 420, y: 120 });
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [],
      edges: [],
      annotation_ids: []
    });

    primaryClick(shell.querySelector('[data-note-id="note-1"]'), 43, {
      x: 80,
      y: 100
    });
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [],
      edges: [],
      annotation_ids: ["note-1"]
    });
    assert.equal(changes.length, 0, "target clicks must not add annotations");

    primaryClick(viewport, 44, { x: 600, y: 360 });
    assert.equal(changes.length, 0, "blank click must never add an annotation");
    assert.equal(designer.getAnnotationMode(), true);
    designer.destroy();
  },

  // Catches annotation UI that has no public mode state, no host-observable
  // state transition, or no accessible pressed state on its toolbar toggle.
  "annotation-mode"() {
    const { designer, shell } = mount();
    assert.equal(typeof designer.setAnnotationMode, "function");
    assert.equal(typeof designer.getAnnotationMode, "function");
    const received = [];
    designer.on("annotation:mode-change", (payload) => received.push(plain(payload)));
    const toggle = shell.querySelector('[data-zwd-command="annotation.mode-toggle"]');
    assert.ok(toggle);
    click(shell, toggle);
    assert.equal(designer.getAnnotationMode(), true);
    assert.equal(shell.dataset.annotationMode, "active");
    assert.equal(toggle.getAttribute("aria-pressed"), "true");
    shell.dispatch("keydown", { target: shell, key: "Escape" });
    assert.equal(designer.getAnnotationMode(), false);
    assert.equal(shell.dataset.annotationMode, "inactive");
    assert.equal(toggle.getAttribute("aria-pressed"), "false");
    assert.deepEqual(received, [
      { active: true, reason: "toolbar" },
      { active: false, reason: "escape" }
    ]);
    designer.setAnnotationMode(true);
    assert.equal(designer.getAnnotationMode(), true);
    assert.equal(received.length, 2, "controlled setter must not echo a UI event");
    designer.destroy();
  }
};

const requested = process.argv[2];
if (requested) {
  if (!tests[requested]) throw new Error(`unknown test: ${requested}`);
  tests[requested]();
  console.log(`${requested} tests passed`);
} else {
  Object.entries(tests).forEach(([name, run]) => {
    run();
    console.log(`${name} tests passed`);
  });
}
