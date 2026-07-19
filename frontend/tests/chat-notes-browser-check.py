import json
import os
import urllib.request

from playwright.sync_api import sync_playwright


FRONTEND = os.environ.get("CHAT_NOTES_FRONTEND_URL", "http://127.0.0.1:3100")
BACKEND = os.environ.get("CHAT_NOTES_BACKEND_URL", "http://127.0.0.1:8100")


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


for existing in api("/api/notes/1002"):
    if existing.get("content") == "故障注入验证记录":
        api(f"/api/notes/{existing['id']}", "DELETE")

note = api(
    "/api/notes",
    "POST",
    {
        "student_id": "1002",
        "date": "2026-07-19",
        "category": "谈话",
        "content": "故障注入验证记录",
        "follow_up": "下周复盘",
    },
)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page_errors = []
    page = browser.new_page(viewport={"width": 390, "height": 844})
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    sse_responses = iter(
        [
            [
                {"type": "tool_call", "call_id": "ok-1", "name": "band_trend", "input": {"grade": 3}},
                {"type": "tool_result", "call_id": "ok-1", "name": "band_trend", "output": {"rows": 2}},
                {"type": "text", "delta": "工具查询成功"},
                {"type": "done"},
            ],
            [
                {"type": "tool_call", "call_id": "fail-1", "name": "student_notes", "input": {"student_id": "outside"}},
                {"type": "tool_error", "call_id": "fail-1", "name": "student_notes", "error": "该学生不属于当前班级作用域"},
                {"type": "text", "delta": "工具执行失败"},
                {"type": "done"},
            ],
        ]
    )

    def fulfill_chat(route):
        events = next(sse_responses)
        body = "".join(f"data: {json.dumps(event, ensure_ascii=False)}\n\n" for event in events)
        route.fulfill(status=200, content_type="text/event-stream", body=body)

    page.route("**/api/chat", fulfill_chat)
    page.goto(f"{FRONTEND}/student/1002", wait_until="networkidle")
    page.get_by_role("button", name="打开 AI 对话助手").click()
    page.get_by_role("dialog").wait_for()
    chat_input = page.get_by_placeholder("问我任何关于成绩的问题...")
    chat_input.fill("分析班级趋势")
    page.get_by_role("button", name="发送").click()
    page.get_by_text("工具查询成功").wait_for()
    assert page.get_by_text("成功", exact=True).count() == 1

    chat_input.fill("查询外班学生")
    page.get_by_role("button", name="发送").click()
    page.get_by_text("工具执行失败").wait_for()
    assert page.get_by_text("失败", exact=True).count() == 1
    assert page.get_by_text("成功", exact=True).count() == 1
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")

    page.keyboard.press("Escape")
    note_article = page.locator("article").filter(has_text="故障注入验证记录")
    note_article.wait_for()

    page.route(f"**/api/notes/{note['id']}", lambda route: route.abort("failed"))
    note_article.get_by_role("checkbox").click()
    page.get_by_role("alert").filter(has_text="跟进状态更新失败，请检查网络后重试").wait_for()

    page.once("dialog", lambda dialog: dialog.accept())
    note_article.get_by_role("button", name="删除档案记录").click()
    page.get_by_role("alert").filter(has_text="删除档案失败，请检查网络后重试").wait_for()
    assert not page_errors, page_errors

    # 无绑定班级时，输入和发送均不可用，也不会发出 AI 请求。
    unbound = browser.new_page(viewport={"width": 390, "height": 844})
    chat_request_count = [0]

    def count_chat(route):
        chat_request_count[0] += 1
        route.abort()

    unbound.route(
        "**/api/teacher",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"id": 1, "target_class_high1": None, "target_class_high2": None, "target_class_high3": None, "active_grade": 1}),
        ),
    )
    unbound.route("**/api/chat", count_chat)
    unbound.goto(FRONTEND, wait_until="networkidle")
    unbound.get_by_role("button", name="打开 AI 对话助手").click()
    unbound.get_by_role("dialog").wait_for()
    assert unbound.get_by_placeholder("问我任何关于成绩的问题...").is_disabled()
    assert unbound.get_by_role("button", name="发送").is_disabled()
    assert chat_request_count[0] == 0

    unbound.close()
    page.close()
    browser.close()

api(f"/api/notes/{note['id']}", "DELETE")
print("chat/notes browser checks passed: scoped disable, real tool states, network error handling, 390px")
