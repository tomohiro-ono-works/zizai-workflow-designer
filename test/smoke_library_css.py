from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

library_css = (SRC / "workflow_designer.css").read_text(encoding="utf-8")
library_js = (SRC / "workflow_designer.js").read_text(encoding="utf-8")
html = f'''<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <style>{library_css}</style>
  <style>
    html, body {{ margin: 0; }}
    #workflow-root {{ width: 1200px; height: 720px; }}
  </style>
</head>
<body>
  <div id="workflow-root"></div>
  <script>{library_js}</script>
  <script>
    const {{ createWorkflowDesigner }} = window.zizPackages.workflowDesigner;
    const designer = createWorkflowDesigner({{
      root: document.getElementById("workflow-root"),
      nodeGrid: {{ enabled: true, size: 22 }},
      document: {{
        metadata: {{}},
        steps: [{{
          step_id: "01",
          flow_id: "01",
          node_type: "task",
          label: "処理",
          description: "最小構成",
          ui_position: {{ x: 330, y: 220 }}
        }}],
        flows: {{
          "01": {{
            start: {{ ui_position: {{ x: 110, y: 242 }} }},
            end: {{ ui_position: {{ x: 590, y: 242 }} }},
            edges: [
              {{ from: "START", to: "01", order: 1 }},
              {{ from: "01", to: "END", order: 2 }}
            ]
          }}
        }},
        notes: [{{
          note_id: "01",
          ui_position: {{ x: 300, y: 430 }},
          size: {{ width: 240, height: 120 }},
          text: "note",
          color: "#fff2a8"
        }}]
      }}
    }});
    designer.mount();
  </script>
</body>
</html>'''

errors: list[str] = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/usr/bin/chromium",
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("console", lambda message: errors.append(f"console {message.type}: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.set_content(html, wait_until="load", timeout=30_000)
    page.wait_for_selector("[data-workflow-designer]", timeout=10_000)

    shell = page.locator(".zwd").evaluate(
        "element => ({position:getComputedStyle(element).position, width:getComputedStyle(element).width, height:getComputedStyle(element).height, overflow:getComputedStyle(element).overflow})"
    )
    assert shell == {"position": "relative", "width": "1200px", "height": "720px", "overflow": "hidden"}

    viewport = page.locator(".zwd-viewport").evaluate(
        "element => ({width:getComputedStyle(element).width, height:getComputedStyle(element).height, overflow:getComputedStyle(element).overflow, touchAction:getComputedStyle(element).touchAction})"
    )
    assert viewport == {"width": "1200px", "height": "720px", "overflow": "hidden", "touchAction": "none"}

    world = page.locator(".zwd-world").evaluate(
        "element => ({position:getComputedStyle(element).position, origin:getComputedStyle(element).transformOrigin, background:getComputedStyle(element).backgroundImage})"
    )
    assert world["position"] == "absolute"
    assert world["origin"].startswith("0px 0px")
    assert world["background"] != "none"

    edge = page.locator(".zwd-edge__line").first.evaluate(
        "element => ({fill:getComputedStyle(element).fill, stroke:getComputedStyle(element).stroke, width:getComputedStyle(element).strokeWidth})"
    )
    assert edge["fill"] == "none"
    assert edge["width"] == "2px"

    node = page.locator(".zwd-node").first.evaluate(
        "element => ({position:getComputedStyle(element).position, pointer:getComputedStyle(element).pointerEvents, select:getComputedStyle(element).userSelect})"
    )
    assert node == {"position": "absolute", "pointer": "auto", "select": "none"}

    note = page.locator(".zwd-note").first.evaluate(
        "element => ({position:getComputedStyle(element).position, pointer:getComputedStyle(element).pointerEvents})"
    )
    assert note == {"position": "absolute", "pointer": "auto"}
    assert not errors, errors
    browser.close()

print("library CSS standalone smoke test passed")
