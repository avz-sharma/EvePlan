"""Run the same quality gates locally and in CI without changing deployment settings."""

from contextlib import contextmanager
from collections.abc import Iterator
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
PNPM = "pnpm.cmd" if os.name == "nt" else "pnpm"
API_ORIGIN = "http://127.0.0.1:8018"
TEST_ENV = {**os.environ, "AUTH_REQUIRED": "false", "GROQ_API_KEY": "", "PYTHONUTF8": "1"}
LOGS = ROOT / ".tools" / "quality"


def api_ready() -> bool:
    """Recognize the smoke API instead of accepting an unrelated listener."""
    try:
        with urlopen(API_ORIGIN + "/health", timeout=0.5) as response:
            payload = json.load(response)
        return bool(payload.get("service") == "celebration-planner-engine")
    except (URLError, OSError, ValueError):
        return False


@contextmanager
def smoke_api() -> Iterator[None]:
    """Start an isolated offline API when needed and stop only the process we own."""
    if api_ready():
        with urlopen(API_ORIGIN + "/api/auth/session", timeout=2) as response:
            if json.load(response)["required"]:
                raise RuntimeError("Port 8018 is running with login required; use an offline test API.")
        yield
        return
    with (LOGS / "api.log").open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", "backend",
             "--host", "127.0.0.1", "--port", "8018", "--no-access-log"],
            cwd=ROOT, env=TEST_ENV, stdout=log, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        try:
            for _ in range(100):
                if api_ready():
                    break
                if process.poll() is not None:
                    raise RuntimeError(f"Smoke API exited; inspect {LOGS / 'api.log'}")
                time.sleep(0.2)
            else:
                raise RuntimeError("Smoke API did not become ready on port 8018")
            yield
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def check(directory: str, command: list[str]) -> None:
    """Run a gate, preserve its output and stop immediately on failure."""
    label = " ".join(command[1:] if command[0] == sys.executable else command)
    print(f"[{directory}] {label}", flush=True)
    result = subprocess.run(command, cwd=ROOT / directory, env=TEST_ENV,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    print(result.stdout.decode("utf-8", errors="replace"), end="", flush=True)
    (LOGS / f"{directory}-{command[-1].replace('/', '_').replace(':', '-')}.log").write_bytes(result.stdout)
    if result.returncode:
        raise SystemExit(result.returncode)


def main() -> None:
    """Enforce all documented backend, frontend, dependency and browser gates."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    LOGS.mkdir(parents=True, exist_ok=True)
    python = [sys.executable, "-m"]
    backend = [
        ["ruff", "check", "app/", "tests/"],
        ["ruff", "format", "--check", "app/"],
        ["ruff", "check", "--select", "D100,D101,D102,D103,D104", "app/"],
        ["mypy", "--strict", "app/"],
        ["pytest", "--cov=app", "--cov-report=json:coverage/coverage.json",
         "--cov-report=xml:coverage/coverage.xml", "--cov-fail-under=70"],
        ["coverage", "report", "--include=app/engine/*", "--fail-under=80"],
        ["bandit", "-r", "app/", "--exclude", "app/static", "-s", "B101"],
        ["pip_audit", "--disable-pip", "--require-hashes", "-r", "requirements-dev.lock"],
    ]
    for arguments in backend:
        check("backend", python + arguments)
    for task in ["lint", "check:unused", "test:coverage", "build"]:
        check("frontend", [PNPM, "run", task])
    check("frontend", [PNPM, "audit"])
    with smoke_api():
        check("frontend", [PNPM, "run", "test:smoke"])
    print("All 14 quality gates passed.", flush=True)


if __name__ == "__main__":
    main()
