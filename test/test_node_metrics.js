"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {}, console, setTimeout, clearTimeout };
context.window.window = context.window;
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

const modules = context.window.zizPackages.__workflowDesignerModules;
const plain = (value) => JSON.parse(JSON.stringify(value));
const nodeMetrics = {
  width: 96,
  height: 88,
  visualSize: 44,
  iconSize: 24
};
const model = modules.buildWorkflowGraphModel({
  steps: [{
    step_id: "01",
    label: "Step",
    ui_position: { x: 140, y: 40 }
  }],
  flows: {
    main: {
      start: { ui_position: { x: 44, y: 40 } },
      end: { ui_position: { x: 236, y: 40 } },
      edges: [
        { from: "START", to: "01", order: 1 },
        { from: "01", to: "END", order: 2 }
      ]
    }
  },
  loop: { flows: {} },
  notes: []
}, { nodeMetrics });

const step = model.nodeByKey.get("step:01");
const start = model.nodeByKey.get("flow:main:node:START");
const end = model.nodeByKey.get("flow:main:node:END");

assert.deepEqual(plain(modules.normalizeWorkflowNodeMetrics(nodeMetrics)), {
  width: 96,
  height: 88,
  visualSize: 44,
  iconSize: 24,
  visualOffsetX: 26,
  loopUpperY: 13,
  loopLowerY: 31
});
assert.equal(step.width, 96);
assert.equal(step.height, 88);
assert.deepEqual(plain(modules.workflowNodeAnchor(step, "in")), { x: 166, y: 62 });
assert.deepEqual(plain(modules.workflowNodeAnchor(step, "out")), { x: 210, y: 62 });
assert.deepEqual(plain(modules.workflowNodeAnchor(start, "out")), { x: 114, y: 62 });
assert.deepEqual(plain(modules.workflowNodeAnchor(end, "in")), { x: 262, y: 62 });

assert.ok(
  step.x >= start.x + start.width,
  "START and first step boxes must not overlap"
);
assert.ok(
  end.x >= step.x + step.width,
  "END and last step boxes must not overlap"
);
assert.equal(start.y, step.y);
assert.equal(step.y, end.y);

console.log("node metrics tests passed");
