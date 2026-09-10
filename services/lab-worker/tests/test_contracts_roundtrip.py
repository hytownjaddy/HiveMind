"""Round-trip every fixture through the generated Pydantic models (D-043).

TypeScript is canonical (D-032). Each `schemas/fixtures/<Contract>/<name>.json` was
validated by Zod when exported; here it must validate against the generated model and
dump back to the identical document, which proves the two sides agree on every field,
enum, discriminated union, and nested contract the fixtures exercise.
"""

from __future__ import annotations

import importlib
import json
import re
from enum import Enum
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, TypeAdapter

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "schemas"
FIXTURES = SCHEMAS / "fixtures"


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def model_for(contract: str) -> type[BaseModel]:
    module = importlib.import_module(f"hivemind_worker.contracts.{snake(contract)}")
    model = getattr(module, contract)
    assert issubclass(model, BaseModel), f"{contract} is not a BaseModel"
    return model


def validator_for(contract: str) -> TypeAdapter[Any]:
    """Adapter for a contract; root unions collapse into numbered members (D-043)."""
    module = importlib.import_module(f"hivemind_worker.contracts.{snake(contract)}")
    direct = getattr(module, contract, None)
    if direct is not None and issubclass(direct, BaseModel):
        return TypeAdapter(direct)
    members = [
        getattr(module, name)
        for name in sorted(dir(module))
        if re.fullmatch(rf"{contract}\d+", name)
    ]
    assert members, f"{contract} has neither a model nor union members"
    union: Any = members[0]
    for member in members[1:]:
        union = union | member
    return TypeAdapter(union)


def fixture_paths() -> list[Path]:
    return sorted(FIXTURES.glob("*/*.json"))


def lock_entries() -> dict[str, str]:
    return json.loads((SCHEMAS / "contracts.lock.json").read_text(encoding="utf-8"))


def contract_ids() -> list[str]:
    return sorted({key.split("@", 1)[0] for key in lock_entries()})


def is_root_union(contract: str) -> bool:
    """Root-level unions collapse into their members (`--collapse-root-models`, D-043)."""
    schema = json.loads((SCHEMAS / f"{contract}.schema.json").read_text(encoding="utf-8"))
    return "oneOf" in schema and "properties" not in schema


def test_fixture_directory_is_populated() -> None:
    assert len(fixture_paths()) >= 40, "run `bun run schema:export`"


@pytest.mark.parametrize("path", fixture_paths(), ids=lambda p: f"{p.parent.name}/{p.stem}")
def test_fixture_round_trips(path: Path) -> None:
    document: Any = json.loads(path.read_text(encoding="utf-8"))
    adapter = validator_for(path.parent.name)
    parsed = adapter.validate_python(document)
    dumped = adapter.dump_python(parsed, mode="json", by_alias=True, exclude_unset=True)
    assert dumped == document


@pytest.mark.parametrize("contract", contract_ids())
def test_every_locked_contract_has_a_model(contract: str) -> None:
    if is_root_union(contract):
        pytest.skip(f"{contract} is a root union; its members are separate models")
    module = importlib.import_module(f"hivemind_worker.contracts.{snake(contract)}")
    generated = getattr(module, contract)
    assert issubclass(generated, BaseModel | Enum), f"{contract} generated as {generated!r}"


def test_worker_envelope_rejects_unknown_message_type() -> None:
    from pydantic import ValidationError

    envelope = model_for("WorkerEnvelope")
    sample: Any = json.loads((FIXTURES / "WorkerEnvelope" / "heartbeat.json").read_text())
    sample["message"] = {"type": "job.unknown"}
    with pytest.raises(ValidationError):
        envelope.model_validate(sample)


def test_extra_fields_are_rejected() -> None:
    from pydantic import ValidationError

    learner = model_for("Learner")
    sample: Any = json.loads((FIXTURES / "Learner" / "seeded.json").read_text())
    sample["password"] = "never"
    with pytest.raises(ValidationError):
        learner.model_validate(sample)
