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
