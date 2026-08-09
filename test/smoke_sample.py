from base64 import b64encode
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
SAMPLE = ROOT / "sample"


def inline_sample() -> str:
    html = (SAMPLE / "index.html").read_text(encoding="utf-8")
    sample_css = (SAMPLE / "sample.css").read_text(encoding="utf-8")
    library_css = (SRC / "workflow_designer.css").read_text(encoding="utf-8")
    html = html.replace(
        '<link rel="stylesheet" href="./sample.css">',
        f"<style>\n{sample_css}\n</style>",
    )
    html = html.replace(
        '<link rel="stylesheet" href="../src/workflow_designer.css">',
        f"<style>\n{library_css}\n</style>",
    )

    scripts = [
        "designer_types.js",
        "designer_grid.js",
        "designer_events.js",
        "designer_document.js",
        "designer_ids.js",
        "designer_graph.js",
        "designer_fragments.js",
        "designer_clone.js",
        "designer_selection.js",
        "designer_dom.js",
        "designer_note_dom.js",
        "designer_feedback.js",
        "designer_render.js",
        "designer_note_edit.js",
        "designer_commands.js",
        "designer_interaction.js",
        "designer_core_api.js",
        "workflow_designer.js",
    ]
    for name in scripts:
        javascript = (SRC / name).read_text(encoding="utf-8")
        html = html.replace(
            f'<script src="../src/{name}"></script>',
            f"<script>\n{javascript}\n</script>",
        )

    javascript = (SAMPLE / "sample_app.js").read_text(encoding="utf-8")
    for icon in ["database.svg", "cloud.svg"]:
        encoded = b64encode((SAMPLE / "icons" / icon).read_bytes()).decode("ascii")
        javascript = javascript.replace(
            f"./icons/{icon}", f"data:image/svg+xml;base64,{encoded}"
        )
    html = html.replace(
        '<script src="./sample_app.js"></script>',
        f"<script>\n{javascript}\n</script>",
    )
    return html


