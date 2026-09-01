from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SAMPLE = ROOT / "sample"

required_files = [
    SRC / "workflow_designer.js",
    SRC / "workflow_designer.css",
    SAMPLE / "index.html",
    SAMPLE / "sample_app.js",
    SAMPLE / "sample.css",
    SAMPLE / "minimal.html",
    SAMPLE / "minimal.js",
    SAMPLE / "minimal.css",
    SAMPLE / "icons" / "database.svg",
    SAMPLE / "icons" / "cloud.svg",
]

for path in required_files:
    assert path.is_file(), f"missing required file: {path.relative_to(ROOT)}"

html = (SAMPLE / "index.html").read_text(encoding="utf-8")
app = (SAMPLE / "sample_app.js").read_text(encoding="utf-8")

assert 'src="../src/workflow_designer.js"' in html, "sample must load the public library entry"
assert 'src="./sample_app.js"' in html, "sample must load its application script"
assert 'type="module"' not in html, "sample must not require ES Modules"
assert "designer_" not in html, "sample HTML must not enumerate internal designer modules"
assert html.count("<script") == 2, "sample must load one library script and one app script"
assert "import " not in app, "sample app must be a classic script for file:// support"

dom_js = (SRC / "designer_dom.js").read_text(encoding="utf-8")
for command in [
    "viewport.zoom-in",
    "viewport.zoom-out",
    "history.redo",
    "history.undo",
    "annotation.mode-toggle",
    "workflow.run",
]:
    assert command in dom_js, command
# Notes are created from the annotation-mode right-click menu only.
assert "annotation.add" not in dom_js, "the toolbar must not expose note creation"

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
internal_imports = [
    "designer_types.js", "designer_grid.js", "designer_events.js",
    "designer_document.js", "designer_ids.js", "designer_graph.js",
    "designer_fragments.js", "designer_clone.js", "designer_selection.js",
    "designer_dom.js", "designer_note_dom.js", "designer_feedback.js",
    "designer_render.js", "designer_note_edit.js", "designer_commands.js",
    "designer_interaction.js", "designer_core_api.js",
]
assert "import " not in workflow, "public entry must be a self-contained classic script"
for module_name in internal_imports:
    assert f'import "./{module_name}";' not in workflow, f"public entry must not import {module_name}"
    module_source = (SRC / module_name).read_text(encoding="utf-8").strip()
    assert module_source in workflow, f"standalone entry is stale: missing current {module_name}"
sample_css = (SAMPLE / "sample.css").read_text(encoding="utf-8")
core_css = (SRC / "workflow_designer.css").read_text(encoding="utf-8")
assert "dataset.nodeGrid" in workflow
assert "--zwd-grid-size" in workflow
assert ' .zwd[data-node-grid="enabled"] .zwd-world'.strip() in core_css
assert "var(--zwd-grid-size)" in core_css
assert ".zwd" not in sample_css, "sample CSS must not contain WorkflowDesigner library selectors"

# The sample page layout must not be what gives WorkflowDesigner its height.
# Height belongs to the direct sample host (.designer-card); #workflow-root then fills it.
import re

def css_rule(css, selector):
    match = re.search(r"(?:^|\n)" + re.escape(selector) + r"\s*\{([^}]*)\}", css, re.S)
    assert match, f"missing CSS rule: {selector}"
    return match.group(1)

sample_layout_rule = css_rule(sample_css, ".sample-layout")
designer_card_rule = css_rule(sample_css, ".designer-card")
workflow_root_rule = css_rule(sample_css, "#workflow-root")
assert "height:" not in sample_layout_rule, "sample page layout must not define the designer height"
assert "height: calc(100vh - 124px)" in designer_card_rule, "direct designer host must define sample height"
assert "min-height: 650px" in designer_card_rule, "direct designer host must define sample minimum height"
assert "width: 100%" in workflow_root_rule
assert "height: 100%" in workflow_root_rule

readme = (ROOT / "README.md").read_text(encoding="utf-8")
assert "配置先要素には、表示可能な高さを明示的に確保してください" in readme
assert "`height: 100%`を使用する場合" in readme
assert "親要素にも確定した高さ" in readme
assert "`sample/sample.css`は読み込みません" in readme
assert '<script src="./src/workflow_designer.js"></script>' in readme
assert "file://" in readme
assert 'type="module"' not in readme
assert "sample/minimal.html" in readme
for module_name in internal_imports:
    assert f'<script src="./src/{module_name}"></script>' not in readme, f"README must not require internal module {module_name}"

render = (SRC / "designer_render.js").read_text(encoding="utf-8")
interaction = (SRC / "designer_interaction.js").read_text(encoding="utf-8")
assert "setNodeMovePreview" in render
assert "requestAnimationFrame" in render
assert "incidentEdgeKeysByNode" in render
assert "workflowPreviewEdgePath" in render
assert "workflowRoundedOrthogonalPath" in render
assert " C " not in render.split("function edgePath", 1)[1].split("function previewEdgePath", 1)[0]
assert "renderer.setNodeMovePreview" in interaction

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
assert '.zwd-loop-frame' not in sample_css
assert ".zwd-node--start .zwd-node__visual" in core_css
assert "border-radius: 999px 0 0 999px" in core_css
assert ".zwd-node--end .zwd-node__visual" in core_css
assert "border-radius: 0 999px 999px 0" in core_css
assert ".zwd-node--start," not in sample_css, "sample CSS must not own START/END terminal geometry"

minimal_html = (SAMPLE / "minimal.html").read_text(encoding="utf-8")
minimal_js = (SAMPLE / "minimal.js").read_text(encoding="utf-8")
minimal_css = (SAMPLE / "minimal.css").read_text(encoding="utf-8")
assert '<link rel="stylesheet" href="../src/workflow_designer.css">' in minimal_html
assert '<link rel="stylesheet" href="./minimal.css">' in minimal_html
assert '<script src="../src/workflow_designer.js"></script>' in minimal_html
assert '<script src="./minimal.js"></script>' in minimal_html
assert 'type="module"' not in minimal_html
assert "import " not in minimal_js
assert "fetch(" not in minimal_js
for marker in [
    'graphMode: "dag"',
    'nodeGrid: { enabled: true, size: 22 }',
    'connectionSnapDistance: 24',
    'document:change',
    'node:add-request',
    'connect:create-request',
    'delete:request',
    'history.undo',
    'history.redo',
    'resolveConnectionScope',
    'deleteSelection',
]:
    assert marker in minimal_js, f"minimal sample missing core editing behavior: {marker}"
for demo_marker in [
    'runDemo',
    'event-log',
    'window.workflowDesignerSample',
    'nodeRenderers',
    'external-link:open-request',
    'setTimeout(',
    'waiting',
    'running',
    'success',
]:
    assert demo_marker not in minimal_js, f"minimal sample contains demo-only behavior: {demo_marker}"
assert '#workflow-root' in minimal_css
assert 'height: 100vh' in minimal_css
assert '.zwd' not in minimal_css, "minimal CSS must not own library selectors"

print("sample static verification passed")
