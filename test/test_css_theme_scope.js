"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const cssPath = path.join(__dirname, "..", "src", "workflow_designer.css");
const css = fs.readFileSync(cssPath, "utf8");

const THEME_TOKENS = [
  "--zwd-toolbar-bg",
  "--zwd-toolbar-border",
  "--zwd-toolbar-shadow",
  "--zwd-tool-fg",
  "--zwd-tool-hover-bg",
  "--zwd-status-waiting",
  "--zwd-status-running",
  "--zwd-status-success",
  "--zwd-status-error",
  "--zwd-status-skipped",
  "--zwd-status-bg",
  "--zwd-node-visual-size",
  "--zwd-node-width"
];

function leafRules(source) {
  const rules = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    rules.push({ selector: match[1].trim(), body: match[2] });
  }
  return rules;
}

const rules = leafRules(css);

const rootRules = rules.filter((rule) => (
  rule.selector.split(",").map((part) => part.trim()).includes(":root")
));
assert.equal(
  rootRules.length,
  0,
  "library CSS must not declare an unscoped :root theme block"
);

const scopedBody = rules
  .filter((rule) => rule.selector === ".zwd")
  .map((rule) => rule.body)
  .join("\n");
const unscopedBody = rules
  .filter((rule) => rule.selector !== ".zwd")
  .map((rule) => rule.body)
  .join("\n");

for (const token of THEME_TOKENS) {
  assert.ok(
    scopedBody.includes(`${token}:`),
    `default theme token ${token} must be declared on the .zwd component root`
  );
  assert.ok(
    !unscopedBody.includes(`${token}:`),
    `default theme token ${token} must not be declared outside the .zwd component root`
  );
}

console.log("workflow designer CSS theme scope contract passed");
