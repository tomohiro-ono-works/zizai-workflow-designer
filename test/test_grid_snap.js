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

load("designer_types.js");
load("designer_grid.js");

const modules = context.window.zizPackages.__workflowDesignerModules;
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.deepEqual(
  plain(modules.normalizeWorkflowGrid({ enabled: true, size: 22 })),
  { enabled: true, size: 22 }
);
assert.deepEqual(
  plain(modules.normalizeWorkflowGrid({ enabled: false, size: 22 })),
  { enabled: false, size: 22 }
);
assert.deepEqual(
  plain(modules.snapWorkflowPosition({ x: 31, y: 54 }, { enabled: true, size: 22 })),
  { x: 22, y: 44 }
);
assert.deepEqual(
  plain(modules.snapWorkflowPosition({ x: 31, y: 54 }, { enabled: false, size: 22 })),
  { x: 31, y: 54 }
);
assert.equal(typeof modules.snapWorkflowDelta, "function");
assert.deepEqual(
  plain(modules.snapWorkflowDelta({ x: 31, y: 9 }, { enabled: true, size: 22 })),
  { x: 22, y: 0 }
);


const model = {
  nodes: [
    {
      key: "step:10",
      ref: { node_id: "10" },
      x: 100,
      y: 100,
      width: 184,
      height: 76
    },
    {
      key: "step:02",
      ref: { node_id: "02" },
      x: 100,
      y: 100,
      width: 184,
      height: 76
    },
    {
      key: "step:03",
      ref: { node_id: "03" },
      x: 140,
      y: 100,
      width: 184,
      height: 76
    }
  ]
};
const viewport = { x: 10, y: 20, zoom: 0.5 };
const source = { key: "step:99", ref: { node_id: "99" } };
const clientPoint = {
  x: 10 + 100 * 0.5,
  y: 20 + (100 + 76 / 2) * 0.5
};

const ranked = modules.rankWorkflowConnectionTargets(
  model,
  source,
  clientPoint,
  viewport,
  24,
  (candidate) => candidate.ref.node_id !== "02"
);
assert.deepEqual(ranked.map((node) => node.ref.node_id), ["10", "03"]);

const tied = modules.rankWorkflowConnectionTargets(
  model,
  source,
  clientPoint,
  viewport,
  24,
  () => true
);
assert.deepEqual(tied.map((node) => node.ref.node_id), ["02", "10", "03"]);

const outside = modules.rankWorkflowConnectionTargets(
  model,
  source,
  { x: clientPoint.x + 25, y: clientPoint.y },
  viewport,
  24,
  () => true
);
assert.deepEqual(outside.map((node) => node.ref.node_id), ["03"]);

modules.assertWorkflowFragment = () => {};
load("designer_clone.js");

const idManager = {
  allocate(type, count) {
    const values = type === "step" ? ["02"] : ["02"];
    return values.slice(0, count);
  }
};
const cloneResult = modules.cloneWorkflowFragment(
  { steps: [], notes: [] },
  {
    kind: "partial",
    steps: [{ step_id: "01", ui_position: { x: 31, y: 54 } }],
    notes: [{ note_id: "01", ui_position: { x: 31, y: 54 } }],
    edges: [],
    loop_flows: {}
  },
  {
    mode: "duplicate",
    idManager,
    offset: { x: 48, y: 48 },
    nodeGrid: { enabled: true, size: 22 }
  }
);
assert.deepEqual(
  plain(cloneResult.document.steps[0].ui_position),
  { x: 88, y: 110 }
);
assert.deepEqual(
  plain(cloneResult.document.notes[0].ui_position),
  { x: 79, y: 102 }
);

console.log("grid snap unit tests passed");
