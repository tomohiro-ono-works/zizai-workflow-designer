from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SAMPLE = ROOT / "sample"

required_files = [
    SRC / "workflow_designer.js",
    SRC / "workflow_designer.css",
    SAMPLE / "index.html",
    SAMPLE / "sample_app.js",
    SAMPLE / "sample.css",
    SAMPLE / "icons" / "database.svg",
    SAMPLE / "icons" / "cloud.svg",
]

for path in required_files:
    assert path.is_file(), f"missing required file: {path.relative_to(ROOT)}"

html = (SAMPLE / "index.html").read_text(encoding="utf-8")
app = (SAMPLE / "sample_app.js").read_text(encoding="utf-8")

script_order = [
    "../src/designer_types.js",
    "../src/designer_grid.js",
    "../src/designer_events.js",
    "../src/designer_document.js",
    "../src/designer_ids.js",
    "../src/designer_graph.js",
    "../src/designer_fragments.js",
    "../src/designer_clone.js",
    "../src/designer_selection.js",
    "../src/designer_dom.js",
    "../src/designer_note_dom.js",
    "../src/designer_feedback.js",
    "../src/designer_render.js",
    "../src/designer_note_edit.js",
    "../src/designer_commands.js",
    "../src/designer_interaction.js",
    "../src/designer_core_api.js",
    "../src/workflow_designer.js",
    "./sample_app.js",
]
positions = [html.index(name) for name in script_order]
assert positions == sorted(positions), "library scripts are not loaded in dependency order"

for command in [
    "viewport.zoom-in",
    "viewport.zoom-out",
    "history.redo",
    "history.undo",
    "annotation.add",
    "workflow.run",
]:
    assert command in (SRC / "designer_dom.js").read_text(encoding="utf-8"), command

for marker in [
    "createWorkflowDesigner",
    "nodeRenderers",
    "renderIcon",
    "connect:create-request",
    "document:change",
    "history.undo",
    "history.redo",
    "waiting",
    "running",
    "success",
    "error",
    "window.workflowDesignerSample",
    'graphMode: "dag"',
    'node_type: "loop"',
    "loop_owner_id",
    "loop: {",
    "flows: {",
]:
    assert marker in app, f"missing sample behavior marker: {marker}"

workflow = (SRC / "workflow_designer.js").read_text(encoding="utf-8")
css = (SAMPLE / "sample.css").read_text(encoding="utf-8")
assert "dataset.nodeGrid" in workflow
assert "--zwd-grid-size" in workflow
assert '.zwd[data-node-grid="enabled"] .zwd-world' in css
assert "var(--zwd-grid-size)" in css

render = (SRC / "designer_render.js").read_text(encoding="utf-8")
interaction = (SRC / "designer_interaction.js").read_text(encoding="utf-8")
assert "setNodeMovePreview" in render
assert "requestAnimationFrame" in render
assert "incidentEdgeKeysByNode" in render
assert "workflowPreviewEdgePath" in render
assert "workflowRoundedOrthogonalPath" in render
assert " C " not in render.split("function edgePath", 1)[1].split("function previewEdgePath", 1)[0]
assert "renderer.setNodeMovePreview" in interaction

core_css = (SRC / "workflow_designer.css").read_text(encoding="utf-8")
assert "--zwd-node-visual-size: 88px" in core_css
assert "border-radius: 6px" in core_css
assert ".zwd-node__description" in core_css
assert 'status: { nodeStatus: {}, validation: {} }' in app
assert "const initialStatus" not in app
assert app.count("description:") >= 7
assert 'const loopFrames = []' in (SRC / "designer_graph.js").read_text(encoding="utf-8")
assert 'data-zwd-port-role' in (SRC / "designer_dom.js").read_text(encoding="utf-8")
assert 'source_port' in workflow
assert '.zwd-node__port--out' in core_css
assert '.zwd-node__port--done' in core_css
assert '.zwd-node__port--loop' in core_css
assert '.zwd-loop-frame' not in css
assert ".zwd-node--start .zwd-node__visual" in core_css
assert "border-radius: 44px 0 0 44px" in core_css
assert ".zwd-node--end .zwd-node__visual" in core_css
assert "border-radius: 0 44px 44px 0" in core_css
assert ".zwd-node--start," not in css, "sample CSS must not own START/END terminal geometry"

print("sample static verification passed")
