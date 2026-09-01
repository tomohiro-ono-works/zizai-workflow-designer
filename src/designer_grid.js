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
