"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..", "src");
const context = {
  window: {},
  console,
  setTimeout,
  clearTimeout
};
context.window.window = context.window;
vm.createContext(context);

function load(name) {
  const source = fs.readFileSync(path.join(root, name), "utf8");
  vm.runInContext(source, context, { filename: name });
}

load("designer_render.js");

const modules = context.window.zizPackages.__workflowDesignerModules;
const previewPath = modules.workflowPreviewEdgePath;
assert.equal(typeof previewPath, "function");

const source = {
  key: "step:01",
  x: 100,
  y: 100,
  width: 184,
  height: 132,
  anchors: { in: { x: 22, y: 44 }, out: { x: 110, y: 44 } }
};
const target = {
  key: "step:02",
  x: 400,
  y: 200,
  width: 184,
  height: 132,
  anchors: { in: { x: 22, y: 44 }, out: { x: 110, y: 44 } }
};
const edge = {
  key: "edge:01-02",
  sourceKey: source.key,
  targetKey: target.key,
  kind: "main"
};

assert.equal(
  previewPath(edge, source, target, new Set([source.key]), 22, 44),
  "M 232 188 L 319 188 Q 327 188 327 196 L 327 236 Q 327 244 335 244 L 422 244"
);
assert.equal(
  previewPath(edge, source, target, new Set([target.key]), 22, 44),
  "M 210 144 L 319 144 Q 327 144 327 152 L 327 280 Q 327 288 335 288 L 444 288"
);
assert.equal(
  previewPath(edge, source, target, new Set([source.key, target.key]), 22, 44),
  "M 232 188 L 330 188 Q 338 188 338 196 L 338 280 Q 338 288 346 288 L 444 288"
);
assert.equal(
  previewPath(edge, source, target, new Set(["step:99"]), 22, 44),
  "M 210 144 L 308 144 Q 316 144 316 152 L 316 236 Q 316 244 324 244 L 422 244"
);

const loopEdge = { ...edge, kind: "loop-back" };
assert.equal(
  previewPath(loopEdge, source, target, new Set([source.key]), 22, 44),
  "M 232 188 L 319 188 Q 327 188 327 196 L 327 236 Q 327 244 335 244 L 422 244"
);

console.log("live edge preview path tests passed");

class FakeElement {
  constructor(tagName = "div", className = "") {
    this.tagName = tagName;
    this.className = className;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
  }

  get firstChild() {
    return this.children[0] || null;
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
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector() {
    return null;
  }
}

const frameQueue = [];
const cancelledFrames = new Set();
context.window.requestAnimationFrame = (callback) => {
  frameQueue.push(callback);
  return frameQueue.length;
};
context.window.cancelAnimationFrame = (id) => cancelledFrames.add(id);

Object.assign(modules, {
  cloneValue(value) {
    return JSON.parse(JSON.stringify(value));
  },
  normalizeSelection(value) {
    return value || { nodes: [], edges: [], annotation_ids: [] };
  },
  normalizeStatus() {
    return { nodeStatus: {}, validation: {} };
  },
  normalizeViewport(value) {
    return value || { x: 0, y: 0, zoom: 1 };
  },
  nodeRefKey(ref) {
    return `step:${ref.node_id}`;
  },
  edgeRefKey(ref) {
    return ref.key || `${ref.from}-${ref.to}`;
  },
  createWorkflowFeedback() {
    return {
      destroy() {},
      showMessage() {},
      showContextMenu() {},
      hideContextMenu() {}
    };
  },
  createWorkflowSvgElement(tagName, className, attributes = {}) {
    const element = new FakeElement(tagName, className);
    Object.entries(attributes).forEach(([name, value]) => {
      element.setAttribute(name, value);
    });
    return element;
  },
  createWorkflowNodeElement(node) {
    const element = new FakeElement("div", "zwd-node");
    element.dataset.nodeKey = node.key;
    return element;
  },
  createWorkflowNoteElement() {
    return new FakeElement("article", "zwd-note");
  },
  createWorkflowLoopFrame() {
    return new FakeElement("div", "zwd-loop-frame");
  }
});

const shell = {
  frameLayer: new FakeElement(),
  edgeGroup: new FakeElement(),
  edges: new FakeElement("svg"),
  nodeLayer: new FakeElement(),
  noteLayer: new FakeElement(),
  world: new FakeElement(),
  connectionPreview: new FakeElement("path"),
  selectionBox: new FakeElement(),
  rootElement: new FakeElement()
};
shell.edges.dataset.markerId = "arrow";

const renderer = modules.createWorkflowRenderer(shell);
assert.equal(typeof renderer.setNodeMovePreview, "function");

const renderModel = {
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  loopFrames: [],
  notes: [],
  nodes: [
    { ...source, ref: { node_id: "01" }, nodeType: "task", kind: "step" },
    { ...target, ref: { node_id: "02" }, nodeType: "task", kind: "step" },
    {
      key: "step:03",
      ref: { node_id: "03" },
      nodeType: "task",
      kind: "step",
      x: 700,
      y: 200,
      width: 184,
      height: 76
    }
  ],
  edges: [
    {
      key: "edge:01-02",
      ref: { key: "edge:01-02", flow_id: "01", from: "01", to: "02" },
      sourceKey: "step:01",
      targetKey: "step:02",
      kind: "main"
    },
    {
      key: "edge:02-03",
      ref: { key: "edge:02-03", flow_id: "01", from: "02", to: "03" },
      sourceKey: "step:02",
      targetKey: "step:03",
      kind: "main"
    }
  ]
};
renderModel.nodeByKey = new Map(renderModel.nodes.map((node) => [node.key, node]));

renderer.renderDocument(renderModel, {
  nodeRenderers: {},
  readonly: false,
  selection: { nodes: [], edges: [], annotation_ids: [] },
  status: {}
});

const firstEdgePaths = shell.edgeGroup.children[0].children;
const secondEdgePaths = shell.edgeGroup.children[1].children;
const firstBase = firstEdgePaths[0].getAttribute("d");
const secondBase = secondEdgePaths[0].getAttribute("d");

renderer.setNodeMovePreview(["step:01"], 10, 10);
renderer.setNodeMovePreview(["step:01"], 22, 44);
assert.equal(frameQueue.length, 1);
frameQueue.shift()();

assert.equal(
  renderer.getNodeElement("step:01").style.transform,
  "translate(22px, 44px)"
);
assert.equal(
  firstEdgePaths[0].getAttribute("d"),
  previewPath(renderModel.edges[0], source, target, new Set(["step:01"]), 22, 44)
);
assert.equal(firstEdgePaths[1].getAttribute("d"), firstEdgePaths[0].getAttribute("d"));
assert.equal(secondEdgePaths[0].getAttribute("d"), secondBase);
assert.equal(secondEdgePaths[1].getAttribute("d"), secondBase);
assert.notEqual(firstEdgePaths[0].getAttribute("d"), firstBase);

renderer.clearPreviews();
assert.equal(renderer.getNodeElement("step:01").style.transform, "");
assert.equal(firstEdgePaths[0].getAttribute("d"), firstBase);
assert.equal(firstEdgePaths[1].getAttribute("d"), firstBase);

console.log("live edge renderer tests passed");
