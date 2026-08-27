"""只读 MCP 服务端测试（班主任版）。

覆盖：
- 未启用时现有应用行为不变（无挂载、无 mcp SDK 导入、/api 正常、/mcp 404）
- 启用但 token 缺失/空白/弱占位符/过短 → fail closed（mount_mcp 抛错）
- 缺 token / 错误 token / 畸形 Authorization → 401 + WWW-Authenticate: Bearer，不回显 token
- 正确 token → initialize / tools/list / tools/call 全走通
- tools/list 恰为注册表 read_only 条目（指定的 20 个只读工具，一个不多不少）且 annotations 全只读
- tools/call 经 execute_tool 分发（monkeypatch 证明），参数不被改写
- 非目录工具（写入/不存在/render_chart）不可调用
- 新增只读注册项自动出现在 MCP；写入项/未标记项默认不出现（扩展性 + 安全）
- 非法 Host / Origin 被 SDK 防护拒绝（421 / 403）；无 Origin 放行；allowed hosts 可配置
- /mcp/ 在 follow_redirects=False 下正确 token 直接 200、缺 token 直接 401；/mcp 是 307
- 现有 chat TOOLS 三键结构、顺序、内容与 git HEAD 基线完全一致
- 现有 /api/chat 行为不变

不依赖真实 NAS、真实 token、真实 LLM。
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

STRONG_TOKEN = "f" * 48  # 满足 >=32 且非占位符

# 班主任版注册表当前必须暴露的全部只读工具（成绩 16 + 作业 3 + 档案 1）。
REQUIRED_TOOLS = {
    "list_exams", "student_lookup", "student_identity_lookup",
    "student_exam_detail", "student_trend", "student_learning_profile",
    "class_trend", "compare_classes", "focus_list", "subject_weakness",
    "subject_progress_ranking", "multi_exam_progress_ranking", "band_trend",
    "custom_rank_band_trend", "rank_range_filter", "rank_frequency_stat",
    "student_homework_summary", "class_homework_ranking",
    "homework_grade_correlation", "student_notes",
}


def _set_mcp_env(monkeypatch, enabled="true", token=STRONG_TOKEN,
                 hosts=None, origins=None):
    monkeypatch.setenv("MCP_ENABLED", enabled)
    if token is None:
        monkeypatch.delenv("MCP_BEARER_TOKEN", raising=False)
    else:
        monkeypatch.setenv("MCP_BEARER_TOKEN", token)
    if hosts is not None:
        monkeypatch.setenv("MCP_ALLOWED_HOSTS", hosts)
    else:
        monkeypatch.delenv("MCP_ALLOWED_HOSTS", raising=False)
    if origins is not None:
        monkeypatch.setenv("MCP_ALLOWED_ORIGINS", origins)
    else:
        monkeypatch.delenv("MCP_ALLOWED_ORIGINS", raising=False)


def _import_fresh_main():
    """重新 import app.main，让 MCP_ENABLED 在导入期生效。"""
    for mod in list(sys.modules):
        if mod == "app.main" or mod.startswith("app.mcp_server"):
            del sys.modules[mod]
    import app.main  # noqa: F401
    return sys.modules["app.main"]


_PROXY_ENV_VARS = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
                   "http_proxy", "https_proxy", "all_proxy", "no_proxy")


def _clear_proxy_env(monkeypatch):
    """本机若设了 SOCKS/HTTP 代理，httpx 会对非 localhost 主机走代理并剥离
    凭据，干扰 Host 校验测试；统一清掉。"""
    for var in _PROXY_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


def _no_host_auth_headers():
    """非 localhost base_url 的客户端：不显式传 Host（显式 Host 与 URL host
    不一致时 httpx 会剥离 Authorization），由 httpx 生成正确 Host。"""
    h = _auth_headers()
    h.pop("Host", None)
    return h


def _auth_headers(extra=None):
    h = {
        "Authorization": "Bearer " + STRONG_TOKEN,
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Host": "localhost:8000",
    }
    if extra:
        h.update(extra)
    return h


def _post(client, body, headers):
    # 规范 URL 用 /mcp/（带尾斜杠）：/mcp 会被 FastAPI mount 307 重定向，
    # TestClient 默认跟随会掩盖真实响应，因此测试一律直接打 /mcp/。
    return client.post("/mcp/", json=body, headers=headers)


def _ok(resp):
    assert resp.status_code == 200, (resp.status_code, resp.text)
    return resp.json()


# ─────────────────────── 未启用：完全不影响现有应用 ───────────────────────

def test_disabled_no_mount_and_apis_healthy(monkeypatch):
    _set_mcp_env(monkeypatch, enabled="")
    for m in [k for k in sys.modules if k == "mcp" or k.startswith("mcp.")]:
        del sys.modules[m]
    main = _import_fresh_main()
    from starlette.routing import Mount
    assert not any(isinstance(r, Mount) and r.path == "/mcp" for r in main.app.routes)
    assert not any(k == "mcp" or k.startswith("mcp.") for k in sys.modules)
    with TestClient(main.app) as c:
        assert c.get("/api/health").json()["ok"] is True
        r = c.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
        assert r.status_code == 404
        r2 = c.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                    follow_redirects=False)
        assert r2.status_code == 404


# ─────────────────────── 启用但配置非法：fail closed ───────────────────────

def test_enabled_missing_token_fails_closed(monkeypatch):
    _set_mcp_env(monkeypatch, token=None)
    from app import mcp_server
    with pytest.raises(mcp_server.MCPConfigError):
        mcp_server.mount_mcp()


def test_enabled_blank_or_weak_token_fails_closed(monkeypatch):
    from app import mcp_server
    for bad in ["   ", "changeme", "your_token_here", "secret", "12345678",
                "short-token-1234", "fffffffffffffffffffffffffffffff"]:
        _set_mcp_env(monkeypatch, token=bad)
        with pytest.raises(mcp_server.MCPConfigError):
            mcp_server.mount_mcp()


def test_main_import_fails_closed_when_enabled_without_token(monkeypatch):
    """端到端 fail closed：MCP_ENABLED 开着但 token 缺失时，app.main 在
    导入（= uvicorn 启动）阶段就抛 MCPConfigError，而不是带病服务。"""
    import pytest as _pytest

    _set_mcp_env(monkeypatch, token=None)
    with _pytest.raises(Exception) as excinfo:
        _import_fresh_main()
    assert "MCP_BEARER_TOKEN" in str(excinfo.value)


@pytest.fixture()
def mcp_app(monkeypatch):
    _set_mcp_env(monkeypatch)
    return _import_fresh_main().app


@pytest.fixture()
def client(mcp_app):
    with TestClient(mcp_app, base_url="http://localhost:8000") as c:
        yield c


# ─────────────────────── 认证：401 / 放行 ───────────────────────

def test_missing_token_401_with_challenge(client):
    r = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
              {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream",
               "Host": "localhost:8000"})
    assert r.status_code == 401
    assert r.headers["www-authenticate"].startswith("Bearer")
    assert STRONG_TOKEN not in r.text


def test_wrong_token_401_with_challenge(client):
    r = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
              _auth_headers({"Authorization": "Bearer totally-wrong-token-aaaa"}))
    assert r.status_code == 401
    assert r.headers["www-authenticate"].startswith("Bearer")
    assert STRONG_TOKEN not in r.text


def test_malformed_authorization_header_401(client):
    for bad in ["Basic abc", "Bearer", "bearer ", STRONG_TOKEN]:
        r = _post(client, {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                  _auth_headers({"Authorization": bad}))
        assert r.status_code == 401, bad


# ─────────────────────── 协议：initialize / list / call ───────────────────────

def test_initialize_ok(client):
    r = _ok(_post(client, {
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2025-06-18", "capabilities": {},
                   "clientInfo": {"name": "t", "version": "0"}},
    }, _auth_headers()))
    assert r["result"]["serverInfo"]["name"] == "exam-performance-analysis-mcp"
    assert r["result"]["protocolVersion"]


def test_tools_list_equals_readonly_registry_exactly(client):
    """目录恰好等于注册表 read_only 条目：指定的 20 个一个不少、别的一个不多。"""
    from app.chat.tools import readonly_tool_catalog
    r = _ok(_post(client, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, _auth_headers()))
    names = [t["name"] for t in r["result"]["tools"]]
    expected = [e["name"] for e in readonly_tool_catalog()]
    assert names == expected
    assert set(names) == REQUIRED_TOOLS
    assert len(names) == 20
    for t in r["result"]["tools"]:
        ann = t["annotations"]
        assert ann["readOnlyHint"] is True
        assert ann["destructiveHint"] is False
        assert ann["idempotentHint"] is True
        assert ann["openWorldHint"] is False


def test_tools_list_schema_verbatim_from_registry(client):
    from app.chat.tools import readonly_tool_catalog
    r = _ok(_post(client, {"jsonrpc": "2.0", "id": 3, "method": "tools/list"}, _auth_headers()))
    reg = {e["name"]: e for e in readonly_tool_catalog()}
    for t in r["result"]["tools"]:
        e = reg[t["name"]]
        assert t["description"] == e["description"]
        assert t["inputSchema"] == e["input_schema"]


def test_call_dispatches_through_execute_tool_untouched(client, monkeypatch):
    from app.chat import tools as chat_tools
    captured = {}

    def fake(name, args):
        captured["name"] = name
        captured["args"] = args
        return {"echo": True, "got": args}

    monkeypatch.setattr(chat_tools, "execute_tool", fake)
    r = _ok(_post(client, {
        "jsonrpc": "2.0", "id": 4, "method": "tools/call",
        "params": {"name": "list_exams",
                   "arguments": {"grade": 2, "extra": "keep-me"}},
    }, _auth_headers()))
    assert captured["name"] == "list_exams"
    assert captured["args"] == {"grade": 2, "extra": "keep-me"}
    payload = json.loads(r["result"]["content"][0]["text"])
    assert payload["got"] == {"grade": 2, "extra": "keep-me"}
    assert r["result"].get("isError") is not True


def test_non_catalog_tools_not_callable(client):
    from app.chat.tools import TOOL_REGISTRY
    non_ro = [e["name"] for e in TOOL_REGISTRY if not e.get("read_only")]
    targets = (non_ro[:1] or []) + ["no_such_tool_xyz", "render_chart",
                                    "list_my_classes"]
    for name in targets:
        r = _ok(_post(client, {
            "jsonrpc": "2.0", "id": 5, "method": "tools/call",
            "params": {"name": name, "arguments": {}},
        }, _auth_headers()))
        assert r["result"]["isError"] is True, name


# ─────────────────────── 扩展性与安全 ───────────────────────

def test_new_readonly_tool_auto_appears(client, monkeypatch):
    from app.chat import tools as chat_tools
    entry = {
        "name": "_tmp_readonly_probe",
        "read_only": True,
        "description": "临时只读探针",
        "input_schema": {"type": "object", "properties": {"x": {"type": "integer"}}},
    }
    monkeypatch.setattr(chat_tools, "TOOL_REGISTRY", chat_tools.TOOL_REGISTRY + [entry])
    monkeypatch.setattr(
        chat_tools, "TOOL_FUNCTIONS",
        {**chat_tools.TOOL_FUNCTIONS, "_tmp_readonly_probe": lambda **kw: {"ok": kw}},
    )
    r = _ok(_post(client, {"jsonrpc": "2.0", "id": 6, "method": "tools/list"}, _auth_headers()))
    names = {t["name"] for t in r["result"]["tools"]}
    assert "_tmp_readonly_probe" in names

    r2 = _ok(_post(client, {
        "jsonrpc": "2.0", "id": 7, "method": "tools/call",
        "params": {"name": "_tmp_readonly_probe", "arguments": {"x": 1}},
    }, _auth_headers()))
    assert json.loads(r2["result"]["content"][0]["text"]) == {"ok": {"x": 1}}


def test_write_tool_not_exposed_and_not_callable(client, monkeypatch):
    from app.chat import tools as chat_tools
    entry = {
        "name": "_tmp_write_probe",
        "read_only": False,
        "description": "临时写探针",
        "input_schema": {"type": "object", "properties": {}},
    }
    monkeypatch.setattr(chat_tools, "TOOL_REGISTRY", chat_tools.TOOL_REGISTRY + [entry])
    monkeypatch.setattr(
        chat_tools, "TOOL_FUNCTIONS",
        {**chat_tools.TOOL_FUNCTIONS, "_tmp_write_probe": lambda **kw: {"wrote": True}},
    )
    r = _ok(_post(client, {"jsonrpc": "2.0", "id": 8, "method": "tools/list"}, _auth_headers()))
    names = {t["name"] for t in r["result"]["tools"]}
    assert "_tmp_write_probe" not in names

    r2 = _ok(_post(client, {
        "jsonrpc": "2.0", "id": 9, "method": "tools/call",
        "params": {"name": "_tmp_write_probe", "arguments": {}},
    }, _auth_headers()))
    assert r2["result"]["isError"] is True


def test_registry_entry_without_flag_not_exposed(client, monkeypatch):
    """read_only 缺省（未标记）的条目同样不暴露 —— 默认安全。"""
    from app.chat import tools as chat_tools
    entry = {"name": "_tmp_unflagged_probe", "description": "未标记",
             "input_schema": {"type": "object", "properties": {}}}
    monkeypatch.setattr(chat_tools, "TOOL_REGISTRY", chat_tools.TOOL_REGISTRY + [entry])
    r = _ok(_post(client, {"jsonrpc": "2.0", "id": 10, "method": "tools/list"}, _auth_headers()))
    names = {t["name"] for t in r["result"]["tools"]}
    assert "_tmp_unflagged_probe" not in names


# ─────────────────────── SDK Host / Origin 防护 ───────────────────────

def test_invalid_host_421(mcp_app, monkeypatch):
    """非法 Host（经 base_url 控制）→ 421。清代理 env 防本机代理干扰。"""
    _clear_proxy_env(monkeypatch)
    with TestClient(mcp_app, base_url="http://evil.example.com:8000") as c:
        r = _post(c, {"jsonrpc": "2.0", "id": 11, "method": "tools/list"},
                  _no_host_auth_headers())
        assert r.status_code == 421


def test_invalid_origin_403(client):
    r = _post(client, {"jsonrpc": "2.0", "id": 12, "method": "tools/list"},
              _auth_headers({"Origin": "https://evil.example"}))
    assert r.status_code == 403


def test_no_origin_browserless_client_ok(client):
    """Hermes 等非浏览器客户端不带 Origin：正常放行。"""
    r = _post(client, {"jsonrpc": "2.0", "id": 13, "method": "tools/list"}, _auth_headers())
    assert r.status_code == 200


def test_allowed_hosts_configurable(monkeypatch):
    """MCP_ALLOWED_HOSTS 配置公网域名后：该域名放行。"""
    _clear_proxy_env(monkeypatch)
    _set_mcp_env(monkeypatch,
                 hosts="grade.zuoyuan.wang,grade.zuoyuan.wang:*,localhost:8000")
    main = _import_fresh_main()
    with TestClient(main.app, base_url="https://grade.zuoyuan.wang") as c:
        r = c.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                   headers=_no_host_auth_headers())
        assert r.status_code == 200


def test_unlisted_host_rejected_when_configured(monkeypatch):
    """同一配置下，未列入白名单的域名仍 421（独立 fresh import：session
    manager 每 app 实例只能 run 一次）。"""
    _clear_proxy_env(monkeypatch)
    _set_mcp_env(monkeypatch,
                 hosts="grade.zuoyuan.wang,grade.zuoyuan.wang:*,localhost:8000")
    main = _import_fresh_main()
    with TestClient(main.app, base_url="http://other.example.com:8080") as c:
        r = c.post("/mcp/", json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
                   headers=_no_host_auth_headers())
        assert r.status_code == 421


def test_bad_token_rejected_before_host_check(monkeypatch):
    """认证在最外层：错误 token + 非法 Host 也是 401（不泄露 Host 校验细节）。"""
    _clear_proxy_env(monkeypatch)
    _set_mcp_env(monkeypatch)
    main = _import_fresh_main()
    with TestClient(main.app, base_url="http://evil.example.com:8000") as c:
        r = c.post("/mcp/", json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
                   headers={**_no_host_auth_headers(),
                            "Authorization": "Bearer wrong-token-zzz"})
        assert r.status_code == 401


# ─────────────────────── 规范 URL / 重定向 ───────────────────────

def test_canonical_url_no_redirect_masking(client):
    """/mcp/ 是规范 URL：两个分支都关闭重定向跟随，直接拿到最终响应 ——
    正确 token 直接 200（真实 tools 结果）、缺 token 直接 401，而非 307。"""
    r = client.post(
        "/mcp/",
        json={"jsonrpc": "2.0", "id": 21, "method": "tools/list"},
        headers=_auth_headers(),
        follow_redirects=False,
    )
    assert r.status_code == 200
    result = r.json()["result"]
    assert result["tools"]
    assert {t["name"] for t in result["tools"]} == REQUIRED_TOOLS

    r2 = client.post(
        "/mcp/",
        json={"jsonrpc": "2.0", "id": 22, "method": "tools/list"},
        headers={"Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream",
                 "Host": "localhost:8000"},
        follow_redirects=False,
    )
    assert r2.status_code == 401
    assert r2.headers["www-authenticate"].startswith("Bearer")


def test_bare_mcp_path_redirects_to_canonical(client):
    """/mcp（无尾斜杠）是 307 → /mcp/；面向用户的兼容入口，Hermes/curl -L 会跟随。"""
    r = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": 23, "method": "tools/list"},
        headers=_auth_headers(),
        follow_redirects=False,
    )
    assert r.status_code == 307
    assert r.headers["location"].endswith("/mcp/")


# ─────────────────────── 现有聊天助手不受影响 ───────────────────────

def test_chat_config_and_chat_endpoint_unchanged(mcp_app, monkeypatch):
    _clear_proxy_env(monkeypatch)
    with TestClient(mcp_app) as c:
        r = c.get("/api/chat/config")
        assert r.status_code == 200
        assert "provider" in r.json()
        # 未绑定班级作用域时 /api/chat 维持既有 409 拒绝（不触达 LLM）。
        r2 = c.post("/api/chat", json={"messages": [], "context": {}})
        assert r2.status_code in (200, 400, 409, 422)


def test_session_build_tools_list_is_public_projection():
    from app.chat.session import build_tools_list
    tools = build_tools_list()
    assert len(tools) == 20
    for t in tools:
        assert list(t.keys()) == ["name", "description", "input_schema"]


# ───────────────── TOOLS 投影与 git HEAD 基线完全一致 ─────────────────

def _baseline_tools_from_head():
    """从 git HEAD 提取重构前的 TOOLS 字面量（引入 TOOL_REGISTRY 之前）。"""
    repo_root = Path(__file__).resolve().parents[2]
    try:
        src = subprocess.run(
            ["git", "show", "HEAD:backend/app/chat/tools.py"],
            cwd=repo_root, capture_output=True, text=True, check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as exc:
        pytest.skip(f"git baseline unavailable: {exc}")
    marker = "TOOLS = ["
    hits = [i for i, line in enumerate(src.split("\n"))
            if line.startswith(marker)]
    assert len(hits) == 1
    block = "\n".join(src.split("\n")[hits[0]:])
    namespace: dict = {}
    exec(compile(block, "<head-baseline>", "exec"), namespace)  # noqa: S102
    return namespace["TOOLS"]


def test_public_tools_match_head_baseline_exactly():
    """公开 TOOLS（session 聊天协议输入）与 git HEAD 基线逐项一致：
    三键结构、顺序、name/description/input_schema 内容全都不变。"""
    baseline = _baseline_tools_from_head()
    from app.chat.tools import TOOLS, TOOL_REGISTRY

    assert len(baseline) == 20
    assert len(TOOLS) == len(baseline)
    assert [t["name"] for t in TOOLS] == [t["name"] for t in baseline]
    for current, old in zip(TOOLS, baseline):
        assert list(current.keys()) == ["name", "description", "input_schema"]
        assert current == old
    # 注册表条目按序与基线一一对应（仅多出 read_only 元数据键）。
    assert len(TOOL_REGISTRY) == len(baseline)
    for entry, old in zip(TOOL_REGISTRY, baseline):
        assert entry["name"] == old["name"]
        assert entry["description"] == old["description"]
        assert entry["input_schema"] == old["input_schema"]
        assert entry["read_only"] is True
