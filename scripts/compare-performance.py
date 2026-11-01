"""Compare original and current engine/API timings in interleaved fresh processes."""

import io
import json
import os
from pathlib import Path
import statistics
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
BASE_REVISION = "499cb8f"
ROUNDS = 3


def archive_baseline() -> Path:
    """Extract only original app sources without moving HEAD or editing another branch."""
    destination = ROOT / ".tools" / "quality-comparison"
    destination.mkdir(parents=True, exist_ok=True)
    payload = subprocess.check_output(
        ["git", "archive", "--format=zip", BASE_REVISION, "backend/app"], cwd=ROOT
    )
    with zipfile.ZipFile(io.BytesIO(payload)) as archive:
        for member in archive.infolist():
            if not (destination / member.filename).resolve().is_relative_to(destination.resolve()):
                raise ValueError("Archive member is outside the comparison directory")
        archive.extractall(destination)
    return destination / "backend"


def measure(source: Path, phase: str) -> dict[str, object]:
    """Run the existing 100-iteration benchmark against a selected app source tree."""
    command = (
        "import sys,runpy; source=sys.argv.pop(2); sys.path.insert(0,source); "
        "runpy.run_module('tests.benchmark_engine',run_name='__main__')"
    )
    result = subprocess.run(
        [sys.executable, "-c", command, phase, str(source)], cwd=ROOT / "backend",
        env={**os.environ, "AUTH_REQUIRED": "false", "GROQ_API_KEY": "", "PYTHONUTF8": "1"},
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(result.stdout)


def main() -> None:
    """Record every run and compare medians of run percentiles without selecting a best run."""
    baseline = archive_baseline()
    samples = {"before": [], "after": []}
    for round_number in range(1, ROUNDS + 1):
        for label, source in [("before", baseline), ("after", ROOT / "backend")]:
            result = measure(source, f"quality-paired-{label}-{round_number}")
            samples[label].append(result)
            print(f"Round {round_number} {label}: {json.dumps(result)}", flush=True)
    summaries = {}
    for label, results in samples.items():
        summaries[label] = {
            operation: {
                percentile: statistics.median(result[operation][percentile] for result in results)
                for percentile in ["p50_ms", "p95_ms"]
            }
            for operation in ["dag", "cascade", "api_replan"]
        }
    report = {
        "baseline_revision": BASE_REVISION,
        "method": "Three interleaved before/after runs, 100 iterations and five warmups per operation per run; summary is the median of run percentiles.",
        "samples": samples, "summary": summaries,
    }
    (ROOT / "docs/measurements/quality-performance-comparison.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8"
    )
    print(json.dumps(summaries, indent=2), flush=True)


if __name__ == "__main__":
    main()
