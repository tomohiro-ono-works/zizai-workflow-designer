from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SAMPLE = ROOT / "sample"

html = (SAMPLE / "minimal.html").read_text(encoding="utf-8")
css = (SRC / "workflow_designer.css").read_text(encoding="utf-8")
minimal_css = (SAMPLE / "minimal.css").read_text(encoding="utf-8")
workflow_js = (SRC / "workflow_designer.js").read_text(encoding="utf-8")
minimal_js = (SAMPLE / "minimal.js").read_text(encoding="utf-8")

# Direct-open structure: classic relative resources only. No module/import/fetch dependency.
assert '<link rel="stylesheet" href="../src/workflow_designer.css">' in html
assert '<link rel="stylesheet" href="./minimal.css">' in html
assert '<script src="../src/workflow_designer.js"></script>' in html
assert '<script src="./minimal.js"></script>' in html
assert 'type="module"' not in html
assert "import " not in minimal_js
assert "fetch(" not in minimal_js

# Browser behavior is tested with the exact source files injected as classic scripts/styles.
# (The managed Chromium in this environment blocks file:// navigation itself.)
errors: list[str] = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/usr/bin/chromium",
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 1280, "height": 820})
    page.on(
        "console",
        lambda message: errors.append(f"console {message.type}: {message.text}")
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))

    page.set_content(
        '<!doctype html><html><body><div id="workflow-root"></div></body></html>',
        wait_until="load",
    )
    page.add_style_tag(content=css)
    page.add_style_tag(content=minimal_css)
    page.add_script_tag(content=workflow_js)
    page.add_script_tag(content=minimal_js)
    page.wait_for_selector("[data-workflow-designer]", timeout=10_000)

    # Core sample starts with a complete editable graph including a LOOP.
    initial_nodes = page.locator(".zwd-node").count()
    initial_edges = page.locator(".zwd-edge").count()
    assert initial_nodes >= 6  # START/END + normal/loop/loop-body nodes
    assert initial_edges >= 6
    assert page.locator('.zwd[data-node-grid="enabled"]').count() == 1
    grid_size = page.locator(".zwd").evaluate(
        "element => getComputedStyle(element).getPropertyValue('--zwd-grid-size').trim()"
    )
    assert grid_size == "22px"

    # Dragging follows the configured 22px node grid.
    node01 = page.locator('[data-node-id="01"]')
    visual01 = page.locator('[data-node-id="01"] .zwd-node__visual')
    before = node01.evaluate("element => [element.style.left, element.style.top]")
    box = visual01.bounding_box()
    assert box
    drag_x = box["x"] + box["width"] / 2
    drag_y = box["y"] + box["height"] / 2
    page.mouse.move(drag_x, drag_y)
    page.mouse.down()
    page.mouse.move(drag_x + 18, drag_y + 18, steps=5)
    page.mouse.up()
    page.wait_for_timeout(80)
    after = node01.evaluate("element => [element.style.left, element.style.top]")
    assert before == ["242px", "176px"]
    assert after == ["264px", "198px"]
    # The library suppresses the click that follows a completed drag. Clear that click here.
    page.locator(".zwd-viewport").click(position={"x": 40, "y": 760})

    # Node add request is handled by the minimal application.
    viewport = page.locator(".zwd-viewport")
    viewport.click(button="right", position={"x": 560, "y": 610})
    page.locator('[data-context-command="node.add"]').click()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-node").count() == initial_nodes + 1

    # The new node can be connected using the standard ports.
    new_node = page.locator('[data-node-id="05"]')
    assert new_node.count() == 1
    source_port = page.locator('[data-node-id="04"] [data-zwd-port-role="out"]')
    target_port = page.locator('[data-node-id="05"] [data-zwd-port-role="in"]')
    s = source_port.bounding_box()
    t = target_port.bounding_box()
    assert s and t
    page.mouse.move(s["x"] + s["width"] / 2, s["y"] + s["height"] / 2)
    page.mouse.down()
    page.mouse.move(t["x"] + t["width"] / 2, t["y"] + t["height"] / 2, steps=8)
    page.mouse.up()
    page.wait_for_timeout(80)
    assert page.locator(".zwd-edge").count() == initial_edges + 1

    # Selection deletion removes the node and its connected edge; Undo/Redo restores it.
    # Clear the click suppression from the connection drag, select the node, then delete it.
    page.locator(".zwd-viewport").click(position={"x": 40, "y": 760})
    new_node.click()
    page.locator(".zwd").focus()
    page.keyboard.press("Delete")
    page.wait_for_timeout(50)
    assert page.locator(".zwd-node").count() == initial_nodes
    assert page.locator(".zwd-edge").count() == initial_edges
    page.locator('[data-zwd-command="history.undo"]').click()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-node").count() == initial_nodes + 1
    assert page.locator(".zwd-edge").count() == initial_edges + 1
    page.locator('[data-zwd-command="history.redo"]').click()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-node").count() == initial_nodes
    assert page.locator(".zwd-edge").count() == initial_edges

    # Sticky note edits are controlled-document transactions and Undo/Redo works.
    initial_notes = page.locator(".zwd-note").count()
    page.locator('[data-zwd-command="annotation.add"]').click()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-note").count() == initial_notes + 1
    page.locator('[data-zwd-command="history.undo"]').click()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-note").count() == initial_notes
    page.locator('[data-zwd-command="history.redo"]').click()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-note").count() == initial_notes + 1

    root_size = page.locator("#workflow-root").evaluate(
        "element => ({width: element.clientWidth, height: element.clientHeight})"
    )
    assert root_size["width"] > 0
    assert root_size["height"] >= 600
    assert not errors, errors
    browser.close()

print("minimal full-editing sample smoke test passed")
