"""GitHub Copilot SDK integration: one shared client, one session per request.

Flow: user task → Copilot session with our tools → model calls data tools → model calls
``render_ui`` → blocks returned to the frontend. Extend by adding tools (tools.py), block types
(ui.py) or additional sessions with different system prompts (e.g. one per role or agent).
"""

import asyncio
import json
import logging
import re
import tempfile
from typing import Any

from copilot import CopilotClient
from copilot.session import PermissionHandler
from copilot.session_events import AssistantMessageData, ToolExecutionStartData

from app.agent.fallback import build_fallback
from app.agent.models import AgentRequest, AgentResult, TraceStep
from app.agent.prompts import SYSTEM_PROMPT, build_prompt
from app.agent.tools import DATA_TOOLS, build_render_ui_tool
from app.agent.ui import RenderUIParams, UIBlock
from app.config import settings

logger = logging.getLogger(__name__)

_client: CopilotClient | None = None
_client_lock = asyncio.Lock()
_workdir = tempfile.mkdtemp(prefix="copilot-agent-")


async def _get_client() -> CopilotClient:
    global _client
    async with _client_lock:
        if _client is None:
            client = CopilotClient(
                github_token=settings.copilot_token,
                use_logged_in_user=settings.copilot_token is None and settings.copilot_use_logged_in_user,
                working_directory=_workdir,
                log_level="warning",
            )
            await client.start()
            _client = client
        return _client


async def shutdown() -> None:
    global _client
    if _client is not None:
        try:
            await _client.stop()
        finally:
            _client = None


async def run_agent(request: AgentRequest) -> AgentResult:
    if settings.copilot_auth_mode == "not-configured":
        return build_fallback(request, "Copilot SDK not configured: set COPILOT_GITHUB_TOKEN.")

    rendered: list[RenderUIParams] = []
    trace: list[TraceStep] = []
    messages: list[str] = []
    tools = [*DATA_TOOLS, build_render_ui_tool(rendered.append)]

    def on_event(event) -> None:
        match event.data:
            case ToolExecutionStartData() as data:
                args = data.arguments if isinstance(data.arguments, str) else json.dumps(data.arguments)
                trace.append(TraceStep(tool=data.tool_name, arguments=(args or "")[:200]))
            case AssistantMessageData() as data if data.content:
                messages.append(data.content)

    try:
        client = await _get_client()
        async with await client.create_session(
            on_permission_request=PermissionHandler.approve_all,
            model=settings.copilot_model,
            tools=tools,
            available_tools=[tool.name for tool in tools],
            system_message={"mode": "replace", "content": SYSTEM_PROMPT},
            skip_custom_instructions=True,
            enable_config_discovery=False,
            working_directory=_workdir,
        ) as session:
            session.on(on_event)
            await session.send_and_wait(
                build_prompt(request.task, request.patient_id, request.role),
                timeout=settings.agent_timeout_seconds,
            )
    except Exception as exc:  # noqa: BLE001 - any SDK/auth/network failure degrades to the demo path
        logger.warning("Copilot SDK call failed: %s", exc)
        return build_fallback(request, f"Copilot SDK unavailable ({type(exc).__name__}). Showing deterministic demo.")

    if rendered:
        view = rendered[-1]
        return AgentResult(mode="copilot", headline=view.headline, blocks=view.blocks, trace=trace)

    text = "\n\n".join(messages).strip() or "The agent returned no content."
    return AgentResult(
        mode="copilot",
        headline="Agent response",
        blocks=[UIBlock(type="summary", title="Agent response", body=text)],
        trace=trace,
        note="The agent answered in text instead of calling render_ui.",
    )


_UNICODE_ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})")


def _unescape(value: Any) -> Any:
    """Models occasionally double-escape non-ASCII text (literal ``\u2192``); restore the characters."""
    if isinstance(value, str):
        return _UNICODE_ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), value)
    if isinstance(value, list):
        return [_unescape(v) for v in value]
    if isinstance(value, dict):
        return {k: _unescape(v) for k, v in value.items()}
    return value
