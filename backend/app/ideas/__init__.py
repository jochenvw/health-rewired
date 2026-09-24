"""One module per hackathon idea, discovered automatically.

Add ``backend/app/ideas/issue_<N>.py`` that exposes ``router = APIRouter(prefix="/api/ideas/<N>")``.
It is mounted without editing ``main.py``, so many ideas can be merged into ``main`` without
conflicts. Keep idea-specific prompts, tools and helpers in that module (or an ``issue_<N>_*.py``
sibling) and call :func:`app.agent.run_agent` with ``system_prompt`` / ``extra_tools``.
"""

import importlib
import pkgutil

from fastapi import APIRouter


def routers() -> list[APIRouter]:
    found: list[APIRouter] = []
    for module in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        if not module.name.startswith("issue_"):
            continue
        router = getattr(importlib.import_module(f"{__name__}.{module.name}"), "router", None)
        if isinstance(router, APIRouter):
            found.append(router)
    return found
