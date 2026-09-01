"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Catches a standalone bundle that drifts from the modular sources it is
// assembled from, which would make the two entry points behave differently.
const src = path.resolve(__dirname, "..", "src");

// The checked-in files mix CRLF and LF, which is a storage detail rather than
// a behavior difference.
function normalize(source) {
  return source.replace(/\r\n/g, "\n").replace(/\s+$/, "");
}

const bundle = fs.readFileSync(path.join(src, "workflow_designer.js"), "utf8");
const sections = bundle.split(
  /^\/\* ===== (?:internal: (\S+)|public API) ===== \*\/\r?\n/m
);

assert.ok(sections.length > 1, "the bundle must be split into labelled sections");

const checked = [];
for (let index = 1; index < sections.length; index += 2) {
  const name = sections[index];
  const body = sections[index + 1];
  if (!name) continue;
  const module = fs.readFileSync(path.join(src, name), "utf8");
  assert.equal(
    normalize(body),
    normalize(module),
    `standalone bundle section is out of sync with src/${name}`
  );
  checked.push(name);
}

const modules = fs.readdirSync(src)
  .filter((name) => name.startsWith("designer_") && name.endsWith(".js"))
  .sort();
assert.deepEqual(
  [...checked].sort(),
  modules,
  "the standalone bundle must include every modular source exactly once"
);

console.log(`standalone bundle parity passed (${checked.length} modules)`);
