"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {}, console, setTimeout, clearTimeout };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "..", "src", "workflow_designer.js"), "utf8"),
  context,
  { filename: "workflow_designer.js" }
);

const modules = context.window.zizPackages.__workflowDesignerModules;
const metrics = modules.normalizeWorkflowNodeMetrics({
  width: 96,
  height: 88,
  visualSize: 44,
  iconSize: 24
});
const model = modules.buildWorkflowGraphModel({
  steps: [{ step_id: "01", ui_position: { x: 140, y: 40 } }],
  flows: {
    main: {
      start: { ui_position: { x: 44, y: 40 } },
      end: { ui_position: { x: 236, y: 40 } },
      edges: []
    }
  },
  loop: { flows: {} },
  notes: []
}, { nodeMetrics: metrics });

assert.equal(model.nodeByKey.get("step:01").width, 96);
assert.equal(model.nodeByKey.get("step:01").height, 88);
assert.deepEqual(
  JSON.parse(JSON.stringify(modules.snapWorkflowPosition(
    { x: 70, y: 78 },
    { enabled: true, size: 32, origin: { x: 44, y: 40 } }
  ))),
  { x: 76, y: 72 }
);

console.log("node metrics standalone bundle tests passed");
