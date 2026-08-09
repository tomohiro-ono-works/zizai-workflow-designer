"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = { window: {}, console, setTimeout, clearTimeout };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.resolve(__dirname, "..", "src", "designer_render.js"), "utf8"),
  context,
  { filename: "designer_render.js" }
);

const modules = context.window.zizPackages.__workflowDesignerModules;
const route = modules.workflowRoundedOrthogonalPath;
assert.equal(typeof route, "function", "orthogonal routing helper must be exposed internally");

const forward = route({ x: 0, y: 20 }, { x: 200, y: 100 });
assert.equal(
  forward,
  "M 0 20 L 92 20 Q 100 20 100 28 L 100 92 Q 100 100 108 100 L 200 100"
);
assert.ok(!forward.includes("C "), "forward route must not use cubic Bézier curves");

const backward = route({ x: 200, y: 20 }, { x: 0, y: 100 });
assert.equal(
  backward,
  "M 200 20 L 224 20 Q 232 20 232 28 L 232 140 Q 232 148 224 148 L -24 148 Q -32 148 -32 140 L -32 108 Q -32 100 -24 100 L 0 100"
);
assert.ok(!backward.includes("C "), "backward route must not use cubic Bézier curves");

const alignedForward = route({ x: 0, y: 20 }, { x: 200, y: 20 });
assert.equal(
  alignedForward,
  "M 0 20 L 200 20",
  "forward edges on the same y coordinate must be a straight horizontal line"
);
assert.ok(!alignedForward.includes("Q "), "straight aligned edges must not contain rounded corners");

const nearAlignedForward = route({ x: 0, y: 20 }, { x: 200, y: 28 });
assert.equal(
  nearAlignedForward,
  "M 0 20 L 96 20 Q 100 20 100 24 L 100 24 Q 100 28 104 28 L 200 28",
  "forward edges with a small y difference must use the same middle-x route, not a fixed detour lane"
);

const alignedBackward = route({ x: 200, y: 20 }, { x: 0, y: 20 });
assert.ok(
  alignedBackward.includes("Q "),
  "backward edges on the same y coordinate must keep a detour"
);

console.log("orthogonal edge routing tests passed");
