import json
import os
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright


FRONTEND = os.environ.get("HOMEWORK_FRONTEND_URL", "http://127.0.0.1:3105")
BACKEND = os.environ.get("HOMEWORK_BACKEND_URL", "http://127.0.0.1:8105")


def api(path, method="GET", payload=None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{BACKEND}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


api("/api/teacher/bind-class", "POST", {"grade": 1, "class_num": 4})
for seat, name in ((1, "测试甲"), (2, "测试乙")):
    try:
        api(
            "/api/homework/roster",
            "POST",
            {"name": name, "seat_no": seat, "class_num": 4, "grade": 1},
        )
    except urllib.error.HTTPError as error:
        if error.code != 400:
            raise

for date in ("2026-03-15", "2026-03-16", "2026-03-17"):
    api(
        "/api/homework/records?class_num=4",
        "POST",
        {"raw_text": "测试甲：数学", "date": date, "mode": "by_student"},
    )


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    console_errors = []
    page_errors = []
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    page.goto(f"{FRONTEND}/homework", wait_until="networkidle")
    page.get_by_role("heading", name="作业跟踪", exact=True).wait_for()
    textarea = page.get_by_label("批量作业记录")
    textarea.fill("测试甲：数学、英语\n格式错误行")
    page.get_by_label("录入解析预览").wait_for()
    assert "2 行" in page.get_by_label("录入解析预览").inner_text()
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

    # 图表的鼠标点击均有可聚焦、可回车触发的等价钻取按钮。
    for label in ("按日期查看缺交记录", "按作业种类查看缺交记录", "按学生查看缺交记录"):
        group = page.get_by_label(label)
        group.wait_for()
        buttons = group.get_by_role("button")
        assert buttons.count() > 0, label
        sizes = buttons.evaluate_all(
            "nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))"
        )
        assert min(item["height"] for item in sizes) >= 44, (label, sizes)

    date_drilldown = page.get_by_label("按日期查看缺交记录").get_by_role("button").first
    date_drilldown.focus()
    page.keyboard.press("Enter")
    page.wait_for_url("**/homework/manage?date=**")
    assert "date=" in page.url
    page.go_back(wait_until="networkidle")

    nav_heights = page.locator('nav[aria-label="作业模块导航"] a').evaluate_all(
        "nodes => nodes.map(node => node.getBoundingClientRect().height)"
    )
    assert nav_heights and min(nav_heights) >= 44

    checks = [
        ("/homework/manage", "记录管理"),
        ("/homework/warnings", "连续缺交预警"),
        ("/homework/settings", "作业设置"),
        ("/homework/correlation", "缺交 × 成绩"),
    ]
    for path, heading in checks:
        page.goto(f"{FRONTEND}{path}", wait_until="networkidle")
        page.get_by_role("heading", name=heading, exact=True).wait_for()
        assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), path

    page.goto(f"{FRONTEND}/homework/warnings", wait_until="networkidle")
    student_links = page.get_by_role("link", name="测试甲")
    assert student_links.count() > 0
    link_sizes = student_links.evaluate_all(
        "nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }))"
    )
    assert min(item["width"] for item in link_sizes) >= 44, link_sizes
    assert min(item["height"] for item in link_sizes) >= 44, link_sizes

    page.goto(f"{FRONTEND}/homework/manage", wait_until="networkidle")
    assert page.locator("article").count() > 0
    assert not page.locator("table").is_visible()

    page.set_viewport_size({"width": 1280, "height": 800})
    page.reload(wait_until="networkidle")
    assert page.locator("table").is_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

    # Next dev 在首次按需编译路由时可能触发一次 Fast Refresh，并记录 RSC 回退；
    # 页面会自动完成浏览器导航。生产构建没有该开发态日志。
    actionable_console_errors = [
        message for message in console_errors if "Failed to fetch RSC payload" not in message
    ]
    assert not actionable_console_errors, actionable_console_errors
    assert not page_errors, page_errors
    browser.close()

print("homework browser checks passed: mobile preview/navigation/cards, desktop table, overflow, console")
