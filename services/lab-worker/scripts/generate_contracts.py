"""Generate (or drift-check) Pydantic contracts from ../../schemas (D-032, D-043).

    uv run task generate          rewrite hivemind_worker/contracts/
    uv run task check-contracts   exit 1 when the committed package differs

Only `*.schema.json` files are inputs. They are staged as snake_case modules with
their relative `$ref`s rewritten so the generated class names equal the contract ids
(`work_order.json` -> `class WorkOrder`). The generator is pinned in pyproject.toml.
"""

from __future__ import annotations

import filecmp
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "schemas"
PACKAGE = ROOT / "services" / "lab-worker" / "hivemind_worker" / "contracts"
SUFFIX = ".schema.json"

GENERATOR_ARGS = [
    "--input-file-type",
    "jsonschema",
    "--output-model-type",
    "pydantic_v2.BaseModel",
    "--use-annotated",
    "--collapse-root-models",
    "--disable-timestamp",
    "--target-python-version",
    "3.13",
    "--use-standard-collections",
    "--use-union-operator",
    "--use-schema-description",
    "--use-field-description",
    "--field-constraints",
    "--use-double-quotes",
    "--keep-model-order",
    "--formatters",
    "builtin",
]

# Formatting is applied here with explicit options so the result does not depend on
# where the output directory lives (ruff would otherwise discover a different config).
RUFF_OPTIONS = ["--isolated", "--line-length", "100", "--target-version", "py313"]
# The generator's own pass wraps at the line length of whatever pyproject it finds next
# to the output; skipping magic trailing commas lets this pass re-join those lines.
RUFF_FORMAT_OPTIONS = [*RUFF_OPTIONS, "--config", "format.skip-magic-trailing-comma = true"]


def snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def stage_inputs(stage_dir: Path) -> dict[str, str]:
    """Copy schema files into `stage_dir` as snake_case modules; return id -> module name."""
    files = sorted(SCHEMAS.glob(f"*{SUFFIX}"))
    if not files:
        raise SystemExit(f"no {SUFFIX} files under {SCHEMAS}; run bun run schema:export")
    mapping = {path.name[: -len(SUFFIX)]: snake(path.name[: -len(SUFFIX)]) for path in files}
    for path in files:
        text = path.read_text(encoding="utf-8")
        for contract_id, module in mapping.items():
            text = text.replace(f'"{contract_id}{SUFFIX}"', f'"{module}.json"')
        (stage_dir / f"{mapping[path.name[: -len(SUFFIX)]]}.json").write_text(
            text, encoding="utf-8"
        )
    return mapping


def generate(output: Path) -> None:
    with tempfile.TemporaryDirectory(prefix="hivemind-schemas-") as tmp:
        stage_dir = Path(tmp)
        stage_inputs(stage_dir)
        command = [
            sys.executable,
            "-m",
            "datamodel_code_generator",
            "--input",
            str(stage_dir),
            "--output",
            str(output),
            *GENERATOR_ARGS,
        ]
        subprocess.run(command, check=True)
    ruff = [sys.executable, "-m", "ruff"]
    subprocess.run(
        [*ruff, "check", "--select", "I", "--fix", "--quiet", *RUFF_OPTIONS, str(output)],
        check=True,
    )
    subprocess.run([*ruff, "format", "--quiet", *RUFF_FORMAT_OPTIONS, str(output)], check=True)
    shutil.rmtree(output / ".ruff_cache", ignore_errors=True)
    header = (
        '"""Generated from ../../schemas by scripts/generate_contracts.py (D-043). '
        'Do not edit."""\n'
    )
    init = output / "__init__.py"
    body = re.sub(r"^#   filename:  .*$", "#   filename:  schemas/", init.read_text(), flags=re.M)
    init.write_text(header + body, encoding="utf-8")


def differences(expected: Path, actual: Path) -> list[str]:
    expected_files = {p.relative_to(expected) for p in expected.rglob("*.py")}
    actual_files = {p.relative_to(actual) for p in actual.rglob("*.py")}
    problems = [f"missing {p}" for p in sorted(expected_files - actual_files)]
    problems += [f"stale {p}" for p in sorted(actual_files - expected_files)]
    for rel in sorted(expected_files & actual_files):
        if not filecmp.cmp(expected / rel, actual / rel, shallow=False):
            problems.append(f"differs {rel}")
    return problems


def main(argv: list[str]) -> int:
    check = "--check" in argv
    if check:
        with tempfile.TemporaryDirectory(prefix="hivemind-contracts-") as tmp:
            fresh = Path(tmp) / "contracts"
            generate(fresh)
            problems = differences(fresh, PACKAGE) if PACKAGE.exists() else ["package missing"]
        if problems:
            for problem in problems:
                print(f"check-contracts: {problem}", file=sys.stderr)
            print("check-contracts: run `uv run task generate` and commit", file=sys.stderr)
            return 1
        print("check-contracts: hivemind_worker/contracts is in sync with schemas/")
        return 0
    if PACKAGE.exists():
        shutil.rmtree(PACKAGE)
    generate(PACKAGE)
    modules = sorted(p.name for p in PACKAGE.glob("*.py"))
    print(f"generate: wrote {len(modules)} modules to {PACKAGE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
