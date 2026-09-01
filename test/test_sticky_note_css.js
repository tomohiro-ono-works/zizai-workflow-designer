"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cssPath = path.join(__dirname, "..", "src", "workflow_designer.css");
const css = fs.readFileSync(cssPath, "utf8");

function leafRules(source) {
  const rules = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

function declaration(body, property) {
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`);
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
}

function ruleFor(rules, selector) {
  const found = rules.find((rule) => rule.selector === selector);
  assert.ok(found, `expected CSS rule for selector: ${selector}`);
  return found;
}

const rules = leafRules(css);

// Catches a note layer that renders above nodes/edges while annotation mode
// is OFF instead of staying behind them.
const inactiveNotesLayer = ruleFor(rules, ".zwd-layer--notes");
const nodesLayer = ruleFor(rules, ".zwd-layer--nodes");
const edgesLayer = ruleFor(rules, ".zwd-layer--edges");
const inactiveNotesZ = Number(declaration(inactiveNotesLayer.body, "z-index"));
const nodesZ = Number(declaration(nodesLayer.body, "z-index"));
const edgesZ = Number(declaration(edgesLayer.body, "z-index"));
assert.ok(
  inactiveNotesZ < nodesZ && inactiveNotesZ < edgesZ,
  "notes must render behind workflow nodes and edges while annotation mode is OFF"
);
assert.equal(
  declaration(inactiveNotesLayer.body, "pointer-events"),
  "none",
  "the note layer must be non-interactive while annotation mode is OFF"
);
assert.equal(
  declaration(edgesLayer.body, "pointer-events"),
  "none",
  "the transparent edge SVG must not block viewing links on notes behind it"
);

// Catches a note layer that fails to move to the foreground while annotation
// mode is ON.
const activeNotesLayer = ruleFor(rules, '.zwd[data-annotation-mode="active"] .zwd-layer--notes');
const activeNotesZ = Number(declaration(activeNotesLayer.body, "z-index"));
assert.ok(
  activeNotesZ > nodesZ && activeNotesZ > edgesZ,
  "notes must render in the foreground while annotation mode is ON"
);

// OFF still permits non-editing interactions such as opening a link. Editing
// is blocked by the interaction/controller gates rather than blanket CSS.
const inactiveNote = ruleFor(rules, ".zwd-note");
assert.equal(
  declaration(inactiveNote.body, "pointer-events"),
  "auto",
  "a note must remain available for non-editing viewing while annotation mode is OFF"
);
const activeNote = ruleFor(rules, '.zwd[data-annotation-mode="active"] .zwd-note');
assert.equal(
  declaration(activeNote.body, "pointer-events"),
  "auto",
  "a note must be interactive while annotation mode is ON"
);

console.log("sticky note render order CSS contract passed");
