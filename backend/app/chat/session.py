import json

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.chat.config import get_chat_config
from app.chat.tools import create_anthropic_client, create_openai_client, to_openai_tools

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """你是高中班主任的成绩分析助手。

核心规则：
1. 跨学年趋势只能用主三门和语数英原始分；高一到高二禁止用九门或+3比
2. 引用任何数字必须先经过工具查询；不准凭空给数据
3. 其他班是参照系不是报告对象
4. 受众是班主任本人，可直呼学生姓名
5. 用户问”某年级某学科进步最大/退步最大/提升最多”时，优先调用 subject_progress_ranking
6. 用户问”这个同学/某学生整体情况/学习情况/优劣势/建议”时，优先调用 student_learning_profile；如果当前页面上下文有 student_id，就直接使用它
7. 描述成绩**趋势和进退步**时，严格按以下规则选择指标，**禁止用”分数从X升到Y””提升/下降Z分”来描述趋势走势**：
   - 总分趋势：用学籍排名（xueji_rank）；无学籍排名时用年级百分位（grade_percentile）
   - 高一所有单科：用年级百分位（grade_percentile）；百分位降低=进步，升高=退步
   - 高二/高三 语数英单科：用年级百分位（grade_percentile）
   - 高二/高三 +3选考单科：用等级分（grade_score）；不用原始分，不用百分位
   - raw_score 只允许出现在”该次考试原始分为X”的单点描述中，不得用于计算进退步幅度

口径文档参考：exam-score-analysis/references/metric-definitions.md"""


def sse(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def build_tools_list():
    from app.chat.tools import TOOLS

    return TOOLS


def block_to_message_content(block) -> dict:
    if block.type == "text":
        return {"type": "text", "text": block.text}
    if block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    return {}


def build_system_prompt(context: dict | None = None) -> str:
    if not context:
        return SYSTEM_PROMPT

    safe_context = {
        key: context.get(key)
        for key in ("page", "student_id", "exam_id")
        if context.get(key) is not None
    }
    if not safe_context:
        return SYSTEM_PROMPT

    return (
        SYSTEM_PROMPT
        + "\n\n当前页面上下文（仅用于理解“这个学生/本次考试”等指代，不能替代工具查询数字）："
        + json.dumps(safe_context, ensure_ascii=False)
    )


def _anthropic_messages_to_openai(messages: list, system_prompt: str) -> list[dict]:
    """把 Anthropic 风格历史消息转成 OpenAI chat.completions 格式。"""
    out: list[dict] = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content")
        if isinstance(content, str):
            out.append({"role": role, "content": content})
            continue
        if not isinstance(content, list):
            continue
        if role == "assistant":
            text_parts = []
            tool_calls = []
            for block in content:
                btype = block.get("type")
                if btype == "text":
                    text_parts.append(block.get("text", ""))
                elif btype == "tool_use":
                    tool_calls.append(
                        {
                            "id": block.get("id"),
                            "type": "function",
                            "function": {
                                "name": block.get("name"),
                                "arguments": json.dumps(block.get("input") or {}, ensure_ascii=False),
                            },
                        }
                    )
            entry: dict = {"role": "assistant", "content": "".join(text_parts) or None}
            if tool_calls:
                entry["tool_calls"] = tool_calls
            out.append(entry)
        elif role == "user":
            text_parts = []
            tool_results = []
            for block in content:
                btype = block.get("type")
                if btype == "text":
                    text_parts.append(block.get("text", ""))
                elif btype == "tool_result":
                    tool_results.append(block)
            if text_parts:
                out.append({"role": "user", "content": "".join(text_parts)})
            for tr in tool_results:
                out.append(
                    {
                        "role": "tool",
                        "tool_call_id": tr.get("tool_use_id"),
                        "content": tr.get("content", ""),
                    }
                )
    return out


async def _stream_openai(config, messages: list, context: dict | None):
    from app.chat.tools import execute_tool

    client = create_openai_client(config)
    tools = to_openai_tools(build_tools_list())
    system_prompt = build_system_prompt(context)
    chat_messages = _anthropic_messages_to_openai(messages, system_prompt)

    for _ in range(8):
        try:
            response = client.chat.completions.create(
                model=config.model,
                messages=chat_messages,
                tools=tools,
                max_tokens=2048,
            )
        except Exception as exc:
            yield sse({"type": "text", "delta": f"对话接口调用失败：{exc}"})
            yield sse({"type": "done"})
            return

        choice = response.choices[0]
        msg = choice.message
        tool_calls = getattr(msg, "tool_calls", None) or []

        if tool_calls:
            assistant_entry: dict = {
                "role": "assistant",
                "content": msg.content or None,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "{}",
                        },
                    }
                    for tc in tool_calls
                ],
            }
            chat_messages.append(assistant_entry)
            for tc in tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except Exception:
                    args = {}
                yield sse({"type": "tool_call", "name": tc.function.name, "input": args})
                try:
                    result = execute_tool(tc.function.name, args)
                except Exception as exc:
                    result = {"error": str(exc)}
                chat_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
            continue

        text = msg.content or ""
        if text:
            yield sse({"type": "text", "delta": text})
        yield sse({"type": "done"})
        return

    yield sse({"type": "text", "delta": "工具调用轮次过多，已停止。请缩小问题范围后重试。"})
    yield sse({"type": "done"})


async def stream_chat(messages: list, context: dict | None = None):
    """SSE 对话。支持 Claude / OpenAI 兼容接口 tool-use，并把工具调用元数据推给前端。"""
    config = get_chat_config()
    if not config.is_configured:
        key_name = "OPENAI_API_KEY" if config.provider == "openai" else "ANTHROPIC_API_KEY"
        yield sse({"type": "text", "delta": f"未设置有效的 {key_name}，对话助手暂不可用。"})
        yield sse({"type": "done"})
        return

    if config.provider == "openai":
        async for chunk in _stream_openai(config, messages, context):
            yield chunk
        return

    from app.chat.tools import execute_tool

    client = create_anthropic_client(config)
    tools = build_tools_list()
    chat_messages = list(messages)

    for _ in range(8):
        try:
            response = client.messages.create(
                model=config.model,
                max_tokens=2048,
                system=build_system_prompt(context),
                messages=chat_messages,
                tools=tools,
            )
        except Exception as exc:
            yield sse({"type": "text", "delta": f"对话接口调用失败：{exc}"})
            yield sse({"type": "done"})
            return

        tool_results = []
        assistant_content = []
        final_text_parts = []

        for block in response.content:
            if block.type == "text":
                assistant_content.append(block_to_message_content(block))
                final_text_parts.append(block.text)
            elif block.type == "tool_use":
                assistant_content.append(block_to_message_content(block))
                args = block.input or {}
                yield sse({"type": "tool_call", "name": block.name, "input": args})
                try:
                    result = execute_tool(block.name, args)
                except Exception as exc:
                    result = {"error": str(exc)}
                tool_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

        if tool_results:
            chat_messages.append({"role": "assistant", "content": assistant_content})
            chat_messages.append({"role": "user", "content": tool_results})
            continue

        text = "".join(final_text_parts)
        if text:
            yield sse({"type": "text", "delta": text})
        yield sse({"type": "done"})
        return

    yield sse({"type": "text", "delta": "工具调用轮次过多，已停止。请缩小问题范围后重试。"})
    yield sse({"type": "done"})


@router.post("")
async def chat(request: Request):
    body = await request.json()
    messages = body.get("messages", [])
    context = body.get("context", {})

    return StreamingResponse(
        stream_chat(messages, context),
        media_type="text/event-stream",
    )
