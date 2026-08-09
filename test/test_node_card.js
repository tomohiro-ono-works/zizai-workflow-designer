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

  querySelector(selector) {
    const className = selector.startsWith(".") ? selector.slice(1) : "";
    const queue = [...this.children];
    while (queue.length) {
      const current = queue.shift();
      const classes = String(current.className || "").split(/\s+/);
      if (className && classes.includes(className)) return current;
      queue.push(...(current.children || []));
    }
    return null;
  }
}

class FakeSVGElement extends FakeHTMLElement {}

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

load("designer_types.js");
load("designer_grid.js");
load("designer_graph.js");
load("designer_dom.js");

const modules = context.window.zizPackages.__workflowDesignerModules;
const model = modules.buildWorkflowGraphModel({
  steps: [{
    step_id: "01",
    flow_id: "01",
    node_type: "source",
    label: "受注DBを読込",
    description: "受注データを取得",
    ui_position: { x: 220, y: 176 }
  }],
  flows: {
    "01": {
      start: { ui_position: { x: 66, y: 198 } },
      end: { ui_position: { x: 440, y: 198 } },
      edges: []
    }
  },
  loop: { flows: {} },
  notes: []
});
const node = model.nodeByKey.get("step:01");
assert.equal(node.width, 132);
assert.equal(node.height, 132);
assert.deepEqual(
  JSON.parse(JSON.stringify(modules.workflowNodeAnchor(node, "in"))),
  { x: 242, y: 220 }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(modules.workflowNodeAnchor(node, "out"))),
  { x: 330, y: 220 }
);

const icon = new FakeSVGElement("svg");
const wrapper = modules.createWorkflowNodeElement(node, {
  renderIcon() {
    return icon;
  }
}, { readonly: false });

const visual = wrapper.querySelector(".zwd-node__visual");
const iconHost = wrapper.querySelector(".zwd-node__icon");
const label = wrapper.querySelector(".zwd-node__label");
const description = wrapper.querySelector(".zwd-node__description");
assert.ok(visual, "default step content must include an icon visual frame");
assert.equal(iconHost.children[0], icon);
assert.equal(label.textContent, "受注DBを読込");
assert.equal(description.textContent, "受注データを取得");
assert.equal(description.hidden, false);

const standardPorts = findByClass(wrapper, "zwd-node__port");
assert.deepEqual(
  standardPorts.map((port) => port.dataset.zwdPortRole).sort(),
  ["in", "out"],
  "standard step must render one input and one output port"
);

const startNode = model.nodeByKey.get("flow:01:node:START");
const endNode = model.nodeByKey.get("flow:01:node:END");
assert.equal(startNode.width, 132);
assert.equal(startNode.height, 132);
assert.equal(endNode.width, 132);
assert.equal(endNode.height, 132);
assert.deepEqual(
  JSON.parse(JSON.stringify(modules.workflowNodeAnchor(startNode, "out"))),
  { x: 176, y: 242 },
  "START output must attach to the right-center of the 88px visual body"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(modules.workflowNodeAnchor(endNode, "in"))),
  { x: 462, y: 242 },
  "END input must attach to the left-center of the 88px visual body"
);
const startWrapper = modules.createWorkflowNodeElement(startNode, null, { readonly: false });
const endWrapper = modules.createWorkflowNodeElement(endNode, null, { readonly: false });
assert.ok(startWrapper.querySelector(".zwd-node__visual"), "START must render a visual body");
assert.ok(endWrapper.querySelector(".zwd-node__visual"), "END must render a visual body");
assert.equal(startWrapper.querySelector(".zwd-node__label").textContent, "START");
assert.equal(endWrapper.querySelector(".zwd-node__label").textContent, "END");
assert.deepEqual(
  findByClass(startWrapper, "zwd-node__port").map((port) => port.dataset.zwdPortRole),
  ["out"],
  "START must render only an output port"
);
assert.deepEqual(
  findByClass(endWrapper, "zwd-node__port").map((port) => port.dataset.zwdPortRole),
  ["in"],
  "END must render only an input port"
);

const noDescriptionNode = {
  ...node,
  key: "step:02",
  ref: { node_id: "02" },
  label: "説明なし",
  step: { step_id: "02", label: "説明なし" }
};
const noDescriptionWrapper = modules.createWorkflowNodeElement(
  noDescriptionNode,
  null,
  { readonly: false }
);
assert.equal(
  noDescriptionWrapper.querySelector(".zwd-node__description").hidden,
  true
);

console.log("node card tests passed");