errors: list[str] = []
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(
        headless=True,
        executable_path="/usr/bin/chromium",
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.on(
        "console",
        lambda message: errors.append(f"console {message.type}: {message.text}")
        if message.type == "error"
        else None,
    )
    page.on("pageerror", lambda error: errors.append(f"pageerror: {error}"))
    page.set_content(inline_sample(), wait_until="load", timeout=30_000)
    page.wait_for_selector("[data-workflow-designer]", timeout=10_000)

    assert page.locator(".zwd-node").count() == 9
    assert page.locator(".zwd-loop-frame").count() == 0
    assert page.locator(".zwd-toolbar .zwd-tool").count() == 6
    assert page.locator('.zwd-node__icon img').count() == 2
    assert page.locator('.zwd-node__icon svg').count() == 5
    assert page.locator('[data-run-status="idle"]').count() == 9
    assert page.locator('[data-run-status="waiting"]').count() == 0
    assert page.locator('[data-run-status="running"]').count() == 0
    assert page.locator('[data-run-status="error"]').count() == 0
    assert page.locator('.zwd-node__validation:not([hidden])').count() == 0
    assert page.locator('.zwd-node__visual').count() == 9
    assert page.locator('.zwd-node__description:not([hidden])').count() == 7
    loop_node = page.locator('[data-node-id="05"]')
    assert loop_node.locator('[data-zwd-port-role="in"]').count() == 1
    assert loop_node.locator('[data-zwd-port-role="done"]').count() == 1
    assert loop_node.locator('[data-zwd-port-role="loop"]').count() == 1
    assert loop_node.locator('.zwd-node__port-label').all_text_contents() == ["done", "loop"]
    standard_roles = sorted(page.locator('[data-node-id="01"] [data-zwd-port-role]').evaluate_all(
        "elements => elements.map(element => element.dataset.zwdPortRole)"
    ))
    assert standard_roles == ["in", "out"]
    start_roles = page.locator('.zwd-node--start [data-zwd-port-role]').evaluate_all(
        "elements => elements.map(element => element.dataset.zwdPortRole)"
    )
    end_roles = page.locator('.zwd-node--end [data-zwd-port-role]').evaluate_all(
        "elements => elements.map(element => element.dataset.zwdPortRole)"
    )
    assert start_roles == ["out"]
    assert end_roles == ["in"]
    main_path = page.locator('[data-edge-key="flow:01:edge:05:03"] .zwd-edge__line').get_attribute("d")
    assert main_path.startswith("M 880 202")
    assert " Q " in main_path and " C " not in main_path
    assert page.locator('[data-edge-key="loop:05:edge:START:06"] .zwd-edge__line').get_attribute("d").startswith("M 880 238")
    visual_style = page.locator('[data-node-id="01"] .zwd-node__visual').evaluate(
        "element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height, radius: getComputedStyle(element).borderRadius })"
    )
    assert visual_style == {"width": "88px", "height": "88px", "radius": "6px"}
    start_visual_style = page.locator('.zwd-node--start .zwd-node__visual').evaluate(
        "element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height, radius: getComputedStyle(element).borderRadius })"
    )
    end_visual_style = page.locator('.zwd-node--end .zwd-node__visual').evaluate(
        "element => ({ width: getComputedStyle(element).width, height: getComputedStyle(element).height, radius: getComputedStyle(element).borderRadius })"
    )
    assert start_visual_style == {"width": "88px", "height": "88px", "radius": "44px 0px 0px 44px"}
    assert end_visual_style == {"width": "88px", "height": "88px", "radius": "0px 44px 44px 0px"}

    start_visual_box = page.locator('.zwd-node--start .zwd-node__visual').bounding_box()
    start_port_box = page.locator('.zwd-node--start [data-zwd-port-role="out"]').bounding_box()
    end_visual_box = page.locator('.zwd-node--end .zwd-node__visual').bounding_box()
    end_port_box = page.locator('.zwd-node--end [data-zwd-port-role="in"]').bounding_box()
    assert start_visual_box and start_port_box and end_visual_box and end_port_box
    assert abs((start_port_box["y"] + start_port_box["height"] / 2) - (start_visual_box["y"] + start_visual_box["height"] / 2)) < 0.01
    assert abs((end_port_box["y"] + end_port_box["height"] / 2) - (end_visual_box["y"] + end_visual_box["height"] / 2)) < 0.01

    terminal_colors = page.locator('.zwd-node--start .zwd-node__visual, .zwd-node--end .zwd-node__visual').evaluate_all(
        "elements => elements.map(element => getComputedStyle(element).backgroundColor)"
    )
    assert terminal_colors == ["rgb(75, 85, 99)", "rgb(75, 85, 99)"]

    moving_node = page.locator('[data-node-id="01"]')
    moving_box = moving_node.bounding_box()
    moving_edge = page.locator(
        '[data-edge-key="flow:01:edge:01:02"] .zwd-edge__line'
    )
    assert moving_box and moving_edge.count() == 1
    edge_before_drag = moving_edge.get_attribute("d")
    page.mouse.move(
        moving_box["x"] + moving_box["width"] / 2,
        moving_box["y"] + moving_box["height"] / 2,
    )
    page.mouse.down()
    page.mouse.move(
        moving_box["x"] + moving_box["width"] / 2 + 16,
        moving_box["y"] + moving_box["height"] / 2 + 4,
        steps=4,
    )
    page.wait_for_timeout(50)
    edge_during_drag = moving_edge.get_attribute("d")
    assert edge_during_drag != edge_before_drag
    assert edge_during_drag.startswith("M ") and " C " not in edge_during_drag
    preview_transform = moving_node.evaluate("element => element.style.transform")
    assert preview_transform == "translate(22px, 0px)"
    page.mouse.up()
    page.wait_for_timeout(50)
    edge_after_drag = moving_edge.get_attribute("d")
    assert edge_after_drag != edge_before_drag
    moved_step = next(
        step
        for step in page.evaluate("window.workflowDesignerSample.getDocument().steps")
        if step["step_id"] == "01"
    )
    assert moved_step["ui_position"]["x"] % 22 == 0
    assert moved_step["ui_position"]["y"] % 22 == 0
    page.locator(".zwd").dispatch_event("click")

    edge_count = page.locator(".zwd-edge").count()
    near_source = page.locator('[data-node-id="01"] [data-zwd-port-role="out"]').bounding_box()
    near_target = page.locator('[data-node-id="03"] [data-zwd-port-role="in"]').bounding_box()
    assert near_source and near_target
    page.mouse.move(
        near_source["x"] + near_source["width"] / 2,
        near_source["y"] + near_source["height"] / 2,
    )
    page.mouse.down()
    page.mouse.move(
        near_target["x"] + near_target["width"] / 2,
        near_target["y"] + near_target["height"] / 2,
        steps=8,
    )
    preview_path = page.locator('.zwd-connection-preview').get_attribute("d")
    assert preview_path and preview_path.startswith("M ") and " C " not in preview_path
    assert "translate(" not in (page.locator('[data-node-id="01"]').get_attribute("style") or "")
    page.mouse.up()
    page.wait_for_timeout(50)
    assert page.locator(".zwd-edge").count() == edge_count + 1
    assert any(
        edge["from"] == "01" and edge["to"] == "03"
        for edge in page.evaluate(
            "window.workflowDesignerSample.getDocument().flows['01'].edges"
        )
    )

    edge_count = page.locator(".zwd-edge").count()
    loop_port_box = page.locator('[data-node-id="05"] [data-zwd-port-role="loop"]').bounding_box()
    loop_target_box = page.locator('[data-node-id="07"] .zwd-node__visual').bounding_box()
    assert loop_port_box and loop_target_box
    page.mouse.move(
        loop_port_box["x"] + loop_port_box["width"] / 2,
        loop_port_box["y"] + loop_port_box["height"] / 2,
    )
    page.mouse.down(button="right")
    page.mouse.move(
        loop_target_box["x"] + 2,
        loop_target_box["y"] + loop_target_box["height"] / 2,
        steps=8,
    )
    page.mouse.up(button="right")
    page.wait_for_timeout(50)
    assert page.locator(".zwd-edge").count() == edge_count + 1
    assert any(
        edge["from"] == "START" and edge["to"] == "07"
        for edge in page.evaluate(
            "window.workflowDesignerSample.getDocument().loop.flows['05'].edges"
        )
    )
    assert '"source_port": "loop"' in page.locator("#event-log").text_content()

    edge_count = page.locator(".zwd-edge").count()
    source_box = page.locator('[data-node-id="07"] .zwd-node__visual').bounding_box()
    target_box = page.locator('[data-node-id="06"] .zwd-node__visual').bounding_box()
    assert source_box and target_box
    page.mouse.move(
        source_box["x"] + source_box["width"] / 2,
        source_box["y"] + source_box["height"] / 2,
    )
    page.mouse.down(button="right")
    page.mouse.move(
        target_box["x"] + 2,
        target_box["y"] + target_box["height"] / 2,
        steps=8,
    )
    page.mouse.up(button="right")
    page.wait_for_timeout(50)
    assert page.locator(".zwd-edge").count() == edge_count
    assert page.locator(".zwd-message").text_content() == (
        "循環する接続は作成できません。"
    )

    node_count = page.locator(".zwd-node").count()
    page.mouse.click(1300, 800, button="right")
    page.locator('[data-context-command="node.add"]').click()
    assert page.locator(".zwd-node").count() == node_count + 1
    assert page.locator('[data-node-id="08"]').count() == 1
    added_node = next(
        step
        for step in page.evaluate("window.workflowDesignerSample.getDocument().steps")
        if step["step_id"] == "08"
    )
    assert added_node["ui_position"]["x"] % 22 == 0
    assert added_node["ui_position"]["y"] % 22 == 0

    notes = page.locator(".zwd-note")
    assert notes.count() == 1
    page.locator('[data-zwd-command="annotation.add"]').click()
    assert notes.count() == 2
    page.locator('[data-zwd-command="history.undo"]').click()
    assert notes.count() == 1
    page.locator('[data-zwd-command="history.redo"]').click()
    assert notes.count() == 2

    before = page.locator(".zwd-world").get_attribute("style")
    page.locator('[data-zwd-command="viewport.zoom-in"]').click()
    after = page.locator(".zwd-world").get_attribute("style")
    assert before != after

    page.locator('[data-zwd-command="workflow.run"]').click()
    page.wait_for_timeout(100)
    assert page.locator('[data-run-status="running"]').count() == 1
    assert page.locator('[data-run-status="waiting"]').count() == 7

    assert not errors, errors
    browser.close()

print("sample browser smoke test passed")
