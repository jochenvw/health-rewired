"""Runtime configuration, read from environment variables (see .env.example)."""

import os
from dataclasses import dataclass, field
from pathlib import Path

_APP_DIR = Path(__file__).resolve().parent


def _first_existing(*candidates: Path) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def _env(name: str) -> str | None:
    value = os.environ.get(name, "").strip()
    return value or None


@dataclass
class Settings:
    copilot_token: str | None = field(
        default_factory=lambda: _env("COPILOT_GITHUB_TOKEN") or _env("GH_TOKEN") or _env("GITHUB_TOKEN")
    )
    # Local development can reuse the signed-in Copilot CLI user; containers should use a token.
    copilot_use_logged_in_user: bool = field(
        default_factory=lambda: (_env("COPILOT_USE_LOGGED_IN_USER") or "true").lower() == "true"
    )
    copilot_model: str | None = field(default_factory=lambda: _env("COPILOT_MODEL"))
    agent_timeout_seconds: float = field(default_factory=lambda: float(_env("AGENT_TIMEOUT_SECONDS") or 90))
    preview_label: str | None = field(default_factory=lambda: _env("PREVIEW_LABEL"))
    app_version: str = field(default_factory=lambda: _env("APP_VERSION") or "dev")
    sample_data_dir: Path = field(
        default_factory=lambda: (
            Path(_env("SAMPLE_DATA_DIR"))
            if _env("SAMPLE_DATA_DIR")
            else _first_existing(_APP_DIR.parent / "sample-data", _APP_DIR.parent.parent / "sample-data")
        )
    )
    static_dir: Path = field(
        default_factory=lambda: Path(_env("STATIC_DIR")) if _env("STATIC_DIR") else _APP_DIR.parent / "static"
    )

    @property
    def copilot_auth_mode(self) -> str:
        if self.copilot_token:
            return "token"
        if self.copilot_use_logged_in_user:
            return "logged-in-user"
        return "not-configured"


settings = Settings()
