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

  focus() {}

  setSelectionRange() {}
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
const DEFAULT_NOTE_COLORS = ["#fff2a8", "#dff7e8", "#e7edff"];

function workflowDocument() {
  return {
    steps: [{
      step_id: "node-1",
      flow_id: "flow-1",
      node_type: "task",
      label: "Task",
      ui_position: { x: 180, y: 120 }
    }],
    flows: {
      "flow-1": {
        start: { ui_position: { x: 20, y: 120 } },
        end: { ui_position: { x: 500, y: 120 } },
        edges: [
          { from: "START", to: "node-1", order: 1 },
          { from: "node-1", to: "END", order: 2 }
        ]
      }
    },
    loop: { flows: {} },
    notes: [{
      note_id: "note-1",
      ui_position: { x: 40, y: 60 },
      size: { width: 240, height: 144 },
      text: "Existing",
      color: "#fff2a8"
    }]
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

function click(shell, target, point = { x: 320, y: 240 }) {
  shell.dispatch("click", {
    target,
    clientX: point.x,
    clientY: point.y
  });
}

function openContext(shell, target, point = { x: 320, y: 240 }) {
  shell.dispatch("contextmenu", {
    target,
    clientX: point.x,
    clientY: point.y
  });
  return shell.querySelectorAll("[data-context-command]");
}

function commandsOf(actions) {
  return actions.map((action) => action.dataset.contextCommand);
}

function primaryDrag(viewport, shell, target, pointerId, from, to) {
  viewport.dispatch("pointerdown", {
    target,
    button: 0,
    pointerId,
    clientX: from.x,
    clientY: from.y
  });
  viewport.dispatch("pointermove", {
    target: viewport,
    button: 0,
    pointerId,
    clientX: to.x,
    clientY: to.y
  });
  viewport.dispatch("pointerup", {
    target: viewport,
    button: 0,
    pointerId,
    clientX: to.x,
    clientY: to.y
  });
  click(shell, target, to);
}

const tests = {
  // Catches an implementation that defaults annotation mode to ON, exposing
  // note creation/editing before the host explicitly opts in.
  "defaults-off"() {
    const { designer, shell } = mount();
    assert.equal(designer.getAnnotationMode(), false);
    assert.equal(shell.dataset.annotationMode, "inactive");
    designer.destroy();
  },

  // Catches a mode toggle that leaves a previously selected node active.
  // Entering note-edit mode must publish the cleared node selection so a
  // host cannot keep showing node detail for an inert node.
  "toggling-on-clears-node-selection"() {
    const { designer, shell } = mount();
    const changes = [];
    const eventOrder = [];
    designer.setSelection({
      nodes: [{ node_id: "node-1" }],
      edges: [],
      annotation_ids: []
    });
    designer.on("annotation:mode-change", () => eventOrder.push("mode"));
    designer.on("selection:change", (payload) => {
      eventOrder.push("selection");
      changes.push(plain(payload));
    });
    click(shell, shell.querySelector('[data-zwd-command="annotation.mode-toggle"]'));
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [],
      edges: [],
      annotation_ids: []
    });
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0].selection, {
      nodes: [],
      edges: [],
      annotation_ids: []
    });
    assert.deepEqual(eventOrder, ["mode", "selection"]);
    designer.destroy();
  },

  // Catches a regression that lets a primary click on blank canvas create a
  // note while annotation mode is OFF, bypassing the toolbar button.
  "blank-click-never-creates-note-while-off"() {
    const { designer, shell, viewport } = mount();
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    primaryDrag(viewport, shell, viewport, 1, { x: 600, y: 400 }, { x: 600, y: 400 });
    assert.equal(changes.length, 0);
    designer.destroy();
  },

  // Catches a regression that still lets a primary click on blank canvas
  // create a note while annotation mode is ON; only the toolbar button may.
  "blank-click-never-creates-note-while-on"() {
    const { designer, shell, viewport } = mount({ annotationMode: true });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    primaryDrag(viewport, shell, viewport, 1, { x: 600, y: 400 }, { x: 600, y: 400 });
    assert.equal(changes.length, 0);
    designer.destroy();
  },

  // Catches a toolbar that still exposes note creation. Notes are created by
  // the annotation-mode right-click menu only; the mode toggle stays.
  "annotation-add-toolbar-button-removed"() {
    const { designer, shell } = mount({ annotationMode: true });
    assert.equal(
      shell.querySelector('[data-zwd-command="annotation.add"]'),
      null,
      "the annotation.add toolbar button must not be rendered"
    );
    assert.ok(
      shell.querySelector('[data-zwd-command="annotation.mode-toggle"]'),
      "the annotation mode toggle must stay on the toolbar"
    );
    designer.destroy();
  },

  // Catches a blank-canvas right-click menu that still offers note creation
  // while annotation mode is OFF, where note creation is forbidden.
  "canvas-context-menu-has-no-annotation-add-while-off"() {
    const { designer, shell, viewport } = mount();
    const actions = openContext(shell, viewport, { x: 600, y: 400 });
    assert.deepEqual(commandsOf(actions), ["node.add", "workflow.run"]);
    designer.destroy();
  },

  // Catches an annotation-mode blank-canvas menu that still mixes node
  // commands in, and a note created away from the right-click position.
  "canvas-context-menu-creates-note-at-click-while-on"() {
    const { designer, shell, viewport } = mount({
      annotationMode: true,
      viewport: { x: 10, y: 20, zoom: 2 }
    });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const actions = openContext(shell, viewport, { x: 320, y: 240 });
    assert.deepEqual(commandsOf(actions), ["annotation.add"]);
    click(shell, actions[0], { x: 880, y: 660 });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "annotation.add");
    assert.deepEqual(changes[0].patch[0].value.ui_position, { x: 155, y: 110 });
    designer.destroy();
  },

  // Catches a node right-click that still offers node commands while
  // annotation mode is ON, or that fails to create the note under the pointer.
  "node-context-menu-creates-note-at-click-while-on"() {
    const { designer, shell } = mount({ annotationMode: true });
    const changes = [];
    const commands = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    designer.on("command:execute", (payload) => commands.push(plain(payload)));
    const node = shell.querySelector('[data-node-key="step:node-1"]');
    const actions = openContext(shell, node, { x: 220, y: 160 });
    assert.deepEqual(commandsOf(actions), ["annotation.add"]);
    click(shell, actions[0], { x: 880, y: 660 });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "annotation.add");
    assert.deepEqual(changes[0].patch[0].value.ui_position, { x: 220, y: 160 });
    assert.deepEqual(
      commands.map((entry) => entry.commandId),
      ["annotation.add"]
    );
    designer.destroy();
  },

  // Catches a note right-click menu that offers anything other than the
  // configured colour palette, or a palette choice that fails to commit.
  "note-context-menu-shows-color-palette-while-on"() {
    const { designer, shell } = mount({ annotationMode: true });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const note = shell.querySelector('[data-note-id="note-1"]');
    const actions = openContext(shell, note, { x: 80, y: 100 });
    assert.deepEqual(
      commandsOf(actions),
      DEFAULT_NOTE_COLORS.map(() => "annotation.color")
    );
    assert.deepEqual(
      actions.map((action) => action.dataset.contextValue),
      DEFAULT_NOTE_COLORS
    );
    click(shell, actions[1], { x: 80, y: 120 });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "annotation.color");
    assert.deepEqual(changes[0].patch, [{
      op: "replace",
      path: ["notes", 0, "color"],
      value: DEFAULT_NOTE_COLORS[1]
    }]);
    designer.destroy();
  },

  // Catches a palette that ignores the host-configured noteColors option.
  "note-context-menu-uses-configured-colors"() {
    const noteColors = ["#111111", "#222222"];
    const { designer, shell } = mount({ annotationMode: true, noteColors });
    const note = shell.querySelector('[data-note-id="note-1"]');
    const actions = openContext(shell, note, { x: 80, y: 100 });
    assert.deepEqual(
      actions.map((action) => action.dataset.contextValue),
      noteColors
    );
    designer.destroy();
  },

  // Catches node selection, detail intent, or movement that still fires while
  // annotation mode is ON, where only note editing is allowed.
  "node-selection-detail-and-move-disabled-while-on"() {
    const { designer, shell, viewport } = mount({ annotationMode: true });
    const changes = [];
    const details = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    designer.on("node:open-detail", (payload) => details.push(plain(payload)));
    const node = shell.querySelector('[data-node-key="step:node-1"]');
    primaryDrag(viewport, shell, node, 7, { x: 220, y: 160 }, { x: 220, y: 160 });
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [],
      edges: [],
      annotation_ids: []
    });
    primaryDrag(viewport, shell, node, 8, { x: 220, y: 160 }, { x: 320, y: 260 });
    assert.equal(changes.length, 0, "a node must not move while ON");
    shell.dispatch("keydown", { target: shell, key: "Enter" });
    assert.equal(details.length, 0, "node detail must not open while ON");
    designer.destroy();
  },

  // Catches connection gestures that still start from a node port while
  // annotation mode is ON.
  "node-connections-disabled-while-on"() {
    const { designer, shell, viewport } = mount({ annotationMode: true });
    const requests = [];
    designer.on("connect:create-request", (payload) => requests.push(plain(payload)));
    designer.on("connect:drop-request", (payload) => requests.push(plain(payload)));
    const port = shell.querySelector('[data-zwd-port-role="out"]');
    primaryDrag(viewport, shell, port, 9, { x: 260, y: 160 }, { x: 480, y: 200 });
    viewport.dispatch("pointerdown", {
      target: port,
      button: 2,
      pointerId: 10,
      clientX: 260,
      clientY: 160
    });
    viewport.dispatch("pointermove", {
      target: viewport,
      button: 2,
      pointerId: 10,
      clientX: 480,
      clientY: 200
    });
    viewport.dispatch("pointerup", {
      target: viewport,
      button: 2,
      pointerId: 10,
      clientX: 480,
      clientY: 200
    });
    assert.deepEqual(requests, []);
    designer.destroy();
  },

  // Catches a right-drag box selection that still selects nodes while
  // annotation mode is ON.
  "box-selection-disabled-while-on"() {
    const { designer, shell, viewport } = mount({ annotationMode: true });
    viewport.dispatch("pointerdown", {
      target: viewport,
      button: 2,
      pointerId: 11,
      clientX: 0,
      clientY: 0
    });
    viewport.dispatch("pointermove", {
      target: viewport,
      button: 2,
      pointerId: 11,
      clientX: 700,
      clientY: 600
    });
    viewport.dispatch("pointerup", {
      target: viewport,
      button: 2,
      pointerId: 11,
      clientX: 700,
      clientY: 600
    });
    assert.deepEqual(plain(designer.getSelection()), {
      nodes: [],
      edges: [],
      annotation_ids: []
    });
    designer.destroy();
  },

  // Catches node-editing keyboard commands that still fire while annotation
  // mode is ON, and Delete-key note deletion that stops working.
  "keyboard-node-commands-disabled-while-on"() {
    const { designer, shell } = mount({ annotationMode: true });
    const changes = [];
    const requests = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    designer.on("delete:request", (payload) => requests.push(plain(payload)));
    designer.setSelection({
      nodes: [{ node_id: "node-1" }],
      edges: [],
      annotation_ids: ["note-1"]
    });
    shell.dispatch("keydown", { target: shell, key: "d", ctrlKey: true });
    shell.dispatch("keydown", { target: shell, key: "c", ctrlKey: true });
    shell.dispatch("keydown", { target: shell, key: "v", ctrlKey: true });
    assert.equal(changes.length, 0, "duplicate/copy/paste must not fire while ON");

    shell.dispatch("keydown", { target: shell, key: "Delete" });
    assert.equal(requests.length, 1, "Delete must still delete the selected note");
    assert.deepEqual(requests[0].selection, {
      nodes: [],
      edges: [],
      annotation_ids: ["note-1"]
    });
    designer.destroy();
  },

  // Catches note links that stop reaching the host while annotation mode is
  // OFF, or that are limited to a single URL scheme.
  "note-links-open-externally-while-off"() {
    const document = workflowDocument();
    document.notes[0].text = "see https://example.com/a and http://example.org/b";
    const { designer, shell } = mount({ document });
    const requests = [];
    designer.on("external-link:open-request", (payload) => requests.push(plain(payload)));
    const links = shell.querySelectorAll("[data-external-url]");
    assert.deepEqual(links.map((link) => link.dataset.externalUrl), [
      "https://example.com/a",
      "http://example.org/b"
    ]);
    links.forEach((link) => click(shell, link, { x: 80, y: 100 }));
    assert.deepEqual(requests, [
      { url: "https://example.com/a" },
      { url: "http://example.org/b" }
    ]);
    designer.destroy();
  },

  // Catches note links that still trigger external navigation while
  // annotation mode is ON, where note editing takes priority.
  "note-links-do-not-open-externally-while-on"() {
    const document = workflowDocument();
    document.notes[0].text = "see https://example.com/a and http://example.org/b";
    const { designer, shell } = mount({ document, annotationMode: true });
    const requests = [];
    designer.on("external-link:open-request", (payload) => requests.push(plain(payload)));
    shell.querySelectorAll("[data-external-url]").forEach((link) => {
      click(shell, link, { x: 80, y: 100 });
    });
    assert.deepEqual(requests, []);
    designer.destroy();
  },

  // Catches note drag/resize gestures that still activate while annotation
  // mode is OFF.
  "note-move-and-resize-disabled-while-off"() {
    const { designer, shell, viewport } = mount();
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const note = shell.querySelector('[data-note-id="note-1"]');
    const header = note.querySelector("[data-note-drag-handle]");
    primaryDrag(viewport, shell, header, 2, { x: 60, y: 70 }, { x: 160, y: 170 });
    const resize = note.querySelector("[data-note-resize]");
    primaryDrag(viewport, shell, resize, 3, { x: 280, y: 204 }, { x: 340, y: 260 });
    assert.equal(changes.length, 0);
    designer.destroy();
  },

  // Catches note drag/resize gestures that fail to activate while annotation
  // mode is ON.
  "note-move-and-resize-enabled-while-on"() {
    const { designer, shell, viewport } = mount({ annotationMode: true });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const note = shell.querySelector('[data-note-id="note-1"]');
    const header = note.querySelector("[data-note-drag-handle]");
    primaryDrag(viewport, shell, header, 2, { x: 60, y: 70 }, { x: 160, y: 170 });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "annotation.move");
    designer.destroy();
  },

  // Catches note text editing that still opens while annotation mode is OFF.
  "note-text-edit-disabled-while-off"() {
    const { designer, shell } = mount();
    const body = shell.querySelector('[data-note-body="note-1"]');
    shell.dispatch("dblclick", { target: body, clientX: 80, clientY: 100 });
    assert.equal(body.dataset.editing, undefined);
    designer.destroy();
  },

  // Catches note text editing that fails to open while annotation mode is ON.
  "note-text-edit-enabled-while-on"() {
    const { designer, shell } = mount({ annotationMode: true });
    const body = shell.querySelector('[data-note-body="note-1"]');
    shell.dispatch("dblclick", { target: body, clientX: 80, clientY: 100 });
    assert.equal(body.dataset.editing, "true");
    designer.destroy();
  },

  // Catches note color changes that still commit while annotation mode is OFF.
  "note-color-change-disabled-while-off"() {
    const { designer, shell } = mount();
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const input = shell.querySelector('[data-note-color="note-1"]');
    shell.dispatch("change", { target: input, ...{ }, });
    input.value = "#123456";
    shell.dispatch("change", { target: input });
    assert.equal(changes.length, 0);
    designer.destroy();
  },

  // Catches note color changes that fail to commit while annotation mode is ON.
  "note-color-change-enabled-while-on"() {
    const { designer, shell } = mount({ annotationMode: true });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const input = shell.querySelector('[data-note-color="note-1"]');
    input.value = "#123456";
    shell.dispatch("change", { target: input });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].reason, "annotation.color");
    designer.destroy();
  },

  // Catches a note context menu delete action that stays available while
  // annotation mode is OFF; a non-interactive note must not offer note
  // commands (it falls through to the blank-canvas menu instead).
  "note-delete-action-hidden-while-off"() {
    const { designer, shell } = mount();
    const note = shell.querySelector('[data-note-id="note-1"]');
    const actions = openContext(shell, note, { x: 80, y: 100 });
    assert.ok(
      !actions.some((action) => action.dataset.contextCommand === "selection.delete"),
      "a non-interactive note must not offer note deletion"
    );
    designer.destroy();
  },

  // Catches a note context menu that no longer offers the colour palette, or
  // that reintroduces node/selection commands, while annotation mode is ON.
  "note-context-menu-offers-colors-only-while-on"() {
    const { designer, shell } = mount({ annotationMode: true });
    const note = shell.querySelector('[data-note-id="note-1"]');
    const actions = openContext(shell, note, { x: 80, y: 100 });
    assert.ok(actions.length, "an interactive note must offer a context menu");
    assert.ok(
      actions.every((action) => action.dataset.contextCommand === "annotation.color"),
      "a note context menu must offer the colour palette only"
    );
    designer.destroy();
  },

  // Catches a toggle back to OFF that leaves note editing enabled.
  "toggling-off-again-disables-notes"() {
    const { designer, shell, viewport } = mount({ annotationMode: true });
    designer.setAnnotationMode(false);
    assert.equal(shell.dataset.annotationMode, "inactive");
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));
    const note = shell.querySelector('[data-note-id="note-1"]');
    primaryDrag(
      viewport,
      shell,
      note.querySelector("[data-note-drag-handle]"),
      5,
      { x: 60, y: 70 },
      { x: 160, y: 170 }
    );
    assert.equal(changes.length, 0);
    designer.destroy();
  },

  // Catches a note left selected while ON that can still be deleted through
  // the generic Delete-key/selection.delete command path after switching
  // OFF. Node deletion in the same selection must be unaffected.
  "stale-note-selection-not-deletable-via-delete-key-after-toggle-off"() {
    const { designer, shell } = mount({ annotationMode: true });
    designer.setSelection({
      nodes: [{ node_id: "node-1" }],
      edges: [],
      annotation_ids: ["note-1"]
    });
    designer.setAnnotationMode(false);
    const requests = [];
    designer.on("delete:request", (payload) => requests.push(plain(payload)));
    shell.dispatch("keydown", { target: shell, key: "Delete" });
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].selection.annotation_ids, []);
    assert.deepEqual(requests[0].selection.nodes, [{ node_id: "node-1" }]);
    designer.destroy();
  },

  // Catches the same stale-note leak through the "selection" context-menu
  // delete action (multi-node selection right-click), the other generic
  // deletion path besides the Delete key.
  "stale-note-selection-not-deletable-via-selection-context-menu-after-toggle-off"() {
    const document = workflowDocument();
    document.steps.push({
      step_id: "node-2",
      flow_id: "flow-1",
      node_type: "task",
      label: "Task 2",
      ui_position: { x: 340, y: 120 }
    });
    const { designer, shell } = mount({ document, annotationMode: true });
    designer.setSelection({
      nodes: [{ node_id: "node-1" }, { node_id: "node-2" }],
      edges: [],
      annotation_ids: ["note-1"]
    });
    designer.setAnnotationMode(false);
    const requests = [];
    designer.on("delete:request", (payload) => requests.push(plain(payload)));
    const actions = openContext(
      shell,
      shell.querySelector('[data-node-key="step:node-1"]'),
      { x: 220, y: 160 }
    );
    const deleteAction = actions.find(
      (action) => action.dataset.contextCommand === "selection.delete"
    );
    assert.ok(deleteAction, "a multi-node selection must still offer delete");
    click(shell, deleteAction, { x: 220, y: 160 });
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].selection.annotation_ids, []);
    assert.deepEqual(
      requests[0].selection.nodes.sort((a, b) => a.node_id.localeCompare(b.node_id)),
      [{ node_id: "node-1" }, { node_id: "node-2" }]
    );
    designer.destroy();
  },

  // Catches OFF mode leaving color/resize controls actionable while link
  // viewing remains available on the note body.
  "note-edit-controls-native-disabled-state-follows-mode"() {
    const { designer, shell } = mount();
    const color = shell.querySelector('[data-note-color="note-1"]');
    const resize = shell.querySelector('[data-note-resize="note-1"]');
    assert.equal(color.disabled, true);
    assert.equal(resize.disabled, true);
    designer.setAnnotationMode(true);
    assert.equal(color.disabled, false);
    assert.equal(resize.disabled, false);
    designer.setAnnotationMode(false);
    assert.equal(color.disabled, true);
    assert.equal(resize.disabled, true);
    designer.destroy();
  },

  // Catches selection.duplicate/paste creating a new note in either mode.
  // Only "annotation.add" is contractually allowed to add notes. The
  // designer is controlled input, so document:change (not getDocument()) is
  // the source of truth for what a command actually produced.
  "duplicate-and-paste-note-creation-gated-by-annotation-mode"() {
    const { designer } = mount({ annotationMode: false });
    const changes = [];
    designer.on("document:change", (payload) => changes.push(plain(payload)));

    designer.setSelection({
      nodes: [{ node_id: "node-1" }],
      edges: [],
      annotation_ids: ["note-1"]
    });
    designer.duplicate();
    assert.ok(
      changes.every((change) => !change.patch.some((op) => op.path[0] === "notes")),
      "OFF duplicate of a node+note selection must never touch notes"
    );

    changes.length = 0;
    const fragment = designer.copy({
      nodes: [],
      edges: [],
      annotation_ids: ["note-1"]
    });
    designer.paste(fragment);
    assert.equal(changes.length, 0, "OFF paste of a note-only fragment must be a no-op");

    designer.setAnnotationMode(true);
    designer.setSelection({ nodes: [], edges: [], annotation_ids: ["note-1"] });
    changes.length = 0;
    designer.duplicate();
    assert.equal(changes.length, 0, "ON duplicate of a note-only selection must be a no-op");

    changes.length = 0;
    designer.paste(fragment);
    assert.equal(changes.length, 0, "ON paste of a note-only fragment must be a no-op");
    designer.destroy();
  }
};

const requested = process.argv[2];
if (requested) {
  if (!tests[requested]) throw new Error(`unknown test: ${requested}`);
  tests[requested]();
  console.log(`${requested} passed`);
} else {
  Object.entries(tests).forEach(([name, run]) => {
    run();
    console.log(`${name} passed`);
  });
  console.log("sticky note mode tests passed");
}
