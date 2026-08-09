"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeHTMLElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.className = "";
    this.children = [];
    this.attributes = new Map();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.textContent = "";
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "hidden") this.hidden = true;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      this.dataset[key] = String(value);
    }
  }
}

class FakeSVGElement extends FakeHTMLElement {}

const document = {
  createElement(tagName) {
    return new FakeHTMLElement(tagName);
  },
  createElementNS(_namespace, tagName) {
    return new FakeSVGElement(tagName);
  }
};

const context = {
  window: {},
  document,
  HTMLElement: FakeHTMLElement,
  SVGElement: FakeSVGElement,
  console,
  setTimeout,
  clearTimeout
};
context.window.window = context.window;
context.window.document = document;
context.window.HTMLElement = FakeHTMLElement;
context.window.SVGElement = FakeSVGElement;
vm.createContext(context);

const root = path.resolve(__dirname, "..", "src");
function load(name) {
  vm.runInContext(fs.readFileSync(path.join(root, name), "utf8"), context, {
    filename: name
  });
}

function findByClass(node, className) {
  const output = [];
  const pending = [...(node.children || [])];
  while (pending.length) {
    const current = pending.shift();
    const classes = String(current.className || "").split(/\s+/);
    if (classes.includes(className)) output.push(current);
    pending.push(...(current.children || []));
  }
  return output;
}

load("designer_types.js");
load("designer_grid.js");
load("designer_graph.js");
load("designer_dom.js");

const modules = context.window.zizPackages.__workflowDesignerModules;
const model = modules.buildWorkflowGraphModel({
  steps: [
    {
      step_id: "05",
      flow_id: "01",
      node_type: "loop",
      label: "Loop Over Items",
      description: "明細単位で処理",
      ui_position: { x: 220, y: 176 }
    },
    {
      step_id: "06",
      loop_owner_id: "05",
      node_type: "transform",
      label: "HTTP Request",
      ui_position: { x: 484, y: 352 }
    },
    {
      step_id: "03",
      flow_id: "01",
      node_type: "output",
      label: "完了後処理",
      ui_position: { x: 484, y: 132 }
    },
    {
      step_id: "08",
      loop_owner_id: "05",
      node_type: "transform",
      label: "追加ループ処理",
      ui_position: { x: 748, y: 352 }
    },
    {
      step_id: "04",
      flow_id: "01",
      node_type: "output",
      label: "追加完了処理",
      ui_position: { x: 748, y: 132 }
    }
  ],
  flows: {
    "01": {
      start: { ui_position: { x: 44, y: 198 } },
      end: { ui_position: { x: 748, y: 154 } },
      edges: [
        { from: "START", to: "05", order: 1 },
        { from: "05", to: "03", order: 2 },
        { from: "03", to: "END", order: 3 }
      ]
    }
  },
  loop: {
    flows: {
      "05": {
        edges: [
          { from: "START", to: "06", order: 1 },
          { from: "06", to: "END", order: 2 }
        ]
      }
    }
  },
  notes: []
});

assert.equal(model.loopFrames.length, 0, "loop background frames must not be built");

const loopNode = model.nodeByKey.get("step:05");
assert.ok(loopNode, "loop node must exist");
assert.deepEqual(
  JSON.parse(JSON.stringify(loopNode.anchors)),
  {
    enter: { x: 22, y: 26 },
    return: { x: 22, y: 62 },
    done: { x: 110, y: 26 },
    loop: { x: 110, y: 62 }
  }
);

const mainIncomingEdge = model.edges.find((edge) => edge.ref.flow_id === "01" && edge.ref.to === "05");
const mainEdge = model.edges.find((edge) => edge.ref.flow_id === "01" && edge.ref.from === "05");
const loopStartEdge = model.edges.find((edge) => edge.ref.loop_owner_id === "05" && edge.ref.from === "START");
const loopBackEdge = model.edges.find((edge) => edge.ref.loop_owner_id === "05" && edge.ref.to === "END");
assert.equal(mainIncomingEdge.targetPort, "enter");
assert.equal(mainEdge.sourcePort, "done");
assert.equal(loopStartEdge.sourcePort, "loop");
assert.equal(loopBackEdge.targetPort, "return");


const wrapper = modules.createWorkflowNodeElement(loopNode, null, { readonly: false });
const ports = findByClass(wrapper, "zwd-node__port");
assert.equal(ports.length, 4, "loop node must render two input and two output points");
const portRoles = ports.map((port) => port.dataset.zwdPortRole).sort();
assert.deepEqual(portRoles, ["done", "enter", "loop", "return"]);
const labels = findByClass(wrapper, "zwd-node__port-label")
  .map((label) => label.textContent)
  .sort();
assert.deepEqual(labels, ["done", "loop"]);

const internalResult = modules.validateWorkflowConnection(
  model,
  { ...loopNode, connectionPort: "loop" },
  model.nodeByKey.get("step:08"),
  { graphMode: "dag" }
);
assert.equal(internalResult.allowed, true);

const wrongInternalResult = modules.validateWorkflowConnection(
  model,
  { ...loopNode, connectionPort: "done" },
  model.nodeByKey.get("step:08"),
  { graphMode: "dag" }
);
assert.equal(wrongInternalResult.allowed, false);

const mainResult = modules.validateWorkflowConnection(
  model,
  { ...loopNode, connectionPort: "done" },
  model.nodeByKey.get("step:04"),
  { graphMode: "dag" }
);
assert.equal(mainResult.allowed, true);

const wrongMainResult = modules.validateWorkflowConnection(
  model,
  { ...loopNode, connectionPort: "loop" },
  model.nodeByKey.get("step:04"),
  { graphMode: "dag" }
);
assert.equal(wrongMainResult.allowed, false);
assert.match(wrongMainResult.message, /loop output/i);

console.log("loop node tests passed");
