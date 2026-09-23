import asyncio
import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

try:
    from copilot import CopilotClient
    from copilot.session import PermissionHandler
    from copilot.session_events import AssistantMessageData, SessionIdleData
except Exception:  # pragma: no cover - SDK is optional at import time.
    CopilotClient = None
    PermissionHandler = None
    AssistantMessageData = None
    SessionIdleData = None


def build_fallback_response(idea: str, note: str | None = None) -> dict[str, Any]:
    widgets = [
        {
            "kind": "summary",
            "title": "Concept framing",
            "body": "The concept is still a canvas. Frame the oncology problem, user, and measurable outcome before building.",
            "meta": "Issue-first",
        },
        {
            "kind": "action",
            "title": "Next milestone",
            "body": "Define a single patient, clinician, or research workflow and the smallest prototype that proves value.",
            "meta": "Prototype",
        },
    ]
    return {
        "status": "fallback",
        "title": "Idea brief",
        "summary": (
            "The concept is promising, but the app is running without a live Copilot session. "
            "Use this structured brief as a starting point for issue refinement."
        ),
        "next_steps": [
            "Clarify the patient or research problem the idea addresses.",
            "Define the key stakeholder workflow and where the friction is today.",
            "Turn the concept into a minimal prototype with measurable success criteria.",
        ],
        "evidence": [
            "The concept should show a direct oncology benefit, not just a digital wrapper.",
            "The target user should be explicit: clinician, researcher, patient, or care team.",
            "The prototype should be testable in a small pilot before broader scaling.",
        ],
        "widgets": widgets,
        "idea": idea,
        "sdk_status": note or "Copilot SDK not configured",
    }


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if item is not None]
    if isinstance(value, tuple):
        return [str(item) for item in value if item is not None]
    return [str(value)]


def _extract_json_object(raw: str) -> dict[str, Any] | None:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```\s*$", "", cleaned)

    match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
    if not match:
        return None

    candidate = match.group(0)
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        cleaned = cleaned.replace("```", "")
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            return None

    return parsed if isinstance(parsed, dict) else None


async def run_intent_agent(idea: str) -> dict[str, Any]:
    if CopilotClient is None or PermissionHandler is None:
        return build_fallback_response(idea, "GitHub Copilot SDK is not available in this environment.")

    final_text: list[str] = []
    done = asyncio.Event()

    try:
        async with CopilotClient() as client:
            async with await client.create_session(
                on_permission_request=PermissionHandler.approve_all,
                model="gpt-5",
            ) as session:

                def on_event(event):
                    match event.data:
                        case AssistantMessageData() as data:
                            final_text.append(data.content)
                        case SessionIdleData():
                            done.set()

                session.on(on_event)
                await session.send(
                    (
                        "You are an oncology innovation coach for a hackathon. "
                        "Turn the user's idea into a concise, ambitious brief. "
                        "Return valid JSON only with keys: title, summary, next_steps, evidence. "
                        "The user idea is: "
                        f"{idea}"
                    )
                )
                await asyncio.wait_for(done.wait(), timeout=30)
    except Exception as exc:  # pragma: no cover - network/auth failures should degrade gracefully.
        logger.warning("Copilot SDK call failed: %s", exc)
        return build_fallback_response(idea, f"Copilot SDK failed: {exc}")

    content = "\n".join(final_text).strip()
    if not content:
        return build_fallback_response(idea, "Copilot SDK returned no content.")

    parsed = _extract_json_object(content)
    if parsed:
        widgets = [
            {
                "kind": "summary",
                "title": parsed.get("title") or "Idea brief",
                "body": parsed.get("summary") or "The concept is ready for issue refinement.",
                "meta": "Generated by Copilot SDK",
            }
        ]
        for step in _as_list(parsed.get("next_steps"))[:3]:
            widgets.append({
                "kind": "action",
                "title": "Next step",
                "body": step,
                "meta": "Workflow",
            })
        for item in _as_list(parsed.get("evidence"))[:2]:
            widgets.append({
                "kind": "alert",
                "title": "Evidence",
                "body": item,
                "meta": "Relevance",
            })
        return {
            "status": "ready",
            "title": parsed.get("title") or "Idea brief",
            "summary": parsed.get("summary") or "The concept is ready for issue refinement.",
            "next_steps": _as_list(parsed.get("next_steps")) or [
                "Refine the clinical workflow the idea addresses.",
                "Define the minimal evidence threshold for a successful pilot.",
            ],
            "evidence": _as_list(parsed.get("evidence")) or [
                "The issue should be testable by a small multidisciplinary team.",
                "The concept should show distinct oncology value beyond generic productivity tools.",
            ],
            "widgets": widgets,
            "idea": idea,
            "sdk_status": "ready",
        }

    try:
        lines = [line.strip() for line in content.splitlines() if line.strip()]
        parsed = {
            "status": "ready",
            "title": "Idea brief",
            "summary": "The concept is ready for issue refinement.",
            "next_steps": [],
            "evidence": [],
            "idea": idea,
            "sdk_status": "ready",
        }
        if lines:
            parsed["summary"] = lines[0][:300]
        if len(lines) > 1:
            parsed["next_steps"] = lines[1:4]
        if len(lines) > 4:
            parsed["evidence"] = lines[4:7]
        return parsed
    except Exception:
        return {
            "status": "ready",
            "title": "Idea brief",
            "summary": content[:300],
            "next_steps": [
                "Refine the clinical workflow the idea addresses.",
                "Define the minimal evidence threshold for a successful pilot.",
            ],
            "evidence": [
                "The issue should be testable by a small multidisciplinary team.",
                "The concept should show distinct oncology value beyond generic productivity tools.",
            ],
            "idea": idea,
            "sdk_status": "ready",
        }
