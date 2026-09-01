/*
 * WorkflowDesigner standalone browser build
 * Public entry: load this file with a classic <script> tag.
 * No ES Modules, fetch, bundler, npm, or HTTP server are required at runtime.
 */

/* ===== internal: designer_types.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  const EMPTY_SELECTION = Object.freeze({
    nodes: Object.freeze([]),
    edges: Object.freeze([]),
    annotation_ids: Object.freeze([])
  });

  function cloneValue(value, seen = new WeakMap()) {
    if (value === null || typeof value !== "object") return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const copy = [];
      seen.set(value, copy);
      value.forEach((item) => copy.push(cloneValue(item, seen)));
      return copy;
    }
    const copy = {};
    seen.set(value, copy);
    Object.keys(value).forEach((key) => {
      copy[key] = cloneValue(value[key], seen);
    });
    return copy;
  }

  function asFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizePosition(value, fallback = { x: 0, y: 0 }) {
    return {
      x: asFiniteNumber(value?.x, fallback.x),
      y: asFiniteNumber(value?.y, fallback.y)
    };
  }

  function normalizeViewport(value) {
    const zoom = asFiniteNumber(value?.zoom, 1);
    return {
      x: asFiniteNumber(value?.x, 0),
      y: asFiniteNumber(value?.y, 0),
      zoom: Math.min(2.5, Math.max(0.25, zoom))
    };
  }

  function normalizeNodeRef(value) {
    if (!value || typeof value !== "object") return null;
    const nodeId = String(value.node_id || "").trim();
    if (!nodeId) return null;
    const ref = { node_id: nodeId };
    const flowId = String(value.flow_id || "").trim();
    const loopOwnerId = String(value.loop_owner_id || "").trim();
    const graphScope = String(value.graph_scope || "").trim();
    if (flowId) ref.flow_id = flowId;
    if (loopOwnerId) ref.loop_owner_id = loopOwnerId;
    if (graphScope) ref.graph_scope = graphScope;
    return ref;
  }

  function normalizeEdgeRef(value) {
    if (!value || typeof value !== "object") return null;
    const from = String(value.from || "").trim();
    const to = String(value.to || "").trim();
    if (!from || !to) return null;
    const ref = { from, to };
    const flowId = String(value.flow_id || "").trim();
    const loopOwnerId = String(value.loop_owner_id || "").trim();
    const graphScope = String(value.graph_scope || "").trim();
    if (flowId) ref.flow_id = flowId;
    if (loopOwnerId) ref.loop_owner_id = loopOwnerId;
    if (graphScope) ref.graph_scope = graphScope;
    if (!flowId && !loopOwnerId && !graphScope) return null;
    return ref;
  }

  function nodeRefKey(value) {
    const ref = normalizeNodeRef(value);
    if (!ref) return "";
    if (ref.graph_scope) return `${ref.graph_scope}:node:${ref.node_id}`;
    if (ref.loop_owner_id) {
      return `loop:${ref.loop_owner_id}:node:${ref.node_id}`;
    }
    if (ref.flow_id) return `flow:${ref.flow_id}:node:${ref.node_id}`;
    return `step:${ref.node_id}`;
  }

  function edgeRefKey(value) {
    const ref = normalizeEdgeRef(value);
    if (!ref) return "";
    if (ref.graph_scope) {
      return `${ref.graph_scope}:edge:${ref.from}:${ref.to}`;
    }
    if (ref.loop_owner_id) {
      return `loop:${ref.loop_owner_id}:edge:${ref.from}:${ref.to}`;
    }
    return `flow:${ref.flow_id}:edge:${ref.from}:${ref.to}`;
  }

  function uniqueBy(items, keySelector) {
    const seen = new Set();
    return items.filter((item) => {
      const key = keySelector(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeSelection(value) {
    if (!value || typeof value !== "object") {
      return cloneValue(EMPTY_SELECTION);
    }
    const nodes = uniqueBy(
      (Array.isArray(value.nodes) ? value.nodes : [])
        .map(normalizeNodeRef)
        .filter(Boolean),
      nodeRefKey
    );
    const edges = uniqueBy(
      (Array.isArray(value.edges) ? value.edges : [])
        .map(normalizeEdgeRef)
        .filter(Boolean),
      edgeRefKey
    );
    const annotationIds = uniqueBy(
      (Array.isArray(value.annotation_ids) ? value.annotation_ids : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
      (item) => item
    );
    return {
      nodes,
      edges,
      annotation_ids: annotationIds
    };
  }

  function normalizeStatus(value) {
    const status = value && typeof value === "object" ? value : {};
    const nodeStatus = {};
    const allowed = new Set([
      "idle",
      "waiting",
      "running",
      "success",
      "error",
      "skipped"
    ]);
    Object.entries(status.nodeStatus || {}).forEach(([key, raw]) => {
      const normalized = String(raw || "").trim().toLowerCase();
      if (allowed.has(normalized)) nodeStatus[String(key)] = normalized;
    });

    const validation = {};
    Object.entries(status.validation || {}).forEach(([key, entries]) => {
      const normalized = (Array.isArray(entries) ? entries : [])
        .map((entry) => {
          const level = String(entry?.level || "").trim().toLowerCase();
          const message = String(entry?.message || "").trim();
          if (!message || !["warning", "error"].includes(level)) return null;
          return { level, message };
        })
        .filter(Boolean);
      if (normalized.length) validation[String(key)] = normalized;
    });
    return { nodeStatus, validation };
  }

  function sameValue(left, right) {
    if (left === right) return true;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") {
      return false;
    }
    if (Array.isArray(left) !== Array.isArray(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => (
      Object.prototype.hasOwnProperty.call(right, key) &&
      sameValue(left[key], right[key])
    ));
  }

  modules.cloneValue = cloneValue;
  modules.asFiniteNumber = asFiniteNumber;
  modules.normalizePosition = normalizePosition;
  modules.normalizeViewport = normalizeViewport;
  modules.normalizeNodeRef = normalizeNodeRef;
  modules.normalizeEdgeRef = normalizeEdgeRef;
  modules.nodeRefKey = nodeRefKey;
  modules.edgeRefKey = edgeRefKey;
  modules.normalizeSelection = normalizeSelection;
  modules.normalizeStatus = normalizeStatus;
  modules.sameValue = sameValue;
})(window);

/* ===== internal: designer_grid.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function normalizeGrid(value) {
    const source = value && typeof value === "object" ? value : {};
    const size = Math.max(1, modules.asFiniteNumber(source.size, 22));
    const output = {
      enabled: source.enabled === true,
      size
    };
    if (source.origin && typeof source.origin === "object") {
      output.origin = modules.normalizePosition(source.origin);
    }
    return output;
  }

  function snapPosition(value, gridValue) {
    const point = modules.normalizePosition(value);
    const grid = normalizeGrid(gridValue);
    if (!grid.enabled) return point;
    const origin = modules.normalizePosition(grid.origin);
    return {
      x: origin.x + Math.round((point.x - origin.x) / grid.size) * grid.size,
      y: origin.y + Math.round((point.y - origin.y) / grid.size) * grid.size
    };
  }

  function snapDelta(value, gridValue) {
    const point = modules.normalizePosition(value);
    const grid = normalizeGrid(gridValue);
    if (!grid.enabled) return point;
    return {
      x: Math.round(point.x / grid.size) * grid.size,
      y: Math.round(point.y / grid.size) * grid.size
    };
  }

  function nodeAnchor(node, port = "in") {
    const x = modules.asFiniteNumber(node?.x, 0);
    const y = modules.asFiniteNumber(node?.y, 0);
    const width = modules.asFiniteNumber(node?.width, 0);
    const height = modules.asFiniteNumber(node?.height, 0);
    const fallback = {
      x: port === "in" ? 0 : width,
      y: height / 2
    };
    const anchor = node?.anchors?.[port];
    return {
      x: x + modules.asFiniteNumber(anchor?.x, fallback.x),
      y: y + modules.asFiniteNumber(anchor?.y, fallback.y)
    };
  }

  function screenPoint(worldPoint, viewportValue) {
    const viewport = modules.normalizeViewport(viewportValue);
    return {
      x: viewport.x + worldPoint.x * viewport.zoom,
      y: viewport.y + worldPoint.y * viewport.zoom
    };
  }

  function compareNodeIds(left, right) {
    const leftId = String(left?.ref?.node_id || "");
    const rightId = String(right?.ref?.node_id || "");
    const leftNumeric = /^\d+$/.test(leftId);
    const rightNumeric = /^\d+$/.test(rightId);
    if (leftNumeric && rightNumeric) {
      const difference = Number(leftId) - Number(rightId);
      if (difference) return difference;
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    return leftId.localeCompare(rightId);
  }

  function targetPortForSource(source, node) {
    if (node?.nodeType !== "loop") return "in";
    const sourceLoopOwner = String(source?.step?.loop_owner_id || "").trim();
    const targetNodeId = String(node?.ref?.node_id || "").trim();
    if (sourceLoopOwner && sourceLoopOwner === targetNodeId) return "return";
    return "enter";
  }

  function rankConnectionTargets(
    model,
    source,
    clientPointValue,
    viewportValue,
    maxDistanceValue,
    isAllowed
  ) {
    const point = modules.normalizePosition(clientPointValue);
    const maxDistance = Math.max(
      0,
      modules.asFiniteNumber(maxDistanceValue, 0)
    );
    const allow = typeof isAllowed === "function" ? isAllowed : () => true;
    return (Array.isArray(model?.nodes) ? model.nodes : [])
      .filter((node) => node && node.key !== source?.key)
      .map((node) => {
        const targetPort = targetPortForSource(source, node);
        const anchor = screenPoint(nodeAnchor(node, targetPort), viewportValue);
        return {
          node,
          distance: Math.hypot(anchor.x - point.x, anchor.y - point.y)
        };
      })
      .filter((item) => item.distance <= maxDistance)
      .sort((left, right) => (
        left.distance - right.distance || compareNodeIds(left.node, right.node)
      ))
      .filter((item) => allow(item.node))
      .map((item) => item.node);
  }

  modules.normalizeWorkflowGrid = normalizeGrid;
  modules.snapWorkflowPosition = snapPosition;
  modules.snapWorkflowDelta = snapDelta;
  modules.workflowNodeAnchor = nodeAnchor;
  modules.rankWorkflowConnectionTargets = rankConnectionTargets;
})(window);

/* ===== internal: designer_events.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function createEmitter() {
    const listeners = new Map();

    function on(eventName, handler) {
      const name = String(eventName || "").trim();
      if (!name || typeof handler !== "function") {
        throw new TypeError("event name and handler are required");
      }
      const handlers = listeners.get(name) || new Set();
      handlers.add(handler);
      listeners.set(name, handlers);
      return () => off(name, handler);
    }

    function off(eventName, handler) {
      const name = String(eventName || "").trim();
      const handlers = listeners.get(name);
      if (!handlers) return;
      handlers.delete(handler);
      if (!handlers.size) listeners.delete(name);
    }

    function emit(eventName, payload) {
      const handlers = listeners.get(String(eventName || "").trim());
      if (!handlers) return;
      Array.from(handlers).forEach((handler) => handler(payload));
    }

    function has(eventName) {
      return (listeners.get(String(eventName || "").trim())?.size || 0) > 0;
    }

    function clear() {
      listeners.clear();
    }

    return Object.freeze({ on, off, emit, has, clear });
  }

  modules.createEmitter = createEmitter;
})(window);

/* ===== internal: designer_document.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function assertDocument(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("document must be an object");
    }
  }

  function assertPath(path) {
    if (!Array.isArray(path)) {
      throw new TypeError("patch path must be an array");
    }
    path.forEach((segment) => {
      const validString = typeof segment === "string" && segment.length > 0;
      const validIndex = Number.isInteger(segment) && segment >= 0;
      if (!validString && !validIndex) {
        throw new TypeError("patch path contains an invalid segment");
      }
    });
  }

  function getPathValue(document, path) {
    let current = document;
    for (const segment of path) {
      if (
        current === null ||
        typeof current !== "object" ||
        !Object.prototype.hasOwnProperty.call(current, segment)
      ) {
        return { exists: false, value: undefined };
      }
      current = current[segment];
    }
    return { exists: true, value: current };
  }

  function resolveParent(document, path) {
    if (!path.length) return { parent: null, key: null };
    let parent = document;
    for (let index = 0; index < path.length - 1; index += 1) {
      const segment = path[index];
      if (
        parent === null ||
        typeof parent !== "object" ||
        !Object.prototype.hasOwnProperty.call(parent, segment)
      ) {
        throw new Error("patch path does not exist");
      }
      parent = parent[segment];
    }
    if (parent === null || typeof parent !== "object") {
      throw new Error("patch parent is not an object or array");
    }
    return { parent, key: path[path.length - 1] };
  }

  function applyOperation(document, operation) {
    if (!operation || typeof operation !== "object") {
      throw new TypeError("patch operation must be an object");
    }
    const op = String(operation.op || "").trim();
    const path = operation.path;
    assertPath(path);

    if (!path.length) {
      if (op !== "replace" || !operation.value || typeof operation.value !== "object") {
        throw new Error("document root only supports replace");
      }
      return modules.cloneValue(operation.value);
    }

    const { parent, key } = resolveParent(document, path);
    const isArray = Array.isArray(parent);
    const exists = Object.prototype.hasOwnProperty.call(parent, key);

    if (op === "add") {
      if (!Object.prototype.hasOwnProperty.call(operation, "value")) {
        throw new Error("add operation requires value");
      }
      if (isArray) {
        if (!Number.isInteger(key) || key < 0 || key > parent.length) {
          throw new Error("array add index is out of range");
        }
        parent.splice(key, 0, modules.cloneValue(operation.value));
      } else {
        if (exists) throw new Error("add target already exists");
        parent[key] = modules.cloneValue(operation.value);
      }
      return document;
    }

    if (op === "replace") {
      if (!exists) throw new Error("replace target does not exist");
      if (!Object.prototype.hasOwnProperty.call(operation, "value")) {
        throw new Error("replace operation requires value");
      }
      parent[key] = modules.cloneValue(operation.value);
      return document;
    }

    if (op === "remove") {
      if (!exists) throw new Error("remove target does not exist");
      if (isArray) {
        if (!Number.isInteger(key)) throw new Error("array path requires an index");
        parent.splice(key, 1);
      } else {
        delete parent[key];
      }
      return document;
    }

    throw new Error(`unsupported patch operation: ${op}`);
  }

  function normalizePatch(patch) {
    if (!Array.isArray(patch)) throw new TypeError("patch must be an array");
    return patch.map((operation) => modules.cloneValue(operation));
  }

  function applyPatch(document, patch) {
    assertDocument(document);
    const operations = normalizePatch(patch);
    let next = modules.cloneValue(document);
    operations.forEach((operation) => {
      next = applyOperation(next, operation);
    });
    assertDocument(next);
    return next;
  }

  function applyPatchWithInverse(document, patch) {
    assertDocument(document);
    const operations = normalizePatch(patch);
    let next = modules.cloneValue(document);
    const inverse = [];

    operations.forEach((operation) => {
      const path = operation.path;
      assertPath(path);
      const previous = getPathValue(next, path);
      next = applyOperation(next, operation);
      if (operation.op === "add") {
        inverse.unshift({ op: "remove", path: modules.cloneValue(path) });
      } else if (operation.op === "remove") {
        inverse.unshift({
          op: "add",
          path: modules.cloneValue(path),
          value: modules.cloneValue(previous.value)
        });
      } else if (operation.op === "replace") {
        inverse.unshift({
          op: "replace",
          path: modules.cloneValue(path),
          value: modules.cloneValue(previous.value)
        });
      }
    });
    assertDocument(next);
    return { document: next, inversePatch: inverse };
  }

  function diffValues(before, after, path, patch) {
    if (modules.sameValue(before, after)) return;
    const beforeObject = before && typeof before === "object";
    const afterObject = after && typeof after === "object";
    if (Array.isArray(before) && Array.isArray(after)) {
      const sharedLength = Math.min(before.length, after.length);
      let commonPrefix = 0;
      while (
        commonPrefix < sharedLength &&
        modules.sameValue(before[commonPrefix], after[commonPrefix])
      ) {
        commonPrefix += 1;
      }
      if (commonPrefix === before.length && after.length >= before.length) {
        for (let index = before.length; index < after.length; index += 1) {
          patch.push({
            op: "add",
            path: [...path, index],
            value: modules.cloneValue(after[index])
          });
        }
        return;
      }
      if (commonPrefix === after.length && before.length > after.length) {
        for (let index = before.length - 1; index >= after.length; index -= 1) {
          patch.push({ op: "remove", path: [...path, index] });
        }
        return;
      }
      if (before.length === after.length) {
        before.forEach((item, index) => {
          diffValues(item, after[index], [...path, index], patch);
        });
        return;
      }
    }
    if (
      !beforeObject ||
      !afterObject ||
      Array.isArray(before) ||
      Array.isArray(after)
    ) {
      patch.push({
        op: "replace",
        path: modules.cloneValue(path),
        value: modules.cloneValue(after)
      });
      return;
    }

    Object.keys(before).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(after, key)) {
        patch.push({ op: "remove", path: [...path, key] });
      }
    });
    Object.keys(after).forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(before, key)) {
        patch.push({
          op: "add",
          path: [...path, key],
          value: modules.cloneValue(after[key])
        });
        return;
      }
      diffValues(before[key], after[key], [...path, key], patch);
    });
  }

  function diffDocuments(before, after) {
    assertDocument(before);
    assertDocument(after);
    const patch = [];
    diffValues(before, after, [], patch);
    return patch;
  }

  modules.assertWorkflowDocument = assertDocument;
  modules.getDocumentPathValue = getPathValue;
  modules.applyDocumentPatch = applyPatch;
  modules.applyDocumentPatchWithInverse = applyPatchWithInverse;
  modules.diffWorkflowDocuments = diffDocuments;
})(window);

/* ===== internal: designer_ids.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  const ID_KINDS = Object.freeze(["step", "flow", "note"]);

  function collectIds(document, kind) {
    if (kind === "step") {
      return (Array.isArray(document?.steps) ? document.steps : [])
        .map((step) => String(step?.step_id || "").trim())
        .filter(Boolean);
    }
    if (kind === "flow") {
      return Object.keys(
        document?.flows && typeof document.flows === "object"
          ? document.flows
          : {}
      ).map((value) => String(value).trim()).filter(Boolean);
    }
    return (Array.isArray(document?.notes) ? document.notes : [])
      .map((note) => String(note?.note_id || "").trim())
      .filter(Boolean);
  }

  function numericValue(value) {
    const text = String(value || "").trim();
    if (!/^(?:0*[1-9]\d*)$/.test(text)) return 0;
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : 0;
  }

  function formatStandardId(value) {
    return String(value).padStart(2, "0");
  }

  function createIdManager(customAllocator, initialDocument) {
    const issued = new Map(ID_KINDS.map((kind) => [kind, new Set()]));
    const highWater = new Map(ID_KINDS.map((kind) => [kind, 0]));

    function assertKind(kind) {
      if (!ID_KINDS.includes(kind)) {
        throw new TypeError(`unknown id kind: ${kind}`);
      }
    }

    function observe(document) {
      ID_KINDS.forEach((kind) => {
        collectIds(document, kind).forEach((id) => {
          issued.get(kind).add(id);
          highWater.set(kind, Math.max(highWater.get(kind), numericValue(id)));
        });
      });
    }

    function validateAllocated(kind, values, count, document) {
      if (!Array.isArray(values) || values.length !== count) {
        throw new Error(`idAllocator must return ${count} ${kind} id(s)`);
      }
      const normalized = values.map((value) => String(value || "").trim());
      if (normalized.some((value) => !value)) {
        throw new Error("idAllocator returned an empty id");
      }
      if (new Set(normalized).size !== normalized.length) {
        throw new Error("idAllocator returned duplicate ids");
      }
      const existing = new Set([
        ...collectIds(document, kind),
        ...issued.get(kind)
      ]);
      if (normalized.some((value) => existing.has(value))) {
        throw new Error("idAllocator returned an existing or retired id");
      }
      return normalized;
    }

    function allocate(kind, count, document) {
      assertKind(kind);
      const size = Number(count);
      if (!Number.isInteger(size) || size < 1) {
        throw new TypeError("id allocation count must be a positive integer");
      }
      observe(document);
      let values;
      if (typeof customAllocator === "function") {
        values = customAllocator({
          idKind: kind,
          document: modules.cloneValue(document),
          count: size
        });
        if (values && typeof values.then === "function") {
          throw new Error("idAllocator must be synchronous");
        }
      } else {
        values = [];
        let candidate = highWater.get(kind);
        while (values.length < size) {
          candidate += 1;
          const id = formatStandardId(candidate);
          if (!issued.get(kind).has(id)) values.push(id);
        }
      }
      const normalized = validateAllocated(kind, values, size, document);
      normalized.forEach((id) => {
        issued.get(kind).add(id);
        highWater.set(kind, Math.max(highWater.get(kind), numericValue(id)));
      });
      return normalized;
    }

    observe(initialDocument || {});
    return Object.freeze({ allocate, observe });
  }

  modules.createWorkflowIdManager = createIdManager;
  modules.collectWorkflowIds = collectIds;
})(window);

/* ===== internal: designer_graph.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  const NODE_WIDTH = 132;
  const NODE_HEIGHT = 132;
  const NODE_VISUAL_SIZE = 88;
  const NODE_VISUAL_OFFSET_X = 22;
  const TERMINAL_WIDTH = NODE_WIDTH;
  const TERMINAL_HEIGHT = NODE_HEIGHT;
  const UNASSIGNED_START_HEIGHT = 48;
  const DEFAULT_GAP_X = 252;
  const DEFAULT_GAP_Y = 180;

  function normalizeNodeMetrics(value) {
    const source = value && typeof value === "object" ? value : {};
    const visualSize = Math.max(
      1,
      modules.asFiniteNumber(source.visualSize, NODE_VISUAL_SIZE)
    );
    const width = Math.max(
      visualSize,
      modules.asFiniteNumber(source.width, NODE_WIDTH)
    );
    const height = Math.max(
      visualSize,
      modules.asFiniteNumber(source.height, NODE_HEIGHT)
    );
    const iconSize = Math.min(
      visualSize,
      Math.max(1, modules.asFiniteNumber(source.iconSize, 48))
    );
    return {
      width,
      height,
      visualSize,
      iconSize,
      visualOffsetX: (width - visualSize) / 2,
      loopUpperY: Math.round(visualSize * 26 / NODE_VISUAL_SIZE),
      loopLowerY: Math.round(visualSize * 62 / NODE_VISUAL_SIZE)
    };
  }

  function position(value, fallback) {
    return modules.normalizePosition(value, fallback);
  }

  function stepKey(stepId) {
    return `step:${String(stepId)}`;
  }

  function flowNodeKey(flowId, nodeId) {
    return `flow:${String(flowId)}:node:${nodeId}`;
  }

  function unassignedNodeKey(nodeId) {
    return `unassigned:node:${nodeId}`;
  }

  function createStepNode(step, index, metrics) {
    const stepId = String(step?.step_id || "").trim();
    if (!stepId) return null;
    const fallback = {
      x: 280 + (index % 4) * DEFAULT_GAP_X,
      y: 120 + Math.floor(index / 4) * DEFAULT_GAP_Y
    };
    const nodeType = String(step?.node_type || "task").trim() || "task";
    const anchors = nodeType === "loop"
      ? {
          enter: { x: metrics.visualOffsetX, y: metrics.loopUpperY },
          return: { x: metrics.visualOffsetX, y: metrics.loopLowerY },
          done: {
            x: metrics.visualOffsetX + metrics.visualSize,
            y: metrics.loopUpperY
          },
          loop: {
            x: metrics.visualOffsetX + metrics.visualSize,
            y: metrics.loopLowerY
          }
        }
      : {
          in: { x: metrics.visualOffsetX, y: metrics.visualSize / 2 },
          out: {
            x: metrics.visualOffsetX + metrics.visualSize,
            y: metrics.visualSize / 2
          }
        };
    return {
      key: stepKey(stepId),
      kind: "step",
      nodeType,
      label: String(step?.label || stepId),
      ref: { node_id: stepId },
      step,
      x: position(step?.ui_position, fallback).x,
      y: position(step?.ui_position, fallback).y,
      width: metrics.width,
      height: metrics.height,
      anchors,
      documentPath: ["steps", index, "ui_position"]
    };
  }

  function createTerminalNode(flowId, flow, nodeId, flowIndex, metrics) {
    const isStart = nodeId === "START";
    const fallback = {
      x: isStart ? 72 : 900,
      y: 96 + flowIndex * 360
    };
    const source = isStart ? flow?.start : flow?.end;
    const point = position(source?.ui_position, fallback);
    const field = isStart ? "start" : "end";
    return {
      key: flowNodeKey(flowId, nodeId),
      kind: isStart ? "start" : "end",
      nodeType: isStart ? "start" : "end",
      label: nodeId,
      ref: { node_id: nodeId, flow_id: flowId },
      x: point.x,
      y: point.y,
      width: metrics.width,
      height: metrics.height,
      anchors: isStart
        ? {
            out: {
              x: metrics.visualOffsetX + metrics.visualSize,
              y: metrics.visualSize / 2
            }
          }
        : {
            in: {
              x: metrics.visualOffsetX,
              y: metrics.visualSize / 2
            }
          },
      documentPath: ["flows", flowId, field, "ui_position"]
    };
  }

  function createEdge(
    ref,
    sourceKey,
    targetKey,
    edge,
    kind = "main",
    sourcePort = "out",
    targetPort = "in"
  ) {
    return {
      key: modules.edgeRefKey(ref),
      ref,
      sourceKey,
      targetKey,
      sourcePort,
      targetPort,
      order: Number.isFinite(Number(edge?.order)) ? Number(edge.order) : 0,
      kind
    };
  }

  function buildMainEdges(document, nodeByKey) {
    const edges = [];
    Object.entries(document?.flows || {}).forEach(([flowId, flow]) => {
      (Array.isArray(flow?.edges) ? flow.edges : []).forEach((edge) => {
        const from = String(edge?.from || "").trim();
        const to = String(edge?.to || "").trim();
        if (!from || !to) return;
        const sourceKey = from === "START" || from === "END"
          ? flowNodeKey(flowId, from)
          : stepKey(from);
        const targetKey = to === "START" || to === "END"
          ? flowNodeKey(flowId, to)
          : stepKey(to);
        if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) return;
        const source = nodeByKey.get(sourceKey);
        const target = nodeByKey.get(targetKey);
        edges.push(createEdge(
          { flow_id: flowId, from, to },
          sourceKey,
          targetKey,
          edge,
          "main",
          source?.nodeType === "loop" ? "done" : "out",
          target?.nodeType === "loop" ? "enter" : "in"
        ));
      });
    });
    return edges;
  }

  function buildLoopEdges(document, nodeByKey) {
    const edges = [];
    Object.entries(document?.loop?.flows || {}).forEach(([ownerId, graph]) => {
      const ownerKey = stepKey(ownerId);
      if (!nodeByKey.has(ownerKey)) return;
      (Array.isArray(graph?.edges) ? graph.edges : []).forEach((edge) => {
        const from = String(edge?.from || "").trim();
        const to = String(edge?.to || "").trim();
        if (!from || !to) return;
        const sourceKey = from === "START" || from === "END"
          ? ownerKey
          : stepKey(from);
        const targetKey = to === "START" || to === "END"
          ? ownerKey
          : stepKey(to);
        if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) return;
        const target = nodeByKey.get(targetKey);
        edges.push(createEdge(
          { loop_owner_id: ownerId, from, to },
          sourceKey,
          targetKey,
          edge,
          to === "END" ? "loop-back" : "loop",
          from === "START" ? "loop" : "out",
          to === "END" ? "return" : (target?.nodeType === "loop" ? "enter" : "in")
        ));
      });
    });
    return edges;
  }

  function buildUnassigned(document, nodes, nodeByKey) {
    const unassigned = document?.unassigned;
    if (!unassigned || typeof unassigned !== "object") return [];
    const fallback = { x: 72, y: 720 };
    const point = position(unassigned.start?.ui_position, fallback);
    const start = {
      key: unassignedNodeKey("START"),
      kind: "unassigned-start",
      nodeType: "start",
      label: "UNASSIGNED",
      ref: { node_id: "START", graph_scope: "unassigned" },
      x: point.x,
      y: point.y,
      width: 136,
      height: UNASSIGNED_START_HEIGHT,
      documentPath: ["unassigned", "start", "ui_position"]
    };
    nodes.push(start);
    nodeByKey.set(start.key, start);
    const edges = [];
    (Array.isArray(unassigned.edges) ? unassigned.edges : []).forEach((edge) => {
      const from = String(edge?.from || "").trim();
      const to = String(edge?.to || "").trim();
      if (!from || !to) return;
      const sourceKey = from === "START" ? start.key : stepKey(from);
      const targetKey = to === "START" ? start.key : stepKey(to);
      if (!nodeByKey.has(sourceKey) || !nodeByKey.has(targetKey)) return;
      edges.push(createEdge(
        { graph_scope: "unassigned", from, to },
        sourceKey,
        targetKey,
        edge,
        "unassigned"
      ));
    });
    return edges;
  }

  function buildLoopFrames(document, nodeByKey) {
    return Object.keys(document?.loop?.flows || {}).map((ownerId) => {
      const owner = nodeByKey.get(stepKey(ownerId));
      if (!owner) return null;
      const children = (Array.isArray(document?.steps) ? document.steps : [])
        .filter((step) => String(step?.loop_owner_id || "") === ownerId)
        .map((step) => nodeByKey.get(stepKey(step.step_id)))
        .filter(Boolean);
      const members = [owner, ...children];
      const minX = Math.min(...members.map((node) => node.x)) - 28;
      const minY = Math.min(...members.map((node) => node.y)) - 42;
      const maxX = Math.max(...members.map((node) => node.x + node.width)) + 28;
      const maxY = Math.max(...members.map((node) => node.y + node.height)) + 28;
      return {
        ownerId,
        label: owner.label,
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      };
    }).filter(Boolean);
  }

  function normalizeNotes(document) {
    return (Array.isArray(document?.notes) ? document.notes : [])
      .map((note, index) => {
        const noteId = String(note?.note_id || "").trim();
        if (!noteId) return null;
        const point = position(note.ui_position, {
          x: 320 + index * 24,
          y: 560 + index * 24
        });
        const width = Math.max(160, modules.asFiniteNumber(note.size?.width, 240));
        const height = Math.max(96, modules.asFiniteNumber(note.size?.height, 144));
        return {
          note,
          noteId,
          key: `note:${noteId}`,
          x: point.x,
          y: point.y,
          width,
          height,
          positionPath: ["notes", index, "ui_position"],
          sizePath: ["notes", index, "size"],
          textPath: ["notes", index, "text"],
          colorPath: ["notes", index, "color"]
        };
      })
      .filter(Boolean);
  }

  function buildBounds(nodes, frames, notes) {
    const items = [
      ...nodes.map((item) => ({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height
      })),
      ...frames,
      ...notes
    ];
    if (!items.length) return { x: 0, y: 0, width: 960, height: 640 };
    const minX = Math.min(...items.map((item) => item.x));
    const minY = Math.min(...items.map((item) => item.y));
    const maxX = Math.max(...items.map((item) => item.x + item.width));
    const maxY = Math.max(...items.map((item) => item.y + item.height));
    return {
      x: minX,
      y: minY,
      width: Math.max(320, maxX - minX),
      height: Math.max(240, maxY - minY)
    };
  }

  function buildGraphModel(document, options = {}) {
    const nodes = [];
    const nodeByKey = new Map();
    const nodeMetrics = normalizeNodeMetrics(options.nodeMetrics);
    Object.entries(document?.flows || {}).forEach(([flowId, flow], index) => {
      ["START", "END"].forEach((nodeId) => {
        const node = createTerminalNode(
          flowId,
          flow,
          nodeId,
          index,
          nodeMetrics
        );
        nodes.push(node);
        nodeByKey.set(node.key, node);
      });
    });
    (Array.isArray(document?.steps) ? document.steps : []).forEach((step, index) => {
      const node = createStepNode(step, index, nodeMetrics);
      if (!node) return;
      nodes.push(node);
      nodeByKey.set(node.key, node);
    });
    const edges = [
      ...buildMainEdges(document, nodeByKey),
      ...buildLoopEdges(document, nodeByKey),
      ...buildUnassigned(document, nodes, nodeByKey)
    ];
    const loopFrames = [];
    const notes = normalizeNotes(document);
    return {
      nodes,
      edges,
      loopFrames,
      notes,
      nodeByKey,
      bounds: buildBounds(nodes, loopFrames, notes)
    };
  }


  function graphScopeForNode(node) {
    const loopOwnerId = String(node?.step?.loop_owner_id || "").trim();
    if (loopOwnerId) return { kind: "loop", id: loopOwnerId };
    if (node?.kind === "unassigned-start") {
      return { kind: "unassigned", id: "unassigned" };
    }
    const flowId = String(
      node?.ref?.flow_id || node?.step?.flow_id || ""
    ).trim();
    if (flowId) return { kind: "flow", id: flowId };
    if (node?.kind === "step") {
      return { kind: "unassigned", id: "unassigned" };
    }
    return null;
  }

  function sameScope(left, right) {
    return !!left && !!right && left.kind === right.kind && left.id === right.id;
  }

  function resolveConnectionScope(source, target) {
    const sourceLoop = String(source?.step?.loop_owner_id || "").trim();
    const targetLoop = String(target?.step?.loop_owner_id || "").trim();
    const sourceId = String(source?.ref?.node_id || "").trim();
    const targetId = String(target?.ref?.node_id || "").trim();

    if (sourceLoop || targetLoop) {
      const ownerId = sourceLoop || targetLoop;
      const sourceInside = sourceLoop === ownerId || sourceId === ownerId;
      const targetInside = targetLoop === ownerId || targetId === ownerId;
      if (sourceInside && targetInside && (!sourceLoop || sourceLoop === ownerId) &&
          (!targetLoop || targetLoop === ownerId)) {
        return { kind: "loop", id: ownerId };
      }
      return null;
    }

    const sourceScope = graphScopeForNode(source);
    const targetScope = graphScopeForNode(target);
    return sameScope(sourceScope, targetScope) ? sourceScope : null;
  }

  function logicalNodeId(node, scope, role) {
    const nodeId = String(node?.ref?.node_id || "").trim();
    if (scope?.kind === "loop" && nodeId === scope.id &&
        !String(node?.step?.loop_owner_id || "").trim()) {
      return role === "source" ? "START" : "END";
    }
    return nodeId;
  }

  function edgeMatchesScope(edge, scope) {
    const ref = edge?.ref || edge || {};
    if (scope?.kind === "flow") {
      return String(ref.flow_id || "") === scope.id;
    }
    if (scope?.kind === "loop") {
      return String(ref.loop_owner_id || "") === scope.id;
    }
    return scope?.kind === "unassigned" &&
      String(ref.graph_scope || "") === "unassigned";
  }

  function scopedEdges(model, scope) {
    return (Array.isArray(model?.edges) ? model.edges : [])
      .filter((edge) => edgeMatchesScope(edge, scope))
      .map((edge) => ({
        from: String(edge?.ref?.from || "").trim(),
        to: String(edge?.ref?.to || "").trim()
      }))
      .filter((edge) => edge.from && edge.to);
  }

  function isReachable(edges, start, goal) {
    if (!start || !goal) return false;
    const adjacency = new Map();
    edges.forEach(({ from, to }) => {
      const targets = adjacency.get(from) || [];
      targets.push(to);
      adjacency.set(from, targets);
    });
    const pending = [start];
    const visited = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (current === goal) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      (adjacency.get(current) || []).forEach((next) => {
        if (!visited.has(next)) pending.push(next);
      });
    }
    return false;
  }

  function wouldCreateCycle(model, source, target) {
    const scope = resolveConnectionScope(source, target);
    if (!scope) return false;
    const sourceId = logicalNodeId(source, scope, "source");
    const targetId = logicalNodeId(target, scope, "target");
    return isReachable(scopedEdges(model, scope), targetId, sourceId);
  }

  function stronglyConnectedCycles(edges) {
    const adjacency = new Map();
    const nodes = new Set();
    edges.forEach(({ from, to }) => {
      nodes.add(from);
      nodes.add(to);
      const targets = adjacency.get(from) || [];
      targets.push(to);
      adjacency.set(from, targets);
    });

    let nextIndex = 0;
    const indexByNode = new Map();
    const lowByNode = new Map();
    const stack = [];
    const onStack = new Set();
    const cycles = [];

    function visit(nodeId) {
      indexByNode.set(nodeId, nextIndex);
      lowByNode.set(nodeId, nextIndex);
      nextIndex += 1;
      stack.push(nodeId);
      onStack.add(nodeId);

      (adjacency.get(nodeId) || []).forEach((targetId) => {
        if (!indexByNode.has(targetId)) {
          visit(targetId);
          lowByNode.set(
            nodeId,
            Math.min(lowByNode.get(nodeId), lowByNode.get(targetId))
          );
        } else if (onStack.has(targetId)) {
          lowByNode.set(
            nodeId,
            Math.min(lowByNode.get(nodeId), indexByNode.get(targetId))
          );
        }
      });

      if (lowByNode.get(nodeId) !== indexByNode.get(nodeId)) return;
      const component = [];
      let item = null;
      do {
        item = stack.pop();
        onStack.delete(item);
        component.push(item);
      } while (item !== nodeId);

      const selfLoop = component.length === 1 && edges.some(
        (edge) => edge.from === component[0] && edge.to === component[0]
      );
      if (component.length > 1 || selfLoop) cycles.push(component);
    }

    nodes.forEach((nodeId) => {
      if (!indexByNode.has(nodeId)) visit(nodeId);
    });
    return cycles;
  }

  function documentGraphScopes(document) {
    const scopes = [];
    Object.entries(document?.flows || {}).forEach(([flowId, flow]) => {
      scopes.push({
        scope: { kind: "flow", id: String(flowId) },
        edges: Array.isArray(flow?.edges) ? flow.edges : []
      });
    });
    Object.entries(document?.loop?.flows || {}).forEach(([ownerId, graph]) => {
      scopes.push({
        scope: { kind: "loop", id: String(ownerId) },
        edges: Array.isArray(graph?.edges) ? graph.edges : []
      });
    });
    if (document?.unassigned && typeof document.unassigned === "object") {
      scopes.push({
        scope: { kind: "unassigned", id: "unassigned" },
        edges: Array.isArray(document.unassigned.edges)
          ? document.unassigned.edges
          : []
      });
    }
    return scopes;
  }

  function findGraphCycles(document) {
    const output = [];
    documentGraphScopes(document).forEach(({ scope, edges }) => {
      const normalized = edges.map((edge) => ({
        from: String(edge?.from || "").trim(),
        to: String(edge?.to || "").trim()
      })).filter((edge) => edge.from && edge.to);
      stronglyConnectedCycles(normalized).forEach((nodeIds) => {
        output.push({
          scope: { ...scope },
          nodeIds: [...nodeIds],
          message: "循環する接続が含まれています。"
        });
      });
    });
    return output;
  }

  function validateConnection(model, source, target, options = {}) {
    if (!source || !target) {
      return { allowed: false, message: "Connection target is missing." };
    }
    if (source.key === target.key) {
      return { allowed: false, message: "A node cannot connect to itself." };
    }
    if (source.kind === "end") {
      return { allowed: false, message: "END cannot be a connection source." };
    }
    if (["start", "unassigned-start"].includes(target.kind)) {
      return { allowed: false, message: "START cannot be a connection target." };
    }

    const duplicateByKey = (Array.isArray(model?.edges) ? model.edges : []).some(
      (edge) => edge.sourceKey === source.key && edge.targetKey === target.key
    );
    if (duplicateByKey) {
      return { allowed: false, message: "This connection already exists." };
    }

    const sourceIdForPort = String(source?.ref?.node_id || "").trim();
    const targetLoopForPort = String(target?.step?.loop_owner_id || "").trim();
    if (source?.nodeType === "loop") {
      const sourcePort = String(source.connectionPort || "done");
      if (sourcePort === "loop" && targetLoopForPort !== sourceIdForPort) {
        return {
          allowed: false,
          message: "The loop output can connect only to nodes inside this loop."
        };
      }
      if (sourcePort === "done" && targetLoopForPort === sourceIdForPort) {
        return {
          allowed: false,
          message: "The done output cannot connect to nodes inside this loop."
        };
      }
    }

    const scope = resolveConnectionScope(source, target);
    if (!scope) {
      return {
        allowed: false,
        message: "Nodes in different graph scopes cannot be connected."
      };
    }
    const sourceId = logicalNodeId(source, scope, "source");
    const targetId = logicalNodeId(target, scope, "target");
    const duplicate = scopedEdges(model, scope).some(
      (edge) => edge.from === sourceId && edge.to === targetId
    );
    if (duplicate) {
      return { allowed: false, message: "This connection already exists." };
    }
    if (options.graphMode === "dag" && wouldCreateCycle(model, source, target)) {
      return { allowed: false, message: "循環する接続は作成できません。" };
    }
    return { allowed: true };
  }

  modules.buildWorkflowGraphModel = buildGraphModel;
  modules.normalizeWorkflowNodeMetrics = normalizeNodeMetrics;
  modules.workflowStepKey = stepKey;
  modules.workflowFlowNodeKey = flowNodeKey;
  modules.workflowGraphScopeForNode = graphScopeForNode;
  modules.resolveWorkflowConnectionScope = resolveConnectionScope;
  modules.workflowWouldCreateCycle = wouldCreateCycle;
  modules.findWorkflowGraphCycles = findGraphCycles;
  modules.validateWorkflowConnection = validateConnection;
})(window);

/* ===== internal: designer_fragments.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function selectedStepIds(document, selection) {
    const existing = new Set(
      (Array.isArray(document?.steps) ? document.steps : [])
        .map((step) => String(step?.step_id || "").trim())
        .filter(Boolean)
    );
    return new Set(
      modules.normalizeSelection(selection).nodes
        .map((ref) => String(ref.node_id || "").trim())
        .filter((id) => existing.has(id))
    );
  }

  function selectedFullFlowId(document, selection, stepIds) {
    const normalized = modules.normalizeSelection(selection);
    const terminalByFlow = new Map();
    normalized.nodes.forEach((ref) => {
      if (!ref.flow_id || !["START", "END"].includes(ref.node_id)) return;
      const nodes = terminalByFlow.get(ref.flow_id) || new Set();
      nodes.add(ref.node_id);
      terminalByFlow.set(ref.flow_id, nodes);
    });
    const candidates = Array.from(terminalByFlow.entries())
      .filter(([, terminals]) => terminals.has("START") && terminals.has("END"));
    if (candidates.length !== 1) return "";
    const flowId = candidates[0][0];
    const flowSteps = (Array.isArray(document?.steps) ? document.steps : [])
      .filter((step) => String(step?.flow_id || "") === flowId)
      .map((step) => String(step.step_id));
    return flowSteps.every((stepId) => stepIds.has(stepId)) ? flowId : "";
  }

  function edgeInside(edge, selectedIds) {
    const from = String(edge?.from || "").trim();
    const to = String(edge?.to || "").trim();
    return selectedIds.has(from) && selectedIds.has(to);
  }

  function collectPartialEdges(document, stepIds) {
    const edges = [];
    Object.entries(document?.flows || {}).forEach(([flowId, flow]) => {
      (Array.isArray(flow?.edges) ? flow.edges : []).forEach((edge) => {
        if (!edgeInside(edge, stepIds)) return;
        edges.push({
          scope: { flow_id: flowId },
          edge: modules.cloneValue(edge)
        });
      });
    });
    (Array.isArray(document?.unassigned?.edges)
      ? document.unassigned.edges
      : []
    ).forEach((edge) => {
      if (!edgeInside(edge, stepIds)) return;
      edges.push({
        scope: { graph_scope: "unassigned" },
        edge: modules.cloneValue(edge)
      });
    });
    return edges;
  }

  function collectLoopFlows(document, stepIds) {
    const output = {};
    Object.entries(document?.loop?.flows || {}).forEach(([ownerId, graph]) => {
      if (!stepIds.has(ownerId)) return;
      const edges = (Array.isArray(graph?.edges) ? graph.edges : [])
        .filter((edge) => {
          const from = String(edge?.from || "").trim();
          const to = String(edge?.to || "").trim();
          const fromIncluded = from === "START" || stepIds.has(from);
          const toIncluded = to === "END" || stepIds.has(to);
          return fromIncluded && toIncluded;
        })
        .map((edge) => modules.cloneValue(edge));
      output[ownerId] = {
        ...modules.cloneValue(graph),
        edges
      };
    });
    return output;
  }

  function collectNotes(document, selection) {
    const ids = new Set(modules.normalizeSelection(selection).annotation_ids);
    return (Array.isArray(document?.notes) ? document.notes : [])
      .filter((note) => ids.has(String(note?.note_id || "")))
      .map((note) => modules.cloneValue(note));
  }

  function copySelection(document, selection) {
    modules.assertWorkflowDocument(document);
    const stepIds = selectedStepIds(document, selection);
    const flowId = selectedFullFlowId(document, selection, stepIds);
    const notes = collectNotes(document, selection);

    if (flowId) {
      const steps = document.steps
        .filter((step) => String(step?.flow_id || "") === flowId)
        .map((step) => modules.cloneValue(step));
      return {
        fragment_version: 1,
        kind: "flow",
        source_document: modules.cloneValue(document),
        source_flow_id: flowId,
        flow: modules.cloneValue(document.flows[flowId]),
        steps,
        loop_flows: collectLoopFlows(document, new Set(
          steps.map((step) => String(step.step_id))
        )),
        notes
      };
    }

    const steps = (Array.isArray(document?.steps) ? document.steps : [])
      .filter((step) => stepIds.has(String(step?.step_id || "")))
      .map((step) => modules.cloneValue(step));
    return {
      fragment_version: 1,
      kind: "partial",
      source_document: modules.cloneValue(document),
      steps,
      edges: collectPartialEdges(document, stepIds),
      loop_flows: collectLoopFlows(document, stepIds),
      notes
    };
  }

  function assertFragment(value) {
    if (!value || typeof value !== "object") {
      throw new TypeError("graph fragment must be an object");
    }
    if (value.fragment_version !== 1) {
      throw new Error("unsupported graph fragment version");
    }
    if (!["flow", "partial"].includes(value.kind)) {
      throw new Error("unsupported graph fragment kind");
    }
    if (!Array.isArray(value.steps) || !Array.isArray(value.notes || [])) {
      throw new Error("graph fragment collections are invalid");
    }
    if (value.kind === "flow" && (!value.flow || typeof value.flow !== "object")) {
      throw new Error("flow fragment is missing its flow definition");
    }
  }

  modules.copyWorkflowSelection = copySelection;
  modules.assertWorkflowFragment = assertFragment;
})(window);

/* ===== internal: designer_clone.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  const DEFAULT_OFFSET = Object.freeze({ x: 48, y: 48 });

  function offsetPosition(value, offset) {
    const point = modules.normalizePosition(value, { x: 280, y: 160 });
    return { x: point.x + offset.x, y: point.y + offset.y };
  }

  function offsetNodePosition(value, offset, nodeGrid) {
    return modules.snapWorkflowPosition(offsetPosition(value, offset), nodeGrid);
  }

  function mapEdge(edge, stepIdMap) {
    const copy = modules.cloneValue(edge);
    const from = String(copy?.from || "").trim();
    const to = String(copy?.to || "").trim();
    if (stepIdMap[from]) copy.from = stepIdMap[from];
    if (stepIdMap[to]) copy.to = stepIdMap[to];
    return copy;
  }

  function mapToObject(map) {
    return Object.fromEntries(map.entries());
  }

  function cloneSteps(document, fragment, context) {
    const sourceSteps = fragment.steps || [];
    const allocated = sourceSteps.length
      ? context.idManager.allocate("step", sourceSteps.length, document)
      : [];
    const stepIdMap = new Map();
    sourceSteps.forEach((step, index) => {
      stepIdMap.set(String(step.step_id), allocated[index]);
    });
    const flowIdMap = new Map();
    if (context.targetFlowId && fragment.source_flow_id) {
      flowIdMap.set(String(fragment.source_flow_id), context.targetFlowId);
    }

    const steps = sourceSteps.map((sourceStep) => {
      const oldStepId = String(sourceStep.step_id);
      let clonedStep = modules.cloneValue(sourceStep);
      clonedStep.step_id = stepIdMap.get(oldStepId);
      clonedStep.ui_position = offsetNodePosition(
        sourceStep.ui_position,
        context.offset,
        context.nodeGrid
      );
      if (context.mode === "paste-partial") {
        delete clonedStep.flow_id;
      } else if (context.targetFlowId) {
        clonedStep.flow_id = context.targetFlowId;
      }
      const ownerId = String(sourceStep.loop_owner_id || "").trim();
      if (ownerId && stepIdMap.has(ownerId)) {
        clonedStep.loop_owner_id = stepIdMap.get(ownerId);
      } else if (ownerId && context.mode === "paste-partial") {
        delete clonedStep.loop_owner_id;
      }

      if (typeof context.referenceRewriter === "function") {
        const rewritten = context.referenceRewriter({
          clonedStep: modules.cloneValue(clonedStep),
          stepIdMap: mapToObject(stepIdMap),
          flowIdMap: mapToObject(flowIdMap),
          sourceDocument: modules.cloneValue(context.sourceDocument)
        });
        if (
          !rewritten ||
          typeof rewritten !== "object" ||
          Array.isArray(rewritten)
        ) {
          throw new Error("referenceRewriter must return a step object");
        }
        clonedStep = modules.cloneValue(rewritten);
        if (String(clonedStep.step_id || "") !== stepIdMap.get(oldStepId)) {
          throw new Error("referenceRewriter must preserve the allocated step_id");
        }
      }
      return clonedStep;
    });
    return { steps, stepIdMap, flowIdMap };
  }

  function cloneNotes(document, notes, idManager, offset) {
    if (!notes.length) return { notes: [], noteIds: [] };
    const noteIds = idManager.allocate("note", notes.length, document);
    return {
      noteIds,
      notes: notes.map((note, index) => ({
        ...modules.cloneValue(note),
        note_id: noteIds[index],
        ui_position: offsetPosition(note.ui_position, offset)
      }))
    };
  }

  function appendNotes(next, clonedNotes) {
    if (!clonedNotes.notes.length) return;
    const existing = Array.isArray(next.notes) ? next.notes : [];
    next.notes = [...existing, ...clonedNotes.notes];
  }

  function appendLoopFlows(next, loopFlows, stepIdMap) {
    const entries = Object.entries(loopFlows || {});
    if (!entries.length) return;
    next.loop = next.loop && typeof next.loop === "object" ? next.loop : {};
    next.loop.flows = next.loop.flows && typeof next.loop.flows === "object"
      ? next.loop.flows
      : {};
    entries.forEach(([ownerId, graph]) => {
      const newOwnerId = stepIdMap.get(String(ownerId));
      if (!newOwnerId) return;
      next.loop.flows[newOwnerId] = {
        ...modules.cloneValue(graph),
        edges: (Array.isArray(graph?.edges) ? graph.edges : [])
          .map((edge) => mapEdge(edge, mapToObject(stepIdMap)))
      };
    });
  }

  function pasteFlow(document, fragment, context) {
    const next = modules.cloneValue(document);
    const flowId = context.idManager.allocate("flow", 1, document)[0];
    const cloned = cloneSteps(document, fragment, {
      ...context,
      mode: "paste-flow",
      targetFlowId: flowId
    });
    const flow = modules.cloneValue(fragment.flow);
    flow.start = flow.start && typeof flow.start === "object" ? flow.start : {};
    flow.end = flow.end && typeof flow.end === "object" ? flow.end : {};
    flow.start.ui_position = offsetNodePosition(
      flow.start.ui_position,
      context.offset,
      context.nodeGrid
    );
    flow.end.ui_position = offsetNodePosition(
      flow.end.ui_position,
      context.offset,
      context.nodeGrid
    );
    flow.edges = (Array.isArray(flow.edges) ? flow.edges : [])
      .map((edge) => mapEdge(edge, mapToObject(cloned.stepIdMap)));

    next.steps = [...(Array.isArray(next.steps) ? next.steps : []), ...cloned.steps];
    next.flows = next.flows && typeof next.flows === "object" ? next.flows : {};
    next.flows[flowId] = flow;
    appendLoopFlows(next, fragment.loop_flows, cloned.stepIdMap);
    const notes = cloneNotes(document, fragment.notes || [], context.idManager, context.offset);
    appendNotes(next, notes);
    return {
      document: next,
      stepIdMap: cloned.stepIdMap,
      flowIdMap: new Map([[String(fragment.source_flow_id), flowId]]),
      selection: {
        nodes: [
          { node_id: "START", flow_id: flowId },
          { node_id: "END", flow_id: flowId },
          ...cloned.steps.map((step) => ({ node_id: step.step_id }))
        ],
        edges: [],
        annotation_ids: notes.noteIds
      }
    };
  }

  function ensureUnassigned(next, clonedSteps, context) {
    const existing = next.unassigned && typeof next.unassigned === "object"
      ? next.unassigned
      : null;
    if (existing) return existing;
    const minX = Math.min(...clonedSteps.map((step) => step.ui_position.x), 280);
    const minY = Math.min(...clonedSteps.map((step) => step.ui_position.y), 160);
    next.unassigned = {
      start: {
        ui_position: modules.snapWorkflowPosition({
          x: Math.max(24, minX - 184 + context.offset.x),
          y: minY
        }, context.nodeGrid)
      },
      step_ids: [],
      edges: []
    };
    return next.unassigned;
  }

  function pastePartial(document, fragment, context) {
    const next = modules.cloneValue(document);
    const cloned = cloneSteps(document, fragment, {
      ...context,
      mode: "paste-partial",
      targetFlowId: ""
    });
    next.steps = [...(Array.isArray(next.steps) ? next.steps : []), ...cloned.steps];
    if (cloned.steps.length) {
      const unassigned = ensureUnassigned(next, cloned.steps, context);
      const ids = cloned.steps.map((step) => step.step_id);
      unassigned.step_ids = [
        ...(Array.isArray(unassigned.step_ids) ? unassigned.step_ids : []),
        ...ids
      ];
      const mappedEdges = (fragment.edges || [])
        .map((item) => mapEdge(item.edge, mapToObject(cloned.stepIdMap)));
      unassigned.edges = [
        ...(Array.isArray(unassigned.edges) ? unassigned.edges : []),
        ...mappedEdges
      ];
    }
    appendLoopFlows(next, fragment.loop_flows, cloned.stepIdMap);
    const notes = cloneNotes(document, fragment.notes || [], context.idManager, context.offset);
    appendNotes(next, notes);
    return {
      document: next,
      stepIdMap: cloned.stepIdMap,
      flowIdMap: new Map(),
      selection: {
        nodes: cloned.steps.map((step) => ({ node_id: step.step_id })),
        edges: [],
        annotation_ids: notes.noteIds
      }
    };
  }

  function duplicatePartial(document, fragment, context) {
    const next = modules.cloneValue(document);
    const cloned = cloneSteps(document, fragment, {
      ...context,
      mode: "duplicate",
      targetFlowId: ""
    });
    next.steps = [...(Array.isArray(next.steps) ? next.steps : []), ...cloned.steps];
    const idMap = mapToObject(cloned.stepIdMap);
    (fragment.edges || []).forEach((item) => {
      const mapped = mapEdge(item.edge, idMap);
      if (item.scope?.flow_id && next.flows?.[item.scope.flow_id]) {
        const target = next.flows[item.scope.flow_id];
        target.edges = [...(Array.isArray(target.edges) ? target.edges : []), mapped];
      } else if (item.scope?.graph_scope === "unassigned") {
        const unassigned = ensureUnassigned(next, cloned.steps, context);
        unassigned.edges = [...(unassigned.edges || []), mapped];
      }
    });
    cloned.steps.forEach((step) => {
      if (step.flow_id) return;
      const unassigned = ensureUnassigned(next, cloned.steps, context);
      unassigned.step_ids = [...(unassigned.step_ids || []), step.step_id];
    });
    appendLoopFlows(next, fragment.loop_flows, cloned.stepIdMap);
    const notes = cloneNotes(document, fragment.notes || [], context.idManager, context.offset);
    appendNotes(next, notes);
    return {
      document: next,
      stepIdMap: cloned.stepIdMap,
      flowIdMap: new Map(),
      selection: {
        nodes: cloned.steps.map((step) => ({ node_id: step.step_id })),
        edges: [],
        annotation_ids: notes.noteIds
      }
    };
  }

  function cloneFragment(document, fragment, options = {}) {
    modules.assertWorkflowFragment(fragment);
    const context = {
      sourceDocument: options.sourceDocument || document,
      idManager: options.idManager,
      referenceRewriter: options.referenceRewriter,
      offset: modules.normalizePosition(options.offset, DEFAULT_OFFSET),
      nodeGrid: modules.normalizeWorkflowGrid(options.nodeGrid)
    };
    if (!context.idManager) throw new Error("id manager is required");
    if (fragment.kind === "flow") return pasteFlow(document, fragment, context);
    if (options.mode === "duplicate") {
      return duplicatePartial(document, fragment, context);
    }
    return pastePartial(document, fragment, context);
  }

  modules.cloneWorkflowFragment = cloneFragment;
})(window);

/* ===== internal: designer_selection.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function createSelectionController(controller) {
    function selectNode(node, preserveGroup = false) {
      const current = controller.getSelection();
      const key = modules.nodeRefKey(node.ref);
      const selected = new Set(current.nodes.map(modules.nodeRefKey));
      if (preserveGroup && current.nodes.length > 1 && selected.has(key)) return;
      controller.select({
        nodes: [modules.cloneValue(node.ref)],
        edges: [],
        annotation_ids: []
      }, "pointer");
    }

    function selectNodes(nodes, toggle = false) {
      const refs = [];
      const seen = new Set();
      (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        const ref = node?.ref || node;
        const key = modules.nodeRefKey(ref);
        if (!key || seen.has(key)) return;
        seen.add(key);
        refs.push(modules.cloneValue(ref));
      });

      if (!toggle) {
        controller.select({ nodes: refs, edges: [], annotation_ids: [] }, "rectangle");
        return;
      }

      const current = controller.getSelection();
      const byKey = new Map(
        current.nodes.map((ref) => [modules.nodeRefKey(ref), modules.cloneValue(ref)])
      );
      refs.forEach((ref) => {
        const key = modules.nodeRefKey(ref);
        if (byKey.has(key)) byKey.delete(key);
        else byKey.set(key, ref);
      });
      controller.select({
        nodes: [...byKey.values()],
        edges: modules.cloneValue(current.edges),
        annotation_ids: modules.cloneValue(current.annotation_ids)
      }, "rectangle.toggle");
    }

    function selectEdge(edge, additive) {
      const current = controller.getSelection();
      const key = modules.edgeRefKey(edge.ref);
      let edges = current.edges;
      if (additive) {
        const selected = new Set(edges.map(modules.edgeRefKey));
        edges = selected.has(key)
          ? edges.filter((ref) => modules.edgeRefKey(ref) !== key)
          : [...edges, modules.cloneValue(edge.ref)];
      } else {
        edges = [modules.cloneValue(edge.ref)];
      }
      controller.select({
        nodes: additive ? current.nodes : [],
        edges,
        annotation_ids: additive ? current.annotation_ids : []
      }, "pointer");
    }

    function selectNote(noteId, additive) {
      const current = controller.getSelection();
      let ids = current.annotation_ids;
      if (additive) {
        ids = ids.includes(noteId)
          ? ids.filter((id) => id !== noteId)
          : [...ids, noteId];
      } else {
        ids = [noteId];
      }
      controller.select({
        nodes: additive ? current.nodes : [],
        edges: additive ? current.edges : [],
        annotation_ids: ids
      }, "pointer");
    }

    return Object.freeze({ selectNode, selectNodes, selectEdge, selectNote });
  }

  modules.createWorkflowSelectionController = createSelectionController;
})(window);

/* ===== internal: designer_dom.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};
  const SVG_NS = "http://www.w3.org/2000/svg";

  function element(tagName, className, attributes = {}) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    Object.entries(attributes).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      node.setAttribute(name, String(value));
    });
    return node;
  }

  function svgElement(tagName, className, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tagName);
    if (className) node.setAttribute("class", className);
    Object.entries(attributes).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      node.setAttribute(name, String(value));
    });
    return node;
  }

  function toolbarButton(command, text, label) {
    const button = element("button", "zwd-tool", {
      type: "button",
      "data-zwd-command": command,
      "aria-label": label,
      title: label
    });
    button.textContent = text;
    return button;
  }

  function createShell(rootElement, commandLabels = {}) {
    if (!(rootElement instanceof HTMLElement)) {
      throw new TypeError("WorkflowDesigner root must be an HTMLElement");
    }
    rootElement.innerHTML = "";

    const shell = element("div", "zwd", {
      tabindex: "0",
      "data-workflow-designer": "",
      role: "application",
      "aria-label": commandLabels.designer || "Workflow designer"
    });
    shell.style.position = "relative";
    const toolbar = element("div", "zwd-toolbar", {
      role: "toolbar",
      "aria-label": commandLabels.canvasTools || "Workflow tools"
    });
    toolbar.style.position = "absolute";
    toolbar.style.top = "12px";
    toolbar.style.right = "12px";
    toolbar.style.zIndex = "30";
    toolbar.appendChild(toolbarButton(
      "viewport.zoom-in",
      "+",
      commandLabels.zoomIn || "Zoom in"
    ));
    toolbar.appendChild(toolbarButton(
      "viewport.zoom-out",
      "−",
      commandLabels.zoomOut || "Zoom out"
    ));
    toolbar.appendChild(toolbarButton(
      "history.redo",
      "↷",
      commandLabels.redo || "Redo"
    ));
    toolbar.appendChild(toolbarButton(
      "history.undo",
      "↶",
      commandLabels.undo || "Undo"
    ));
    const annotationModeButton = toolbarButton(
      "annotation.mode-toggle",
      "✎",
      commandLabels.annotationMode || "Annotation mode"
    );
    annotationModeButton.setAttribute("aria-pressed", "false");
    toolbar.appendChild(annotationModeButton);
    toolbar.appendChild(toolbarButton(
      "workflow.run",
      "▶",
      commandLabels.runWorkflow || "Run workflow"
    ));

    const viewport = element("div", "zwd-viewport", {
      tabindex: "0",
      "data-zwd-viewport": ""
    });
    viewport.style.position = "relative";
    const world = element("div", "zwd-world", { "data-zwd-world": "" });
    const frameLayer = element("div", "zwd-layer zwd-layer--frames");
    const edges = svgElement("svg", "zwd-layer zwd-layer--edges", {
      "aria-hidden": "true",
      overflow: "visible"
    });
    const defs = svgElement("defs");
    const marker = svgElement("marker", "", {
      id: `zwd-arrow-${Math.random().toString(36).slice(2)}`,
      markerWidth: "6.4",
      markerHeight: "6.4",
      refX: "5.6",
      refY: "3.2",
      orient: "auto",
      markerUnits: "strokeWidth"
    });
    marker.appendChild(svgElement("path", "zwd-arrow", { d: "M0,0 L6.4,3.2 L0,6.4 Z" }));
    defs.appendChild(marker);
    edges.appendChild(defs);
    edges.dataset.markerId = marker.id;
    const edgeGroup = svgElement("g", "zwd-edge-group");
    const connectionPreview = svgElement("path", "zwd-connection-preview", {
      hidden: "hidden"
    });
    edges.appendChild(edgeGroup);
    edges.appendChild(connectionPreview);

    const nodeLayer = element("div", "zwd-layer zwd-layer--nodes");
    const noteLayer = element("div", "zwd-layer zwd-layer--notes");
    world.appendChild(frameLayer);
    world.appendChild(edges);
    world.appendChild(nodeLayer);
    world.appendChild(noteLayer);
    viewport.appendChild(world);

    const selectionBox = element("div", "zwd-selection-box", {
      hidden: "hidden",
      "aria-hidden": "true"
    });
    selectionBox.style.position = "absolute";
    selectionBox.style.pointerEvents = "none";
    selectionBox.style.border = "1px dashed currentColor";
    selectionBox.style.background = "rgba(64, 128, 255, 0.12)";
    viewport.appendChild(selectionBox);

    const menu = element("div", "zwd-context-menu", {
      role: "menu",
      hidden: "hidden"
    });
    const message = element("div", "zwd-message", {
      role: "status",
      "aria-live": "polite",
      hidden: "hidden"
    });

    shell.appendChild(toolbar);
    shell.appendChild(viewport);
    shell.appendChild(menu);
    shell.appendChild(message);
    rootElement.appendChild(shell);
    return {
      rootElement,
      shell,
      toolbar,
      viewport,
      world,
      frameLayer,
      edges,
      edgeGroup,
      connectionPreview,
      nodeLayer,
      noteLayer,
      selectionBox,
      menu,
      message
    };
  }

  function isDomElement(value) {
    if (!value || typeof value !== "object") return false;
    if (typeof HTMLElement !== "undefined" && value instanceof HTMLElement) {
      return true;
    }
    return typeof SVGElement !== "undefined" && value instanceof SVGElement;
  }

  function createDefaultNodeContent(node, iconElement = null) {
    const content = element("div", "zwd-node__content");

    if (node.kind === "step") {
      const visual = element("div", "zwd-node__visual");
      const icon = element("div", "zwd-node__icon", {
        hidden: iconElement ? null : "hidden",
        "aria-hidden": "true"
      });
      if (iconElement) icon.appendChild(iconElement);
      visual.appendChild(icon);

      const label = element("div", "zwd-node__label");
      label.textContent = String(node.label || node.ref?.node_id || "");

      const descriptionText = String(node.step?.description || "").trim();
      const description = element("div", "zwd-node__description", {
        hidden: descriptionText ? null : "hidden"
      });
      description.textContent = descriptionText;

      content.appendChild(visual);
      content.appendChild(label);
      content.appendChild(description);
      return content;
    }

    if (node.kind === "start" || node.kind === "end") {
      const visual = element("div", "zwd-node__visual", {
        "aria-hidden": "true"
      });
      const label = element("div", "zwd-node__label");
      label.textContent = String(node.label || node.ref?.node_id || "");
      content.appendChild(visual);
      content.appendChild(label);
      return content;
    }

    const label = element("div", "zwd-node__label");
    label.textContent = String(node.label || node.ref?.node_id || "");
    content.appendChild(label);
    return content;
  }


  function createNodePorts(node) {
    let definitions = [];
    if (node.kind === "step") {
      definitions = node.nodeType === "loop"
        ? [
            { role: "enter" },
            { role: "return" },
            { role: "done", label: "done" },
            { role: "loop", label: "loop" }
          ]
        : [{ role: "in" }, { role: "out" }];
    } else if (node.nodeType === "start") {
      definitions = [{ role: "out" }];
    } else if (node.nodeType === "end") {
      definitions = [{ role: "in" }];
    }
    if (!definitions.length) return null;

    const ports = element("div", "zwd-node__ports", {
      "aria-hidden": "true"
    });
    definitions.forEach(({ role, label: text }) => {
      const port = element(
        "span",
        `zwd-node__port zwd-node__port--${role}`,
        { "data-zwd-port-role": role }
      );
      if (text) {
        const label = element("span", "zwd-node__port-label");
        label.textContent = text;
        port.appendChild(label);
      }
      ports.appendChild(port);
    });
    return ports;
  }

  function createNodeElement(node, renderer, context) {
    const wrapper = element("div", `zwd-node zwd-node--${node.kind}`, {
      tabindex: "0",
      role: "button",
      "data-node-key": node.key,
      "data-node-id": node.ref.node_id,
      "data-node-type": node.nodeType,
      "data-readonly": context.readonly ? "true" : "false",
      "aria-label": String(node.label || node.ref.node_id)
    });
    wrapper.style.left = `${node.x}px`;
    wrapper.style.top = `${node.y}px`;
    wrapper.style.width = `${node.width}px`;
    wrapper.style.height = `${node.height}px`;

    let rendered = null;
    if (renderer && typeof renderer.render === "function") {
      rendered = renderer.render(node.step || node, context);
      if (!isDomElement(rendered)) {
        throw new TypeError("node renderer must return an HTMLElement or SVGElement");
      }
    }

    let icon = null;
    if (!rendered && renderer && typeof renderer.renderIcon === "function") {
      icon = renderer.renderIcon(node.step || node, context);
      if (icon !== null && icon !== undefined && !isDomElement(icon)) {
        throw new TypeError("node icon renderer must return an HTMLElement or SVGElement");
      }
    }
    wrapper.appendChild(rendered || createDefaultNodeContent(node, icon));
    const ports = createNodePorts(node);
    if (ports) wrapper.appendChild(ports);

    const status = element("span", "zwd-node__status", {
      hidden: "hidden",
      "aria-live": "polite"
    });
    const validation = element("span", "zwd-node__validation", {
      hidden: "hidden",
      "aria-label": "Validation"
    });
    validation.textContent = "!";
    wrapper.appendChild(status);
    wrapper.appendChild(validation);
    return wrapper;
  }

  function createLoopFrame(frame) {
    const wrapper = element("div", "zwd-loop-frame", {
      "data-loop-owner-id": frame.ownerId
    });
    wrapper.style.left = `${frame.x}px`;
    wrapper.style.top = `${frame.y}px`;
    wrapper.style.width = `${frame.width}px`;
    wrapper.style.height = `${frame.height}px`;
    const label = element("div", "zwd-loop-frame__label");
    label.textContent = String(frame.label || frame.ownerId);
    wrapper.appendChild(label);
    return wrapper;
  }

  modules.createWorkflowDesignerShell = createShell;
  modules.createWorkflowNodeElement = createNodeElement;
  modules.createWorkflowLoopFrame = createLoopFrame;
  modules.createWorkflowSvgElement = svgElement;
  modules.createWorkflowElement = element;
})(window);

/* ===== internal: designer_note_dom.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function appendTextWithLinks(container, text) {
    const value = String(text || "");
    const pattern = /https?:\/\/[^\s<>"']+/g;
    let cursor = 0;
    let match = pattern.exec(value);
    while (match) {
      if (match.index > cursor) {
        container.appendChild(document.createTextNode(value.slice(cursor, match.index)));
      }
      const link = modules.createWorkflowElement("a", "zwd-note__link", {
        href: match[0],
        "data-external-url": match[0]
      });
      link.textContent = match[0];
      container.appendChild(link);
      cursor = match.index + match[0].length;
      match = pattern.exec(value);
    }
    if (cursor < value.length) {
      container.appendChild(document.createTextNode(value.slice(cursor)));
    }
  }

  function createNoteElement(note, readonly) {
    const element = modules.createWorkflowElement;
    const wrapper = element("article", "zwd-note", {
      tabindex: "0",
      "data-note-id": note.noteId,
      "data-readonly": readonly ? "true" : "false",
      "aria-label": `Note ${note.noteId}`
    });
    wrapper.style.left = `${note.x}px`;
    wrapper.style.top = `${note.y}px`;
    wrapper.style.width = `${note.width}px`;
    wrapper.style.height = `${note.height}px`;
    const noteColor = String(note.note.color || "").trim();
    if (noteColor) wrapper.style.setProperty("--zwd-note-color", noteColor);

    const header = element("div", "zwd-note__header", {
      "data-note-drag-handle": ""
    });
    const id = element("span", "zwd-note__id");
    id.textContent = String(note.noteId);
    const colorAttributes = {
      type: "color",
      "data-note-color": note.noteId,
      "aria-label": "Note color"
    };
    if (/^#[0-9a-f]{6}$/i.test(noteColor)) colorAttributes.value = noteColor;
    if (readonly) colorAttributes.disabled = "";
    const color = element("input", "zwd-note__color", colorAttributes);
    header.appendChild(id);
    header.appendChild(color);

    const body = element("div", "zwd-note__body", {
      tabindex: "0",
      "data-note-body": note.noteId
    });
    appendTextWithLinks(body, note.note.text);
    const resize = element("button", "zwd-note__resize", {
      type: "button",
      tabindex: "-1",
      "data-note-resize": note.noteId,
      "aria-label": "Resize note"
    });
    if (readonly) resize.disabled = true;
    wrapper.appendChild(header);
    wrapper.appendChild(body);
    wrapper.appendChild(resize);
    return wrapper;
  }

  modules.createWorkflowNoteElement = createNoteElement;
  modules.appendWorkflowTextWithLinks = appendTextWithLinks;
})(window);

/* ===== internal: designer_feedback.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function createFeedback(shell) {
    let messageTimer = 0;

    function showMessage(text, level = "info") {
      window.clearTimeout(messageTimer);
      shell.message.textContent = String(text || "");
      shell.message.dataset.level = String(level || "info");
      shell.message.hidden = !shell.message.textContent;
      if (!shell.message.hidden) {
        messageTimer = window.setTimeout(() => {
          shell.message.hidden = true;
        }, 3200);
      }
    }

    function showContextMenu(items, point) {
      shell.menu.innerHTML = "";
      (Array.isArray(items) ? items : []).forEach((item) => {
        const button = modules.createWorkflowElement(
          "button",
          "zwd-context-menu__item",
          {
            type: "button",
            role: "menuitem",
            "data-context-command": item.commandId
          }
        );
        button.textContent = String(item.label || item.commandId);
        if (item.value !== undefined && item.value !== null) {
          const value = String(item.value);
          button.setAttribute("data-context-value", value);
          button.style.setProperty("--zwd-context-value", value);
        }
        shell.menu.appendChild(button);
      });
      shell.menu.style.left = `${point.x}px`;
      shell.menu.style.top = `${point.y}px`;
      shell.menu.hidden = !shell.menu.childElementCount;
    }

    function hideContextMenu() {
      shell.menu.hidden = true;
    }

    function destroy() {
      window.clearTimeout(messageTimer);
      shell.menu.innerHTML = "";
      shell.message.hidden = true;
    }

    return Object.freeze({
      showMessage,
      showContextMenu,
      hideContextMenu,
      destroy
    });
  }

  modules.createWorkflowFeedback = createFeedback;
})(window);

/* ===== internal: designer_render.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function movedNode(node, movedKeys, dx, dy) {
    if (!movedKeys?.has?.(node.key)) return node;
    return {
      ...node,
      x: node.x + dx,
      y: node.y + dy
    };
  }

  function nodeAnchor(node, port) {
    if (typeof modules.workflowNodeAnchor === "function") {
      return modules.workflowNodeAnchor(node, port);
    }
    const relative = node?.anchors?.[port];
    return {
      x: Number(node?.x || 0) + Number(
        relative?.x ?? (port === "in" ? 0 : node?.width || 0)
      ),
      y: Number(node?.y || 0) + Number(
        relative?.y ?? (Number(node?.height || 0) / 2)
      )
    };
  }

  const EDGE_CORNER_RADIUS = 8;
  const EDGE_STUB = 32;
  const EDGE_ESCAPE = 48;

  function formatCoordinate(value) {
    const number = Number(value) || 0;
    return Number.isInteger(number)
      ? String(number)
      : String(Math.round(number * 1000) / 1000);
  }

  function samePoint(left, right) {
    return left.x === right.x && left.y === right.y;
  }

  function collinear(left, middle, right) {
    return (left.x === middle.x && middle.x === right.x) ||
      (left.y === middle.y && middle.y === right.y);
  }

  function compactOrthogonalPoints(points) {
    const compact = [];
    points.forEach((point) => {
      const normalized = {
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0
      };
      if (!compact.length || !samePoint(compact[compact.length - 1], normalized)) {
        compact.push(normalized);
      }
    });
    let changed = true;
    while (changed && compact.length > 2) {
      changed = false;
      for (let index = 1; index < compact.length - 1; index += 1) {
        if (!collinear(compact[index - 1], compact[index], compact[index + 1])) {
          continue;
        }
        compact.splice(index, 1);
        changed = true;
        break;
      }
    }
    return compact;
  }

  function roundedPathFromPoints(points, radius = EDGE_CORNER_RADIUS) {
    const compact = compactOrthogonalPoints(points);
    if (!compact.length) return "";
    const commands = [
      `M ${formatCoordinate(compact[0].x)} ${formatCoordinate(compact[0].y)}`
    ];
    if (compact.length === 1) return commands.join(" ");

    for (let index = 1; index < compact.length - 1; index += 1) {
      const previous = compact[index - 1];
      const current = compact[index];
      const next = compact[index + 1];
      const incomingLength = Math.hypot(
        current.x - previous.x,
        current.y - previous.y
      );
      const outgoingLength = Math.hypot(
        next.x - current.x,
        next.y - current.y
      );
      const cornerRadius = Math.min(
        radius,
        incomingLength / 2,
        outgoingLength / 2
      );
      if (!cornerRadius) {
        commands.push(`L ${formatCoordinate(current.x)} ${formatCoordinate(current.y)}`);
        continue;
      }
      const before = {
        x: current.x + ((previous.x - current.x) / incomingLength) * cornerRadius,
        y: current.y + ((previous.y - current.y) / incomingLength) * cornerRadius
      };
      const after = {
        x: current.x + ((next.x - current.x) / outgoingLength) * cornerRadius,
        y: current.y + ((next.y - current.y) / outgoingLength) * cornerRadius
      };
      commands.push(
        `L ${formatCoordinate(before.x)} ${formatCoordinate(before.y)}`,
        `Q ${formatCoordinate(current.x)} ${formatCoordinate(current.y)} ` +
          `${formatCoordinate(after.x)} ${formatCoordinate(after.y)}`
      );
    }

    const last = compact[compact.length - 1];
    commands.push(`L ${formatCoordinate(last.x)} ${formatCoordinate(last.y)}`);
    return commands.join(" ");
  }

  function roundedOrthogonalPath(sourcePoint, targetPoint) {
    const source = {
      x: Number(sourcePoint?.x) || 0,
      y: Number(sourcePoint?.y) || 0
    };
    const target = {
      x: Number(targetPoint?.x) || 0,
      y: Number(targetPoint?.y) || 0
    };
    const horizontalGap = target.x - source.x;
    const verticalGap = target.y - source.y;
    let points;

    if (horizontalGap >= 0) {
      if (verticalGap === 0) {
        points = [source, target];
      } else {
        const middleX = (source.x + target.x) / 2;
        points = [
          source,
          { x: middleX, y: source.y },
          { x: middleX, y: target.y },
          target
        ];
      }
    } else {
      const routeY = target.y >= source.y
        ? Math.max(source.y, target.y) + EDGE_ESCAPE
        : Math.min(source.y, target.y) - EDGE_ESCAPE;
      points = [
        source,
        { x: source.x + EDGE_STUB, y: source.y },
        { x: source.x + EDGE_STUB, y: routeY },
        { x: target.x - EDGE_STUB, y: routeY },
        { x: target.x - EDGE_STUB, y: target.y },
        target
      ];
    }
    return roundedPathFromPoints(points);
  }

  function edgePath(edge, source, target) {
    return roundedOrthogonalPath(
      nodeAnchor(source, edge.sourcePort || "out"),
      nodeAnchor(target, edge.targetPort || "in")
    );
  }

  function previewEdgePath(edge, source, target, movedKeys, dx, dy) {
    return edgePath(
      edge,
      movedNode(source, movedKeys, dx, dy),
      movedNode(target, movedKeys, dx, dy)
    );
  }

  function rendererFor(node, renderers) {
    if (!renderers || typeof renderers !== "object") return null;
    return renderers[node.nodeType] || renderers.default || null;
  }

  function statusText(value) {
    return {
      waiting: "Waiting",
      running: "Running",
      success: "Success",
      error: "ERROR",
      skipped: "Skipped",
      idle: ""
    }[value] || "";
  }

  function createRenderer(shell) {
    let model = null;
    let nodeElements = new Map();
    let edgeElements = new Map();
    let edgeModelsByKey = new Map();
    let incidentEdgeKeysByNode = new Map();
    let noteElements = new Map();
    let movePreview = null;
    let movePreviewFrame = 0;
    let previewNodeKeys = new Set();
    const feedback = modules.createWorkflowFeedback(shell);
    const requestFrame = typeof root.requestAnimationFrame === "function"
      ? root.requestAnimationFrame.bind(root)
      : (callback) => root.setTimeout(callback, 16);
    const cancelFrame = typeof root.cancelAnimationFrame === "function"
      ? root.cancelAnimationFrame.bind(root)
      : root.clearTimeout.bind(root);

    function clearLayer(layer) {
      while (layer.firstChild) layer.firstChild.remove();
    }

    function renderFrames() {
      clearLayer(shell.frameLayer);
      model.loopFrames.forEach((frame) => {
        shell.frameLayer.appendChild(modules.createWorkflowLoopFrame(frame));
      });
    }

    function renderEdges() {
      clearLayer(shell.edgeGroup);
      edgeElements = new Map();
      edgeModelsByKey = new Map();
      incidentEdgeKeysByNode = new Map();
      const markerId = shell.edges.dataset.markerId;
      model.edges.forEach((edge) => {
        const source = model.nodeByKey.get(edge.sourceKey);
        const target = model.nodeByKey.get(edge.targetKey);
        if (!source || !target) return;
        const group = modules.createWorkflowSvgElement("g", "zwd-edge", {
          "data-edge-key": edge.key,
          "data-edge-scope": edge.ref.flow_id
            ? "flow"
            : (edge.ref.loop_owner_id ? "loop" : "unassigned")
        });
        const visible = modules.createWorkflowSvgElement("path", "zwd-edge__line", {
          d: edgePath(edge, source, target),
          "marker-end": `url(#${markerId})`
        });
        const hit = modules.createWorkflowSvgElement("path", "zwd-edge__hit", {
          d: edgePath(edge, source, target)
        });
        group.appendChild(visible);
        group.appendChild(hit);
        shell.edgeGroup.appendChild(group);
        edgeElements.set(edge.key, group);
        edgeModelsByKey.set(edge.key, edge);
        [edge.sourceKey, edge.targetKey].forEach((nodeKey) => {
          const keys = incidentEdgeKeysByNode.get(nodeKey) || new Set();
          keys.add(edge.key);
          incidentEdgeKeysByNode.set(nodeKey, keys);
        });
      });
    }

    function renderNodes(renderers, readonly) {
      clearLayer(shell.nodeLayer);
      nodeElements = new Map();
      model.nodes.forEach((node) => {
        const context = Object.freeze({
          nodeRef: modules.cloneValue(node.ref),
          nodeType: node.nodeType,
          kind: node.kind,
          readonly: !!readonly
        });
        const wrapper = modules.createWorkflowNodeElement(
          node,
          rendererFor(node, renderers),
          context
        );
        shell.nodeLayer.appendChild(wrapper);
        nodeElements.set(node.key, wrapper);
      });
    }

    function renderNotes(readonly) {
      clearLayer(shell.noteLayer);
      noteElements = new Map();
      model.notes.forEach((note) => {
        const wrapper = modules.createWorkflowNoteElement(note, readonly);
        shell.noteLayer.appendChild(wrapper);
        noteElements.set(note.noteId, wrapper);
      });
    }

    function cancelMovePreviewFrame() {
      if (!movePreviewFrame) return;
      cancelFrame(movePreviewFrame);
      movePreviewFrame = 0;
    }

    function renderDocument(nextModel, options = {}) {
      cancelMovePreviewFrame();
      movePreview = null;
      previewNodeKeys = new Set();
      model = nextModel;
      const width = Math.max(2400, model.bounds.x + model.bounds.width + 480);
      const height = Math.max(1600, model.bounds.y + model.bounds.height + 360);
      shell.world.style.width = `${width}px`;
      shell.world.style.height = `${height}px`;
      shell.edges.setAttribute("width", String(width));
      shell.edges.setAttribute("height", String(height));
      renderFrames();
      renderEdges();
      renderNodes(options.nodeRenderers, options.readonly);
      renderNotes(options.readonly);
      applySelection(options.selection);
      applyStatus(options.status);
      applyAnnotationMode(options.annotationMode);
    }

    function applySelection(selection) {
      const normalized = modules.normalizeSelection(selection);
      const selectedNodes = new Set(normalized.nodes.map(modules.nodeRefKey));
      const selectedEdges = new Set(normalized.edges.map(modules.edgeRefKey));
      const selectedNotes = new Set(normalized.annotation_ids);
      nodeElements.forEach((element, key) => {
        element.dataset.selected = selectedNodes.has(key) ? "true" : "false";
      });
      edgeElements.forEach((element, key) => {
        element.dataset.selected = selectedEdges.has(key) ? "true" : "false";
      });
      noteElements.forEach((element, key) => {
        element.dataset.selected = selectedNotes.has(key) ? "true" : "false";
      });
    }

    function applyStatus(status) {
      const normalized = modules.normalizeStatus(status);
      if (!model) return;
      model.nodes.forEach((node) => {
        const wrapper = nodeElements.get(node.key);
        if (!wrapper) return;
        const nodeId = String(node.ref.node_id || "");
        const value = normalized.nodeStatus[node.key] ||
          normalized.nodeStatus[nodeId] ||
          "idle";
        wrapper.dataset.runStatus = value;
        const label = wrapper.querySelector(".zwd-node__status");
        if (label) {
          label.textContent = statusText(value);
          label.hidden = !label.textContent;
        }
        const entries = normalized.validation[node.key] ||
          normalized.validation[nodeId] ||
          [];
        const validation = wrapper.querySelector(".zwd-node__validation");
        const level = entries.some((entry) => entry.level === "error")
          ? "error"
          : (entries.length ? "warning" : "");
        if (level) wrapper.dataset.validationLevel = level;
        else delete wrapper.dataset.validationLevel;
        if (validation) {
          validation.hidden = !entries.length;
          validation.title = entries.map((entry) => entry.message).join("\n");
        }
      });
    }

    function applyViewport(viewport) {
      const value = modules.normalizeViewport(viewport);
      shell.world.style.transform =
        `translate(${value.x}px, ${value.y}px) scale(${value.zoom})`;
    }

    function applyAnnotationMode(active) {
      const enabled = !!active;
      if (shell.shell?.dataset) {
        shell.shell.dataset.annotationMode = enabled ? "active" : "inactive";
      }
      const toggle = shell.toolbar?.querySelector?.(
        '[data-zwd-command="annotation.mode-toggle"]'
      );
      toggle?.setAttribute("aria-pressed", enabled ? "true" : "false");
      const noteControls = shell.noteLayer?.querySelectorAll?.(
        "[data-note-color], [data-note-resize]"
      ) || [];
      noteControls.forEach((control) => {
        control.disabled = !enabled;
        control.setAttribute("aria-disabled", enabled ? "false" : "true");
      });
    }

    function nodeCenter(nodeKey, port = "out") {
      const node = model?.nodeByKey.get(nodeKey);
      return node ? nodeAnchor(node, port) : null;
    }

    function showConnection(sourceKey, targetPoint, sourcePort = "out") {
      const source = nodeCenter(sourceKey, sourcePort);
      if (!source || !targetPoint) return;
      shell.connectionPreview.setAttribute(
        "d",
        roundedOrthogonalPath(source, targetPoint)
      );
      shell.connectionPreview.hidden = false;
    }

    function hideConnection() {
      shell.connectionPreview.hidden = true;
      shell.connectionPreview.removeAttribute("d");
    }

    function setPreviewTransform(keys, dx, dy) {
      const keySet = new Set(keys || []);
      nodeElements.forEach((element, key) => {
        element.style.transform = keySet.has(key)
          ? `translate(${dx}px, ${dy}px)`
          : "";
      });
    }

    function setEdgeElementPath(group, path) {
      if (!group) return;
      Array.from(group.children || []).forEach((element) => {
        if (typeof element.setAttribute === "function") {
          element.setAttribute("d", path);
        }
      });
    }

    function canonicalEdgePath(edge) {
      const source = model?.nodeByKey.get(edge.sourceKey);
      const target = model?.nodeByKey.get(edge.targetKey);
      return source && target ? edgePath(edge, source, target) : "";
    }

    function applyNodeMovePreview() {
      movePreviewFrame = 0;
      if (!movePreview || !model) return;
      const nextKeys = new Set(movePreview.keys);
      const affectedNodeKeys = new Set([...previewNodeKeys, ...nextKeys]);
      affectedNodeKeys.forEach((key) => {
        const element = nodeElements.get(key);
        if (!element) return;
        element.style.transform = nextKeys.has(key)
          ? `translate(${movePreview.dx}px, ${movePreview.dy}px)`
          : "";
      });
      const affectedEdgeKeys = new Set();
      affectedNodeKeys.forEach((nodeKey) => {
        incidentEdgeKeysByNode.get(nodeKey)?.forEach((edgeKey) => {
          affectedEdgeKeys.add(edgeKey);
        });
      });
      affectedEdgeKeys.forEach((edgeKey) => {
        const edge = edgeModelsByKey.get(edgeKey);
        if (!edge) return;
        const source = model.nodeByKey.get(edge.sourceKey);
        const target = model.nodeByKey.get(edge.targetKey);
        if (!source || !target) return;
        const moving = nextKeys.has(edge.sourceKey) || nextKeys.has(edge.targetKey);
        const path = moving
          ? previewEdgePath(
            edge,
            source,
            target,
            nextKeys,
            movePreview.dx,
            movePreview.dy
          )
          : edgePath(edge, source, target);
        setEdgeElementPath(edgeElements.get(edge.key), path);
      });
      previewNodeKeys = nextKeys;
    }

    function setNodeMovePreview(keys, dx, dy) {
      movePreview = {
        keys: Array.from(new Set(keys || [])),
        dx: Number(dx) || 0,
        dy: Number(dy) || 0
      };
      if (movePreviewFrame) return;
      movePreviewFrame = requestFrame(applyNodeMovePreview);
    }

    function clearNodeMovePreview() {
      cancelMovePreviewFrame();
      movePreview = null;
      nodeElements.forEach((element) => {
        element.style.transform = "";
      });
      if (model) {
        model.edges.forEach((edge) => {
          const path = canonicalEdgePath(edge);
          if (path) setEdgeElementPath(edgeElements.get(edge.key), path);
        });
      }
      previewNodeKeys = new Set();
    }

    function showSelectionBox(start, current) {
      const box = shell.selectionBox;
      if (!box || !start || !current) return;
      const left = Math.min(start.x, current.x);
      const top = Math.min(start.y, current.y);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${Math.abs(current.x - start.x)}px`;
      box.style.height = `${Math.abs(current.y - start.y)}px`;
      box.hidden = false;
    }

    function hideSelectionBox() {
      if (!shell.selectionBox) return;
      shell.selectionBox.hidden = true;
      shell.selectionBox.style.width = "0px";
      shell.selectionBox.style.height = "0px";
    }

    function setNotePreview(noteId, values = {}) {
      const note = noteElements.get(String(noteId || ""));
      if (!note) return;
      if (Number.isFinite(values.dx) || Number.isFinite(values.dy)) {
        note.style.transform =
          `translate(${Number(values.dx) || 0}px, ${Number(values.dy) || 0}px)`;
      }
      if (Number.isFinite(values.width)) note.style.width = `${values.width}px`;
      if (Number.isFinite(values.height)) note.style.height = `${values.height}px`;
    }

    function clearPreviews() {
      clearNodeMovePreview();
      noteElements.forEach((element) => {
        element.style.transform = "";
      });
      hideConnection();
      hideSelectionBox();
    }

    function destroy() {
      cancelMovePreviewFrame();
      feedback.destroy();
      shell.rootElement.innerHTML = "";
      model = null;
      nodeElements.clear();
      edgeElements.clear();
      edgeModelsByKey.clear();
      incidentEdgeKeysByNode.clear();
      noteElements.clear();
    }

    return Object.freeze({
      renderDocument,
      applySelection,
      applyStatus,
      applyViewport,
      applyAnnotationMode,
      showConnection,
      hideConnection,
      setPreviewTransform,
      setNodeMovePreview,
      showSelectionBox,
      hideSelectionBox,
      setNotePreview,
      clearPreviews,
      showMessage: feedback.showMessage,
      showContextMenu: feedback.showContextMenu,
      hideContextMenu: feedback.hideContextMenu,
      getNodeElement: (key) => nodeElements.get(key) || null,
      getNoteElement: (id) => noteElements.get(id) || null,
      getModel: () => model,
      destroy
    });
  }

  modules.workflowRoundedOrthogonalPath = roundedOrthogonalPath;
  modules.workflowPreviewEdgePath = previewEdgePath;
  modules.createWorkflowRenderer = createRenderer;
})(window);

/* ===== internal: designer_note_edit.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function operationFor(document, path, value) {
    const current = modules.getDocumentPathValue(document, path);
    return {
      op: current.exists ? "replace" : "add",
      path: modules.cloneValue(path),
      value
    };
  }

  function noteColorOperations(document, note, value) {
    return [operationFor(document, note.colorPath, String(value || ""))];
  }

  function createNoteEditor(renderer, controller) {
    let active = null;

    function close({ commit = false } = {}) {
      if (!active) return;
      const current = active;
      active = null;
      current.textarea.removeEventListener("keydown", current.onKeyDown);
      current.textarea.removeEventListener("blur", current.onBlur);
      if (commit && current.textarea.value !== current.originalText) {
        controller.commit([
          operationFor(
            controller.getDocument(),
            current.note.textPath,
            current.textarea.value
          )
        ], "annotation.text");
        return;
      }
      controller.refresh();
    }

    function begin(noteId, body) {
      if (controller.isReadonly() || !controller.getAnnotationMode()) return;
      close();
      const note = renderer.getModel()?.notes
        .find((item) => item.noteId === String(noteId || ""));
      if (!note || !(body instanceof HTMLElement)) return;

      const textarea = modules.createWorkflowElement("textarea", "zwd-note__editor", {
        "aria-label": `Edit note ${note.noteId}`
      });
      const originalText = String(note.note.text || "");
      textarea.value = originalText;
      body.innerHTML = "";
      body.appendChild(textarea);
      body.dataset.editing = "true";

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close({ commit: false });
        } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          close({ commit: true });
        }
      };
      const onBlur = () => close({ commit: true });
      active = { note, textarea, originalText, onKeyDown, onBlur };
      textarea.addEventListener("keydown", onKeyDown);
      textarea.addEventListener("blur", onBlur);
      textarea.focus();
      textarea.setSelectionRange(originalText.length, originalText.length);
    }

    function setColor(noteId, value) {
      if (controller.isReadonly() || !controller.getAnnotationMode()) return;
      const note = renderer.getModel()?.notes
        .find((item) => item.noteId === String(noteId || ""));
      if (!note) return;
      controller.commit(
        noteColorOperations(controller.getDocument(), note, value),
        "annotation.color"
      );
    }

    return Object.freeze({ begin, close, setColor });
  }

  modules.workflowNoteColorOperations = noteColorOperations;
  modules.createWorkflowNoteEditor = createNoteEditor;
})(window);

/* ===== internal: designer_commands.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function createCommandInteraction(shell, renderer, controller, selection) {
    const cleanup = [];
    let contextTarget = null;

    function listen(target, eventName, handler, options) {
      target.addEventListener(eventName, handler, options);
      cleanup.push(() => target.removeEventListener(eventName, handler, options));
    }

    function annotationItems(target) {
      const labels = controller.getCommandLabels();
      if (controller.isReadonly()) return [];
      if (target?.kind === "note") {
        return controller.getNoteColors().map((color) => ({
          commandId: "annotation.color",
          label: color,
          value: color
        }));
      }
      return [{
        commandId: "annotation.add",
        label: labels.addNote || "Add sticky note"
      }];
    }

    function contextItems(target) {
      // Annotation mode is note-edit only, so it owns the whole menu and does
      // not consult the host's node-oriented context actions.
      if (controller.getAnnotationMode()) return annotationItems(target);
      const configured = controller.getContextActions?.(target);
      if (configured !== null && configured !== undefined) return configured;
      const labels = controller.getCommandLabels();
      if (target?.kind === "selection") {
        return controller.isReadonly() ? [] : [
          { commandId: "selection.duplicate", label: labels.duplicate || "Duplicate" },
          { commandId: "selection.delete", label: labels.deleteNodes || "Delete selected nodes" }
        ];
      }
      if (target?.kind === "edge") {
        return controller.isReadonly()
          ? []
          : [{ commandId: "selection.delete", label: labels.delete || "Delete" }];
      }
      if (target?.kind === "node") {
        const items = [
          { commandId: "node.open", label: labels.open || "Open" },
          { commandId: "node.run", label: labels.run || "Run" }
        ];
        if (!controller.isReadonly()) items.push(
          { commandId: "selection.duplicate", label: labels.duplicate || "Duplicate" },
          { commandId: "selection.delete", label: labels.deleteNode || "Delete node" }
        );
        return items;
      }
      if (target?.kind === "note") return [];
      return controller.isReadonly() ? [] : [
        { commandId: "node.add", label: labels.addNode || "Add node" },
        { commandId: "workflow.run", label: labels.runWorkflow || "Run workflow" }
      ];
    }

    function canvasPoint(event) {
      const rect = shell.viewport.getBoundingClientRect();
      const viewport = controller.getViewport();
      return {
        x: (event.clientX - rect.left - viewport.x) / viewport.zoom,
        y: (event.clientY - rect.top - viewport.y) / viewport.zoom
      };
    }

    function onContextMenu(event) {
      event.preventDefault();
      const annotationMode = controller.getAnnotationMode();
      // While annotation mode is ON, nodes and edges are inert: a right-click
      // on them falls through to the canvas so the note lands under the
      // pointer.
      const nodeElement = annotationMode
        ? null
        : event.target.closest("[data-node-key]");
      const noteElement = annotationMode
        ? event.target.closest("[data-note-id]")
        : null;
      const edgeElement = annotationMode
        ? null
        : event.target.closest("[data-edge-key]");

      if (nodeElement) {
        const node = renderer.getModel()?.nodeByKey.get(nodeElement.dataset.nodeKey);
        if (!node) contextTarget = null;
        else {
          const current = controller.getSelection();
          const selected = new Set(current.nodes.map(modules.nodeRefKey));
          if (current.nodes.length > 1 && selected.has(node.key)) {
            contextTarget = {
              kind: "selection",
              selection: modules.cloneValue(current)
            };
          } else {
            contextTarget = { kind: "node", node };
            selection.selectNode(node, false);
          }
        }
      } else if (edgeElement) {
        const edge = renderer.getModel()?.edges.find(
          (item) => item.key === edgeElement.dataset.edgeKey
        );
        contextTarget = edge ? { kind: "edge", edge } : null;
      } else if (noteElement) {
        const noteId = noteElement.dataset.noteId;
        contextTarget = { kind: "note", noteId };
        selection.selectNote(noteId, false);
      } else {
        contextTarget = { kind: "canvas", point: canvasPoint(event) };
      }

      const rect = shell.shell.getBoundingClientRect();
      renderer.showContextMenu(contextItems(contextTarget), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
    }

    function onWheel(event) {
      event.preventDefault();
      const viewport = controller.getViewport();
      const rect = shell.viewport.getBoundingClientRect();
      const anchor = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const nextZoom = Math.min(
        2.5,
        Math.max(0.25, viewport.zoom * (event.deltaY < 0 ? 1.1 : 0.9))
      );
      const worldX = (anchor.x - viewport.x) / viewport.zoom;
      const worldY = (anchor.y - viewport.y) / viewport.zoom;
      controller.changeViewport({
        x: anchor.x - worldX * nextZoom,
        y: anchor.y - worldY * nextZoom,
        zoom: nextZoom
      });
    }

    function onKeyDown(event) {
      if (event.target.matches("textarea, input, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        event.preventDefault();
        if (controller.getAnnotationMode?.()) {
          controller.changeAnnotationMode(false, "escape");
        }
        controller.select({ nodes: [], edges: [], annotation_ids: [] }, "escape");
        return;
      }
      if (controller.getAnnotationMode()) {
        // Note-edit only: Delete removes the selected note, node-editing
        // shortcuts stay silent.
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          controller.executeCommand("selection.delete");
        }
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        controller.executeCommand("selection.delete");
      } else if ((event.ctrlKey || event.metaKey) && key === "d") {
        event.preventDefault();
        controller.executeCommand("selection.duplicate");
      } else if ((event.ctrlKey || event.metaKey) && key === "c") {
        controller.executeCommand("selection.copy");
      } else if ((event.ctrlKey || event.metaKey) && key === "v") {
        controller.executeCommand("selection.paste");
      } else if (event.key === "Enter") {
        controller.executeCommand("node.open");
      }
    }

    listen(shell.shell, "contextmenu", onContextMenu);
    listen(shell.viewport, "wheel", onWheel, { passive: false });
    listen(shell.shell, "keydown", onKeyDown);

    return Object.freeze({
      getContextTarget: () => contextTarget,
      destroy() {
        cleanup.splice(0).forEach((remove) => remove());
      }
    });
  }

  modules.createWorkflowCommandInteraction = createCommandInteraction;
})(window);

/* ===== internal: designer_interaction.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};
  const DRAG_THRESHOLD = 5;

  function createInteraction(shell, renderer, controller) {
    const noteEditor = modules.createWorkflowNoteEditor(renderer, controller);
    const selection = modules.createWorkflowSelectionController(controller);
    const commandInteraction = modules.createWorkflowCommandInteraction(
      shell,
      renderer,
      controller,
      selection
    );
    const cleanup = [];
    let gesture = null;
    let suppressClick = false;
    let suppressContextMenu = false;

    function listen(target, eventName, handler, options) {
      target.addEventListener(eventName, handler, options);
      cleanup.push(() => target.removeEventListener(eventName, handler, options));
    }

    function clientPoint(event) {
      const rect = shell.viewport.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function worldPoint(event) {
      const point = clientPoint(event);
      const viewport = controller.getViewport();
      return {
        x: (point.x - viewport.x) / viewport.zoom,
        y: (point.y - viewport.y) / viewport.zoom
      };
    }

    function reachedThreshold(start, current) {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      return Math.hypot(dx, dy) >= DRAG_THRESHOLD;
    }

    function nodeFromElement(element) {
      return element
        ? renderer.getModel()?.nodeByKey.get(element.dataset.nodeKey) || null
        : null;
    }

    function noteFromElement(element) {
      return element
        ? renderer.getModel()?.notes.find(
          (item) => item.noteId === element.dataset.noteId
        ) || null
        : null;
    }

    function edgeFromElement(element) {
      const key = element?.dataset?.edgeKey;
      return key
        ? renderer.getModel()?.edges.find((item) => item.key === key) || null
        : null;
    }

    function selectedNodeKeys() {
      return new Set(controller.getSelection().nodes.map(modules.nodeRefKey));
    }

    function beginNodeMove(event, node) {
      const current = controller.getSelection();
      const selected = new Set(current.nodes.map(modules.nodeRefKey));
      const preserveGroup = current.nodes.length > 1 && selected.has(node.key);
      selection.selectNode(node, preserveGroup);
      if (controller.isReadonly()) return;

      const keys = selectedNodeKeys();
      const nodes = renderer.getModel().nodes.filter((item) => keys.has(item.key));
      gesture = {
        kind: "node-move",
        button: 0,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        startWorld: worldPoint(event),
        nodes,
        dx: 0,
        dy: 0,
        activated: false
      };
    }

    function beginNoteGesture(event, note, kind) {
      selection.selectNote(note.noteId, event.shiftKey);
      if (controller.isReadonly()) return;
      gesture = {
        kind,
        button: 0,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        startWorld: worldPoint(event),
        note,
        dx: 0,
        dy: 0,
        width: note.width,
        height: note.height,
        activated: false
      };
    }

    function beginLeftGesture(event, targets) {
      const model = renderer.getModel();
      const annotationMode = controller.getAnnotationMode();
      if (targets.noteElement) {
        if (!annotationMode) return;
        const note = noteFromElement(targets.noteElement);
        if (!note) return;
        if (event.target.closest("[data-note-resize]")) {
          beginNoteGesture(event, note, "note-resize");
        } else if (event.target.closest("[data-note-drag-handle]")) {
          beginNoteGesture(event, note, "note-drag");
        } else {
          selection.selectNote(note.noteId, event.shiftKey);
        }
        return;
      }
      // Annotation mode is note-edit only: nodes and edges are inert, while a
      // blank-canvas drag still pans the viewport.
      if (annotationMode && (targets.nodeElement || targets.edgeElement)) return;
      if (targets.nodeElement) {
        const node = nodeFromElement(targets.nodeElement);
        if (!node) return;
        const selectedPort = String(
          targets.portElement?.dataset?.zwdPortRole || ""
        );
        if (selectedPort) {
          if (["in", "enter", "return"].includes(selectedPort) || controller.isReadonly()) return;
          const connectionPort = node.nodeType === "loop"
            ? (selectedPort === "loop" ? "loop" : "done")
            : "out";
          gesture = {
            kind: "connect",
            button: 0,
            pointerId: event.pointerId,
            startClient: clientPoint(event),
            startWorld: worldPoint(event),
            source: { ...node, connectionPort },
            point: worldPoint(event),
            activated: false
          };
          return;
        }
        beginNodeMove(event, node);
        return;
      }
      if (targets.edgeElement) return;
      if (!model) return;
      gesture = {
        kind: "pan",
        button: 0,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        viewport: controller.getViewport(),
        activated: false
      };
    }

    function beginRightGesture(event, targets) {
      suppressContextMenu = false;
      if (controller.getAnnotationMode()) {
        // Note-edit only: no connection gesture and no node box selection.
        gesture = {
          kind: "right-noop",
          button: 2,
          pointerId: event.pointerId,
          startClient: clientPoint(event),
          activated: false
        };
        return;
      }
      if (targets.nodeElement) {
        const node = nodeFromElement(targets.nodeElement);
        if (!node) return;
        if (controller.isReadonly()) return;
        const selectedPort = String(
          targets.portElement?.dataset?.zwdPortRole || ""
        );
        if (["in", "enter", "return"].includes(selectedPort)) {
          gesture = {
            kind: "right-noop",
            button: 2,
            pointerId: event.pointerId,
            startClient: clientPoint(event),
            activated: false
          };
          return;
        }
        const connectionPort = node.nodeType === "loop"
          ? (selectedPort === "loop" ? "loop" : "done")
          : "out";
        const current = controller.getSelection();
        const selected = new Set(current.nodes.map(modules.nodeRefKey));
        const multipleSelected = current.nodes.length > 1 && selected.has(node.key);
        gesture = {
          kind: multipleSelected ? "right-noop" : "right-connect",
          button: 2,
          pointerId: event.pointerId,
          startClient: clientPoint(event),
          startWorld: worldPoint(event),
          source: { ...node, connectionPort },
          point: worldPoint(event),
          activated: false
        };
        return;
      }
      if (targets.edgeElement || targets.noteElement) {
        gesture = {
          kind: "right-noop",
          button: 2,
          pointerId: event.pointerId,
          startClient: clientPoint(event),
          activated: false
        };
        return;
      }
      gesture = {
        kind: "box-select",
        button: 2,
        pointerId: event.pointerId,
        startClient: clientPoint(event),
        startWorld: worldPoint(event),
        currentWorld: worldPoint(event),
        toggle: !!(event.ctrlKey || event.metaKey),
        activated: false
      };
    }

    function onPointerDown(event) {
      if (event.button !== 0 && event.button !== 2) return;
      renderer.hideContextMenu();
      const targets = {
        nodeElement: event.target.closest("[data-node-key]"),
        noteElement: event.target.closest("[data-note-id]"),
        edgeElement: event.target.closest("[data-edge-key]"),
        portElement: event.target.closest("[data-zwd-port-role]")
      };

      if (event.button === 0) beginLeftGesture(event, targets);
      else beginRightGesture(event, targets);

      if (gesture) {
        shell.viewport.setPointerCapture(event.pointerId);
        if (event.button === 0) event.preventDefault();
      }
    }

    function activateGesture(event) {
      if (gesture.activated) return true;
      const current = clientPoint(event);
      if (!reachedThreshold(gesture.startClient, current)) return false;
      gesture.activated = true;
      if (gesture.button === 0) suppressClick = true;
      if (gesture.button === 2) suppressContextMenu = true;
      return true;
    }

    function onPointerMove(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (!activateGesture(event)) return;
      if (gesture.button === 2) event.preventDefault();

      if (gesture.kind === "pan") {
        const point = clientPoint(event);
        controller.changeViewport({
          ...gesture.viewport,
          x: gesture.viewport.x + point.x - gesture.startClient.x,
          y: gesture.viewport.y + point.y - gesture.startClient.y
        });
        return;
      }

      if (gesture.kind === "right-noop") return;
      const point = worldPoint(event);
      const rawDx = point.x - gesture.startWorld.x;
      const rawDy = point.y - gesture.startWorld.y;

      if (gesture.kind === "node-move") {
        const snapped = controller.snapNodeDelta({ x: rawDx, y: rawDy });
        if (gesture.dx === snapped.x && gesture.dy === snapped.y) return;
        gesture.dx = snapped.x;
        gesture.dy = snapped.y;
        renderer.setNodeMovePreview(
          gesture.nodes.map((node) => node.key),
          gesture.dx,
          gesture.dy
        );
      } else if (gesture.kind === "right-connect" || gesture.kind === "connect") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        gesture.point = point;
        renderer.showConnection(
          gesture.source.key,
          point,
          gesture.source.connectionPort
        );
      } else if (gesture.kind === "box-select") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        gesture.currentWorld = point;
        renderer.showSelectionBox(gesture.startClient, clientPoint(event));
      } else if (gesture.kind === "note-drag") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        renderer.setNotePreview(gesture.note.noteId, {
          dx: gesture.dx,
          dy: gesture.dy
        });
      } else if (gesture.kind === "note-resize") {
        gesture.dx = rawDx;
        gesture.dy = rawDy;
        gesture.width = Math.max(160, gesture.note.width + gesture.dx);
        gesture.height = Math.max(96, gesture.note.height + gesture.dy);
        renderer.setNotePreview(gesture.note.noteId, {
          width: gesture.width,
          height: gesture.height
        });
      }
    }

    function positionOperation(path, value) {
      const current = modules.getDocumentPathValue(controller.getDocument(), path);
      return {
        op: current.exists ? "replace" : "add",
        path: modules.cloneValue(path),
        value
      };
    }

    function finishConnect(event, current) {
      if (controller.isReadonly()) return;
      const snapped = controller.findConnectionTarget(
        clientPoint(event),
        current.source
      );
      if (snapped) {
        controller.requestConnect(current.source, snapped);
        return;
      }
      const targetElement = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-node-key]");
      const target = nodeFromElement(targetElement);
      if (target) {
        controller.requestConnect(current.source, target);
        return;
      }
      const edgeElement = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest?.("[data-edge-key]");
      const edge = edgeFromElement(edgeElement);
      const drop = {
        kind: edge ? "edge" : "canvas",
        position: worldPoint(event)
      };
      if (edge) drop.edge_ref = modules.cloneValue(edge.ref);
      controller.requestConnectDrop(current.source, drop);
    }

    function rectangleNodes(current) {
      const left = Math.min(current.startWorld.x, current.currentWorld.x);
      const right = Math.max(current.startWorld.x, current.currentWorld.x);
      const top = Math.min(current.startWorld.y, current.currentWorld.y);
      const bottom = Math.max(current.startWorld.y, current.currentWorld.y);
      return renderer.getModel().nodes.filter((node) => (
        node.x <= right &&
        node.x + node.width >= left &&
        node.y <= bottom &&
        node.y + node.height >= top
      ));
    }

    function onPointerUp(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const current = gesture;
      gesture = null;
      renderer.clearPreviews();
      if (!current.activated) return;

      if (current.kind === "node-move" && (current.dx || current.dy)) {
        controller.commit(current.nodes.map((node) => positionOperation(
          node.documentPath,
          controller.snapNodePosition({
            x: node.x + current.dx,
            y: node.y + current.dy
          })
        )), "node.move");
      } else if (current.kind === "note-drag" && (current.dx || current.dy)) {
        controller.commit([positionOperation(current.note.positionPath, {
          x: Math.round(current.note.x + current.dx),
          y: Math.round(current.note.y + current.dy)
        })], "annotation.move");
      } else if (current.kind === "note-resize" && (current.dx || current.dy)) {
        controller.commit([positionOperation(current.note.sizePath, {
          width: Math.round(current.width),
          height: Math.round(current.height)
        })], "annotation.resize");
      } else if (current.kind === "right-connect" || current.kind === "connect") {
        if (current.kind === "connect") suppressClick = false;
        finishConnect(event, current);
      } else if (current.kind === "box-select") {
        selection.selectNodes(rectangleNodes(current), current.toggle);
      }
    }

    function onPointerCancel(event) {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (gesture.button === 2 && gesture.activated) suppressContextMenu = true;
      gesture = null;
      renderer.clearPreviews();
      suppressClick = true;
    }

    function onContextMenuCapture(event) {
      if (!suppressContextMenu) return;
      suppressContextMenu = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }

    function onClick(event) {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      const command = event.target.closest("[data-zwd-command]")?.dataset.zwdCommand;
      if (command) {
        controller.executeCommand(command, null, worldPoint(event));
        return;
      }
      const contextItem = event.target.closest("[data-context-command]");
      if (contextItem) {
        renderer.hideContextMenu();
        controller.executeCommand(
          contextItem.dataset.contextCommand,
          commandInteraction.getContextTarget(),
          worldPoint(event),
          contextItem.dataset.contextValue
        );
        return;
      }
      const external = event.target.closest("[data-external-url]")?.dataset.externalUrl;
      if (external) {
        event.preventDefault();
        // Annotation mode is note-edit only, so note editing takes priority
        // over following a link.
        if (controller.getAnnotationMode()) return;
        controller.emit("external-link:open-request", { url: external });
      }
    }

    function onDoubleClick(event) {
      const body = event.target.closest("[data-note-body]");
      if (body) noteEditor.begin(body.dataset.noteBody, body);
    }

    function onChange(event) {
      const input = event.target.closest("[data-note-color]");
      if (input) noteEditor.setColor(input.dataset.noteColor, input.value);
    }

    listen(shell.viewport, "pointerdown", onPointerDown);
    listen(shell.viewport, "pointermove", onPointerMove);
    listen(shell.viewport, "pointerup", onPointerUp);
    listen(shell.viewport, "pointercancel", onPointerCancel);
    listen(shell.shell, "contextmenu", onContextMenuCapture, true);
    listen(shell.shell, "click", onClick);
    listen(shell.shell, "dblclick", onDoubleClick);
    listen(shell.shell, "change", onChange);
    return Object.freeze({
      destroy() {
        gesture = null;
        noteEditor.close();
        commandInteraction.destroy();
        cleanup.splice(0).forEach((remove) => remove());
      }
    });
  }

  modules.createWorkflowInteraction = createInteraction;
})(window);

/* ===== internal: designer_core_api.js ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules || {};
  const required = [
    "cloneValue",
    "normalizePosition",
    "normalizeWorkflowGrid",
    "snapWorkflowPosition",
    "rankWorkflowConnectionTargets",
    "normalizeViewport",
    "normalizeSelection",
    "normalizeStatus",
    "normalizeNodeRef",
    "normalizeEdgeRef",
    "nodeRefKey",
    "edgeRefKey",
    "sameValue",
    "createEmitter",
    "assertWorkflowDocument",
    "getDocumentPathValue",
    "applyDocumentPatch",
    "applyDocumentPatchWithInverse",
    "diffWorkflowDocuments",
    "createWorkflowIdManager",
    "buildWorkflowGraphModel",
    "copyWorkflowSelection",
    "cloneWorkflowFragment"
  ];

  required.forEach((name) => {
    if (typeof modules[name] !== "function") {
      throw new Error(`WorkflowDesigner core module is missing: ${name}`);
    }
  });

  packages.workflowDesignerCore = Object.freeze(Object.fromEntries(
    required.map((name) => [name, modules[name]])
  ));
})(window);

/* ===== public API ===== */
(function (root) {
  "use strict";

  const packages = root.zizPackages = root.zizPackages || {};
  const modules = packages.__workflowDesignerModules =
    packages.__workflowDesignerModules || {};

  function normalizeRenderers(value) {
    if (!value) return {};
    if (Array.isArray(value)) {
      return Object.fromEntries(value
        .filter((item) => item && (
          typeof item.render === "function" ||
          typeof item.renderIcon === "function"
        ))
        .map((item) => [String(item.type || "default"), item]));
    }
    if (typeof value !== "object") {
      throw new TypeError("nodeRenderers must be an object or array");
    }
    return { ...value };
  }

  function normalizeTheme(value) {
    const theme = value && typeof value === "object" ? value : {};
    return Object.fromEntries(Object.entries(theme)
      .filter(([key, item]) => (
        String(key).startsWith("--zwd-") &&
        ["string", "number"].includes(typeof item)
      )));
  }

  function normalizeGraphMode(value) {
    return String(value || "").trim().toLowerCase() === "dag"
      ? "dag"
      : "graph";
  }

  function normalizeContextActions(value) {
    if (!Array.isArray(value)) return null;
    const actions = value.map((item) => {
      const commandId = String(item?.commandId || "").trim();
      const label = String(item?.label || "").trim();
      if (!commandId || !label) return null;
      const action = { commandId, label };
      if (["string", "number"].includes(typeof item.value)) {
        action.value = String(item.value);
      }
      return action;
    }).filter(Boolean);
    return actions.length || value.length === 0 ? actions : null;
  }

  const DEFAULT_NOTE_COLORS = Object.freeze([
    "#fff2a8",
    "#dff7e8",
    "#e7edff"
  ]);

  function normalizeNoteColors(value) {
    const colors = (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return colors.length ? colors : [...DEFAULT_NOTE_COLORS];
  }

  function createWorkflowDesigner(options = {}) {
    const rootElement = options.root;
    if (!(rootElement instanceof HTMLElement)) {
      throw new TypeError("createWorkflowDesigner requires an HTMLElement root");
    }

    let documentSnapshot = modules.cloneValue(options.document || {
      metadata: {},
      steps: [],
      flows: {},
      notes: []
    });
    modules.assertWorkflowDocument(documentSnapshot);
    let selection = modules.normalizeSelection(options.selection);
    let viewport = modules.normalizeViewport(options.viewport);
    let status = modules.normalizeStatus(options.status);
    let readonly = !!options.readonly;
    let annotationMode = !readonly && !!options.annotationMode;
    selection = annotationMode
      ? { ...selection, nodes: [], edges: [] }
      : { ...selection, annotation_ids: [] };
    let nodeRenderers = normalizeRenderers(options.nodeRenderers);
    let mounted = false;
    let shell = null;
    let renderer = null;
    let interaction = null;
    let transactionSequence = 0;
    const emitter = modules.createEmitter();
    const idManager = modules.createWorkflowIdManager(
      options.idAllocator,
      documentSnapshot
    );
    const commandLabels = options.commandLabels || {};
    const noteColors = normalizeNoteColors(options.noteColors);
    const graphMode = normalizeGraphMode(options.graphMode);
    const nodeGrid = modules.normalizeWorkflowGrid(options.nodeGrid);
    const nodeMetrics = modules.normalizeWorkflowNodeMetrics(options.nodeMetrics);
    const connectionSnapDistance = Math.max(
      0,
      modules.asFiniteNumber(options.connectionSnapDistance, 0)
    );
    const graphConstraints = typeof options.graphConstraints === "function"
      ? options.graphConstraints
      : null;
    if (options.contextActions !== undefined &&
        typeof options.contextActions !== "function") {
      throw new TypeError("contextActions must be a function");
    }
    const contextActions = options.contextActions || null;

    function cycleValidationKey(scope, nodeId) {
      const id = String(nodeId || "");
      if (scope?.kind === "flow" && ["START", "END"].includes(id)) {
        return `flow:${scope.id}:node:${id}`;
      }
      if (scope?.kind === "loop" && ["START", "END"].includes(id)) {
        return String(scope.id);
      }
      if (scope?.kind === "unassigned" && id === "START") {
        return "unassigned:node:START";
      }
      return id;
    }

    function effectiveStatus() {
      const merged = modules.normalizeStatus(status);
      if (graphMode !== "dag" ||
          typeof modules.findWorkflowGraphCycles !== "function") {
        return merged;
      }
      const validation = modules.cloneValue(merged.validation || {});
      modules.findWorkflowGraphCycles(documentSnapshot).forEach((cycle) => {
        (Array.isArray(cycle?.nodeIds) ? cycle.nodeIds : []).forEach((nodeId) => {
          const key = cycleValidationKey(cycle.scope, nodeId);
          if (!key) return;
          const entries = validation[key] || [];
          const message = String(
            cycle?.message || "循環する接続が含まれています。"
          );
          if (!entries.some((entry) => (
            entry.level === "error" && entry.message === message
          ))) {
            entries.push({ level: "error", message });
          }
          validation[key] = entries;
        });
      });
      return modules.normalizeStatus({
        nodeStatus: merged.nodeStatus,
        validation
      });
    }

    function renderDocument() {
      if (!mounted) return;
      const model = modules.buildWorkflowGraphModel(documentSnapshot, {
        nodeMetrics
      });
      renderer.renderDocument(model, {
        nodeRenderers,
        readonly,
        annotationMode,
        selection,
        status: effectiveStatus()
      });
      renderer.applyViewport(viewport);
    }

    function transactionId() {
      transactionSequence += 1;
      return `zwdtx_${Date.now()}_${transactionSequence}`;
    }

    function commit(patch, reason) {
      if (readonly) return null;
      if (!Array.isArray(patch) || !patch.length) return null;
      const checked = modules.applyDocumentPatchWithInverse(
        documentSnapshot,
        patch
      );
      const payload = {
        patch: modules.cloneValue(patch),
        inversePatch: checked.inversePatch,
        reason: String(reason || "document.edit"),
        transactionId: transactionId()
      };
      emitter.emit("document:change", payload);
      return modules.cloneValue(payload);
    }

    function selectFromUi(value, reason) {
      const next = modules.normalizeSelection(value);
      if (modules.sameValue(selection, next)) return;
      selection = next;
      renderer?.applySelection(selection);
      emitter.emit("selection:change", {
        selection: modules.cloneValue(selection),
        reason: String(reason || "ui")
      });
    }

    function changeViewportFromUi(value) {
      const next = modules.normalizeViewport(value);
      if (modules.sameValue(viewport, next)) return;
      viewport = next;
      renderer?.applyViewport(viewport);
      emitter.emit("viewport:change", {
        viewport: modules.cloneValue(viewport)
      });
    }

    function changeAnnotationModeFromUi(value, reason) {
      const next = !readonly && !!value;
      if (annotationMode === next) return;
      annotationMode = next;
      renderer?.applyAnnotationMode(annotationMode);
      emitter.emit("annotation:mode-change", {
        active: next,
        reason: String(reason || "ui")
      });
      selectFromUi(next
        ? { ...selection, nodes: [], edges: [] }
        : { ...selection, annotation_ids: [] }, "annotation.mode-change");
    }

    function zoomBy(factor) {
      if (!mounted) return;
      const rect = shell.viewport.getBoundingClientRect();
      const nextZoom = Math.min(
        2.5,
        Math.max(0.25, viewport.zoom * factor)
      );
      const center = { x: rect.width / 2, y: rect.height / 2 };
      const worldX = (center.x - viewport.x) / viewport.zoom;
      const worldY = (center.y - viewport.y) / viewport.zoom;
      changeViewportFromUi({
        x: center.x - worldX * nextZoom,
        y: center.y - worldY * nextZoom,
        zoom: nextZoom
      });
    }

    function addNote(point) {
      if (readonly || !annotationMode) return null;
      const noteId = idManager.allocate("note", 1, documentSnapshot)[0];
      const location = modules.normalizePosition(point, {
        x: 320,
        y: 240
      });
      const note = {
        note_id: noteId,
        ui_position: {
          x: Math.round(location.x),
          y: Math.round(location.y)
        },
        size: { width: 240, height: 144 },
        text: "",
        color: noteColors[0]
      };
      const notes = Array.isArray(documentSnapshot.notes)
        ? documentSnapshot.notes
        : null;
      const patch = notes
        ? [{ op: "add", path: ["notes", notes.length], value: note }]
        : [{ op: "add", path: ["notes"], value: [note] }];
      const result = commit(patch, "annotation.add");
      selectFromUi({
        nodes: [],
        edges: [],
        annotation_ids: [noteId]
      }, "annotation.add");
      return result;
    }

    function setNoteColor(noteId, value) {
      if (readonly || !annotationMode) return null;
      const color = String(value ?? "").trim();
      if (!color) return null;
      const note = renderer?.getModel()?.notes.find(
        (item) => item.noteId === String(noteId || "")
      );
      if (!note) return null;
      return commit(
        modules.workflowNoteColorOperations(documentSnapshot, note, color),
        "annotation.color"
      );
    }

    function copy(value = selection) {
      return modules.copyWorkflowSelection(documentSnapshot, value);
    }

    function cloneFromFragment(fragment, mode) {
      if (readonly) return null;
      // Notes may only ever be created via "annotation.add". Duplicate and
      // paste can still clone workflow nodes, but never sticky notes.
      const sanitizedFragment = { ...fragment, notes: [] };
      const result = modules.cloneWorkflowFragment(
        documentSnapshot,
        sanitizedFragment,
        {
          mode,
          sourceDocument: fragment.source_document || documentSnapshot,
          idManager,
          referenceRewriter: options.referenceRewriter,
          offset: { x: 48, y: 48 },
          nodeGrid
        }
      );
      const patch = modules.diffWorkflowDocuments(
        documentSnapshot,
        result.document
      );
      const transaction = commit(
        patch,
        mode === "duplicate" ? "graph.duplicate" : "graph.paste"
      );
      selectFromUi(result.selection, mode);
      return {
        transaction,
        stepIdMap: Object.fromEntries(result.stepIdMap.entries()),
        flowIdMap: Object.fromEntries(result.flowIdMap.entries()),
        selection: modules.cloneValue(result.selection)
      };
    }

    function duplicate(value = selection) {
      const fragment = copy(value);
      const hasContent = fragment.steps.length || fragment.notes.length;
      if (!hasContent && fragment.kind !== "flow") return null;
      return cloneFromFragment(fragment, "duplicate");
    }

    function paste(fragment) {
      return cloneFromFragment(modules.cloneValue(fragment), "paste");
    }

    function validateConnection(source, target) {
      const standard = modules.validateWorkflowConnection(
        renderer?.getModel(),
        source,
        target,
        { graphMode }
      );
      if (!standard.allowed) return standard;

      const payload = {
        source_node_ref: modules.cloneValue(source.ref),
        target_node_ref: modules.cloneValue(target.ref)
      };
      if (source.connectionPort) {
        payload.source_port = String(source.connectionPort);
      }
      if (!graphConstraints) return { allowed: true, payload };

      const result = graphConstraints({
        operation: "connect",
        document: modules.cloneValue(documentSnapshot),
        sourceNodeRef: payload.source_node_ref,
        targetNodeRef: payload.target_node_ref
      });
      if (result && typeof result.then === "function") {
        throw new Error("graphConstraints must be synchronous");
      }
      if (result === false || result?.allowed === false) {
        return {
          allowed: false,
          message: String(result?.message || "This connection is not allowed.")
        };
      }
      return { allowed: true, payload };
    }

    function findConnectionTarget(point, source) {
      if (!renderer || connectionSnapDistance <= 0) return null;
      return modules.rankWorkflowConnectionTargets(
        renderer.getModel(),
        source,
        point,
        viewport,
        connectionSnapDistance,
        (target) => validateConnection(source, target).allowed
      )[0] || null;
    }

    function requestConnect(source, target) {
      const result = validateConnection(source, target);
      if (!result.allowed) {
        renderer?.showMessage(result.message, "error");
        return false;
      }
      emitter.emit("connect:create-request", result.payload);
      return true;
    }

    function requestConnectDrop(source, drop) {
      const sourceNodeRef = modules.normalizeNodeRef(source?.ref);
      if (!sourceNodeRef) return false;
      const edgeRef = modules.normalizeEdgeRef(drop?.edge_ref);
      const kind = drop?.kind === "edge" && edgeRef ? "edge" : "canvas";
      const payload = {
        source_node_ref: modules.cloneValue(sourceNodeRef),
        drop: {
          kind,
          position: modules.normalizePosition(drop?.position)
        }
      };
      if (source?.connectionPort) {
        payload.source_port = String(source.connectionPort);
      }
      if (kind === "edge") payload.drop.edge_ref = modules.cloneValue(edgeRef);
      emitter.emit("connect:drop-request", modules.cloneValue(payload));
      return true;
    }

    function currentNodeTarget(target) {
      if (target?.kind === "node") return target.node;
      const selected = selection.nodes[0];
      if (!selected) return null;
      return renderer?.getModel()?.nodes.find(
        (node) => modules.nodeRefKey(node.ref) === modules.nodeRefKey(selected)
      ) || null;
    }

    // Each mode owns exactly one kind of target: OFF edits nodes and edges,
    // ON edits notes. Public callers can still supply a mixed selection, so
    // every generic command path drops the part the current mode must not touch.
    function withAnnotationModeGate(value) {
      return annotationMode
        ? { nodes: [], edges: [], annotation_ids: value.annotation_ids || [] }
        : { ...value, annotation_ids: [] };
    }

    function targetSelection(target) {
      if (target?.kind === "selection") {
        return withAnnotationModeGate(
          modules.cloneValue(target.selection || selection)
        );
      }
      if (target?.kind === "node") {
        return withAnnotationModeGate({
          nodes: [modules.cloneValue(target.node.ref)],
          edges: [],
          annotation_ids: []
        });
      }
      if (target?.kind === "edge") {
        return withAnnotationModeGate({
          nodes: [],
          edges: [modules.cloneValue(target.edge.ref)],
          annotation_ids: []
        });
      }
      if (target?.kind === "note") {
        return withAnnotationModeGate({
          nodes: [],
          edges: [],
          annotation_ids: [String(target.noteId)]
        });
      }
      return withAnnotationModeGate(modules.cloneValue(selection));
    }

    function publicCommandTarget(target) {
      if (target?.kind === "node") {
        return {
          kind: "node",
          node_ref: modules.cloneValue(target.node.ref)
        };
      }
      if (target?.kind === "selection") {
        return {
          kind: "selection",
          selection: targetSelection(target)
        };
      }
      if (target?.kind === "edge") {
        return {
          kind: "edge",
          edge_ref: modules.cloneValue(target.edge.ref)
        };
      }
      if (target?.kind === "note") {
        return {
          kind: "annotation",
          annotation_id: String(target.noteId)
        };
      }
      if (target?.kind === "canvas") {
        return {
          kind: "canvas",
          position: modules.normalizePosition(target.point)
        };
      }
      return null;
    }

    function getContextActions(target) {
      if (!contextActions) return null;
      try {
        const configured = contextActions({
          target: modules.cloneValue(publicCommandTarget(target)),
          readonly
        });
        if (configured && typeof configured.then === "function") return null;
        return normalizeContextActions(configured);
      } catch (_error) {
        return null;
      }
    }

    function executeCommand(commandId, target, point, value) {
      const command = String(commandId || "").trim();
      const editCommands = new Set([
        "node.add",
        "annotation.mode-toggle",
        "annotation.add",
        "annotation.color",
        "selection.delete",
        "selection.duplicate",
        "selection.paste"
      ]);
      if (readonly && editCommands.has(command)) return;
      if (command === "viewport.zoom-in") zoomBy(1.15);
      else if (command === "viewport.zoom-out") zoomBy(1 / 1.15);
      else if (command === "annotation.mode-toggle") {
        changeAnnotationModeFromUi(!annotationMode, "toolbar");
      }
      else if (command === "node.add") {
        const location = modules.normalizePosition(target?.point || point, {
          x: 0,
          y: 0
        });
        const stepId = idManager.allocate("step", 1, documentSnapshot)[0];
        emitter.emit("node:add-request", {
          step_id: stepId,
          position: modules.snapWorkflowPosition(location, nodeGrid)
        });
      }
      else if (command === "annotation.add") {
        // The note lands where the menu was opened, not where the menu item
        // happened to be clicked.
        addNote(target?.point || point);
      }
      else if (command === "annotation.color") {
        if (target?.kind === "note") setNoteColor(target.noteId, value);
      }
      else if (command === "workflow.run") {
        emitter.emit("run:request", { mode: "workflow" });
      }
      else if (command === "selection.duplicate") duplicate(targetSelection(target));
      else if (command === "selection.delete") {
        emitter.emit("delete:request", {
          selection: targetSelection(target)
        });
      } else if (command === "node.open") {
        const node = currentNodeTarget(target);
        if (node) {
          emitter.emit("node:open-detail", {
            node_ref: modules.cloneValue(node.ref)
          });
        }
      } else if (command === "node.run") {
        const node = currentNodeTarget(target);
        if (node) {
          emitter.emit("run:request", {
            node_ref: modules.cloneValue(node.ref),
            mode: node.ref.flow_id ? "flow" : "step"
          });
        }
      }
      const executed = {
        commandId: command,
        target: publicCommandTarget(target)
      };
      if (value !== undefined && value !== null) executed.value = String(value);
      emitter.emit("command:execute", executed);
    }

    const controller = Object.freeze({
      getDocument: () => documentSnapshot,
      getSelection: () => selection,
      getViewport: () => viewport,
      getCommandLabels: () => commandLabels,
      getContextActions,
      getNoteColors: () => [...noteColors],
      getAnnotationMode: () => annotationMode,
      isReadonly: () => readonly,
      snapNodePosition: (value) => modules.snapWorkflowPosition(value, nodeGrid),
      snapNodeDelta: (value) => modules.snapWorkflowDelta(value, nodeGrid),
      findConnectionTarget,
      select: selectFromUi,
      changeViewport: changeViewportFromUi,
      changeAnnotationMode: changeAnnotationModeFromUi,
      commit,
      emit: emitter.emit,
      addNote,
      duplicate,
      executeCommand,
      requestConnect,
      requestConnectDrop,
      refresh: renderDocument
    });

    function mount() {
      if (mounted) return api;
      shell = modules.createWorkflowDesignerShell(rootElement, commandLabels);
      shell.shell.dataset.nodeGrid = nodeGrid.enabled ? "enabled" : "disabled";
      shell.shell.style.setProperty("--zwd-grid-size", `${nodeGrid.size}px`);
      const gridOrigin = modules.normalizePosition(nodeGrid.origin);
      shell.shell.style.setProperty("--zwd-grid-origin-x", `${gridOrigin.x}px`);
      shell.shell.style.setProperty("--zwd-grid-origin-y", `${gridOrigin.y}px`);
      shell.shell.style.setProperty("--zwd-node-width", `${nodeMetrics.width}px`);
      shell.shell.style.setProperty("--zwd-node-height", `${nodeMetrics.height}px`);
      shell.shell.style.setProperty(
        "--zwd-node-visual-size",
        `${nodeMetrics.visualSize}px`
      );
      shell.shell.style.setProperty(
        "--zwd-node-visual-offset-x",
        `${nodeMetrics.visualOffsetX}px`
      );
      shell.shell.style.setProperty(
        "--zwd-node-visual-center-y",
        `${nodeMetrics.visualSize / 2}px`
      );
      shell.shell.style.setProperty(
        "--zwd-node-icon-size",
        `${nodeMetrics.iconSize}px`
      );
      shell.shell.style.setProperty(
        "--zwd-node-loop-upper-y",
        `${nodeMetrics.loopUpperY}px`
      );
      shell.shell.style.setProperty(
        "--zwd-node-loop-lower-y",
        `${nodeMetrics.loopLowerY}px`
      );
      Object.entries(normalizeTheme(options.theme)).forEach(([key, value]) => {
        shell.shell.style.setProperty(key, String(value));
      });
      renderer = modules.createWorkflowRenderer(shell);
      mounted = true;
      renderDocument();
      interaction = modules.createWorkflowInteraction(
        shell,
        renderer,
        controller
      );
      return api;
    }

    function destroy() {
      if (!mounted) return;
      interaction?.destroy();
      renderer?.destroy();
      emitter.clear();
      interaction = null;
      renderer = null;
      shell = null;
      mounted = false;
    }

    const api = Object.freeze({
      mount,
      destroy,
      setDocument(value) {
        modules.assertWorkflowDocument(value);
        documentSnapshot = modules.cloneValue(value);
        idManager.observe(documentSnapshot);
        renderDocument();
      },
      getDocument() {
        return modules.cloneValue(documentSnapshot);
      },
      updateDocument(patch) {
        documentSnapshot = modules.applyDocumentPatch(documentSnapshot, patch);
        idManager.observe(documentSnapshot);
        renderDocument();
        return modules.cloneValue(documentSnapshot);
      },
      setSelection(value) {
        selection = modules.normalizeSelection(value);
        renderer?.applySelection(selection);
      },
      getSelection() {
        return modules.cloneValue(selection);
      },
      setViewport(value) {
        viewport = modules.normalizeViewport(value);
        renderer?.applyViewport(viewport);
      },
      getViewport() {
        return modules.cloneValue(viewport);
      },
      setStatus(value) {
        status = modules.normalizeStatus(value);
        renderer?.applyStatus(effectiveStatus());
      },
      setReadonly(value) {
        readonly = !!value;
        if (readonly) annotationMode = false;
        selection = annotationMode
          ? { ...selection, nodes: [], edges: [] }
          : { ...selection, annotation_ids: [] };
        renderDocument();
      },
      setAnnotationMode(value) {
        annotationMode = !readonly && !!value;
        renderer?.applyAnnotationMode(annotationMode);
        selection = annotationMode
          ? { ...selection, nodes: [], edges: [] }
          : { ...selection, annotation_ids: [] };
        renderer?.applySelection(selection);
      },
      getAnnotationMode() {
        return annotationMode;
      },
      setNodeRenderers(value) {
        nodeRenderers = normalizeRenderers(value);
        renderDocument();
      },
      duplicate,
      copy,
      paste,
      on: emitter.on,
      off: emitter.off
    });
    return api;
  }

  packages.workflowDesigner = Object.freeze({
    createWorkflowDesigner,
    applyDocumentPatch: modules.applyDocumentPatch
  });
})(window);
