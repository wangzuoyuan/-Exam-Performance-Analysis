"""390px adversarial check for upload unbinding and rollover write errors."""

import sys
from playwright.sync_api import sync_playwright


BASE = "http://127.0.0.1:3100"


def main() -> int:
    page_errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        state = {
            "teacher": {
                "id": 1,
                "name": "王老师",
                "target_class_high1": 4,
                "target_class_high2": 3,
                "target_class_high3": 8,
                "has_pending_rollover": False,
                "active_grade": 1,
            },
            "bind_mode": "success",
            "bind_bodies": [],
        }

        def api(route):
            request = route.request
            path = request.url.split("/api/", 1)[-1]
            if path.startswith("teacher/bind-class"):
                body = request.post_data_json
                state["bind_bodies"].append(body)
                if state["bind_mode"] == "detail-error":
                    route.fulfill(status=409, content_type="application/json", body='{"detail":"该班已被其他教师占用"}')
                    return
                key = f"target_class_high{body['grade']}"
                state["teacher"][key] = body.get("class_num")
                route.fulfill(status=200, content_type="application/json", body='{"ok":true}')
                return
            if path == "teacher":
                import json
                route.fulfill(status=200, content_type="application/json", body=json.dumps(state["teacher"]))
                return
            if path.startswith("rollover/roster"):
                route.abort("failed")
                return
            route.fulfill(status=200, content_type="application/json", body="{}")

        page.route("**/api/**", api)

        page.goto(f"{BASE}/upload")
        page.wait_for_load_state("networkidle")
        for grade in (1, 2, 3):
            field = page.locator("div.space-y-1\\.5").filter(has_text=f"高{grade} 班级").get_by_role("combobox")
            field.click()
            page.get_by_role("option", name="未带班").click()
        page.get_by_role("button", name="更新绑定").click()
        page.wait_for_function("() => document.body.innerText.includes('高一 未绑定') && document.body.innerText.includes('高三 未绑定')")
        assert [body["class_num"] for body in state["bind_bodies"][-3:]] == [None, None, None]
        assert page.evaluate("document.documentElement.scrollWidth") <= 390

        state["teacher"].update({
            "target_class_high1": 4,
            "target_class_high2": 3,
            "target_class_high3": None,
            "active_grade": 1,
        })
        state["bind_mode"] = "detail-error"
        page.goto(f"{BASE}/settings/rollover")
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name="确认绑定").click()
        page.get_by_text("该班已被其他教师占用").wait_for()

        page.get_by_role("button", name="从该班成绩派生名册").click()
        page.get_by_text("派生名册失败", exact=False).wait_for()
        page.wait_for_timeout(100)
        assert not page_errors, page_errors
        assert page.evaluate("document.documentElement.scrollWidth") <= 390
        browser.close()
    print("rollover browser check: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
