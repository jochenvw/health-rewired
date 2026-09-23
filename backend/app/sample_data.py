"""Read-only, path-safe access to the synthetic data in /sample-data."""

import csv
import json
from pathlib import Path
from typing import Any

from app.config import settings

ALLOWED_SUFFIXES = {".json", ".md", ".csv", ".txt"}
MAX_BYTES = 200_000


def root() -> Path:
    return settings.sample_data_dir.resolve()


def list_files() -> list[str]:
    base = root()
    if not base.exists():
        return []
    return sorted(
        p.relative_to(base).as_posix()
        for p in base.rglob("*")
        if p.is_file() and p.suffix in ALLOWED_SUFFIXES and p.name != "README.md"
    )


def _resolve(relative_path: str) -> Path:
    base = root()
    target = (base / relative_path).resolve()
    if base not in target.parents or target.suffix not in ALLOWED_SUFFIXES or not target.is_file():
        raise FileNotFoundError(relative_path)
    return target


def read_text(relative_path: str) -> str:
    return _resolve(relative_path).read_text(encoding="utf-8")[:MAX_BYTES]


def read(relative_path: str) -> Any:
    """Parse JSON and CSV files; return other files as text."""
    path = _resolve(relative_path)
    text = path.read_text(encoding="utf-8")[:MAX_BYTES]
    if path.suffix == ".json":
        return json.loads(text)
    if path.suffix == ".csv":
        return list(csv.DictReader(text.splitlines()))
    return text


def list_patients() -> list[dict[str, Any]]:
    patients = []
    for name in list_files():
        if name.startswith("patients/") and name.endswith(".json"):
            record = read(name)
            patients.append(
                {
                    "id": record.get("id"),
                    "name": record.get("name"),
                    "age": record.get("age"),
                    "diagnosis": record.get("diagnosis", {}).get("primary"),
                }
            )
    return patients


def get_patient(patient_id: str) -> dict[str, Any]:
    return read(f"patients/{patient_id}.json")
