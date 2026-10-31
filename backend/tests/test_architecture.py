import ast
from pathlib import Path

FORBIDDEN_MODULES = {
    "google",
    "google.genai",
    "httpx",
    "requests",
    "urllib",
    "socket",
    "openai",
    "aiohttp",
    "fastapi",
    "starlette",
}


def test_engine_has_zero_llm_or_network_imports() -> None:
    """Enforces LAW-01: LLM Extracts, Code Computes.
    
    The engine/ directory must remain 100% pure deterministic Python.
    No LLM, network, or framework dependencies allowed.
    """
    engine_dir = Path(__file__).resolve().parent.parent / "app" / "engine"
    assert engine_dir.is_dir(), f"Engine directory not found at {engine_dir}"

    py_files = list(engine_dir.glob("*.py"))
    assert len(py_files) > 0, "No python files found in engine directory"

    violations: list[str] = []

    for py_file in py_files:
        tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    root_name = alias.name.split(".")[0]
                    if alias.name in FORBIDDEN_MODULES or root_name in FORBIDDEN_MODULES:
                        violations.append(
                            f"{py_file.name}:{node.lineno} imports forbidden '{alias.name}'"
                        )
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    root_name = node.module.split(".")[0]
                    if node.module in FORBIDDEN_MODULES or root_name in FORBIDDEN_MODULES:
                        violations.append(
                            f"{py_file.name}:{node.lineno} imports from forbidden '{node.module}'"
                        )

    assert not violations, "LAW-01 Architectural Violations detected in app/engine:\n" + "\n".join(
        violations
    )

