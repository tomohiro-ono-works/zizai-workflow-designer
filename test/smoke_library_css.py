from pathlib import Path
import sys

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
      nodeGrid: {{ enabled: true, size: 32, origin: {{ x: 44, y: 40 }} }},
      nodeMetrics: {{ width: 96, height: 80, visualSize: 44, iconSize: 24 }},
      nodeRenderers: {{
        default: {{
          renderIcon() {{
            const icon = document.createElement("img");
            icon.alt = "";
            return icon;
          }}
        }}
      }},
      document: {{
        metadata: {{}},
        steps: [{{
          step_id: "01",
          flow_id: "01",
          node_type: "task",
          label: "処理",
          description: "最小構成",
          ui_position: {{ x: 140, y: 40 }}
        }}],
        flows: {{
          "01": {{
            start: {{ ui_position: {{ x: 44, y: 40 }} }},
            end: {{ ui_position: {{ x: 236, y: 40 }} }},
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
    launch_options = {
        "headless": True,
        "args": ["--no-sandbox", "--disable-dev-shm-usage"],
    }
    system_chromium = Path("/usr/bin/chromium")
    if system_chromium.exists():
        launch_options["executable_path"] = str(system_chromium)
    elif sys.platform == "win32":
        launch_options["channel"] = "msedge"
    browser = playwright.chromium.launch(**launch_options)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.on("console", lambda message: errors.append(f"console {message.type}: {message.text}") if message.type == "error" else None)
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.set_content(html, wait_until="load", timeout=30_000)
    page.wait_for_selector("[data-workflow-designer]", timeout=10_000)

    shell = page.locator(".zwd").evaluate(
        "element => ({position:getComputedStyle(element).position, width:getComputedStyle(element).width, height:getComputedStyle(element).height, overflow:getComputedStyle(element).overflow})"
    )
    assert shell == {"position": "relative", "width": "1200px", "height": "720px", "overflow": "hidden"}

    metrics = page.locator(".zwd").evaluate(
        """element => {
          const style = getComputedStyle(element);
          return {
            width: style.getPropertyValue('--zwd-node-width').trim(),
            height: style.getPropertyValue('--zwd-node-height').trim(),
            visual: style.getPropertyValue('--zwd-node-visual-size').trim(),
            icon: style.getPropertyValue('--zwd-node-icon-size').trim(),
            gridX: style.getPropertyValue('--zwd-grid-origin-x').trim(),
            gridY: style.getPropertyValue('--zwd-grid-origin-y').trim()
          };
        }"""
    )
    assert metrics == {
        "width": "96px",
        "height": "80px",
        "visual": "44px",
        "icon": "24px",
        "gridX": "44px",
        "gridY": "40px",
    }

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
    assert edge["stroke"] == "rgb(148, 163, 184)"
    assert edge["width"] == "2px"

    marker = page.locator(".zwd-layer--edges marker").evaluate(
        "element => ({width:element.getAttribute('markerWidth'), height:element.getAttribute('markerHeight'), refX:element.getAttribute('refX'), refY:element.getAttribute('refY'), path:element.querySelector('.zwd-arrow').getAttribute('d')})"
    )
    assert marker == {
        "width": "6.4",
        "height": "6.4",
        "refX": "5.6",
        "refY": "3.2",
        "path": "M0,0 L6.4,3.2 L0,6.4 Z",
    }

    node = page.locator(".zwd-node").first.evaluate(
        "element => ({position:getComputedStyle(element).position, pointer:getComputedStyle(element).pointerEvents, select:getComputedStyle(element).userSelect})"
    )
    assert node == {"position": "absolute", "pointer": "auto", "select": "none"}

    step_geometry = page.locator(".zwd-node--step").evaluate(
        """element => {
          const box = element.getBoundingClientRect();
          const visual = element.querySelector('.zwd-node__visual').getBoundingClientRect();
          const icon = element.querySelector('.zwd-node__icon').getBoundingClientRect();
          const input = element.querySelector('[data-zwd-port-role="in"]').getBoundingClientRect();
          const output = element.querySelector('[data-zwd-port-role="out"]').getBoundingClientRect();
          return {
            box: [box.width, box.height],
            visual: [visual.width, visual.height],
            icon: [icon.width, icon.height],
            inputCenter: [input.left + input.width / 2 - box.left, input.top + input.height / 2 - box.top],
            outputCenter: [output.left + output.width / 2 - box.left, output.top + output.height / 2 - box.top]
          };
        }"""
    )
    assert step_geometry == {
        "box": [96, 80],
        "visual": [44, 44],
        "icon": [24, 24],
        "inputCenter": [26, 22],
        "outputCenter": [70, 22],
    }
    assert page.locator(".zwd-node--step .zwd-node__label").evaluate(
        "element => getComputedStyle(element).fontSize"
    ) == "12px"

    note = page.locator(".zwd-note").first.evaluate(
        "element => ({position:getComputedStyle(element).position, pointer:getComputedStyle(element).pointerEvents})"
    )
    assert note == {"position": "absolute", "pointer": "auto"}
    assert not errors, errors
    browser.close()

print("library CSS standalone smoke test passed")
