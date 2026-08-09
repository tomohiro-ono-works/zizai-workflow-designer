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
