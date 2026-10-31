from pathlib import Path


def test_vercel_runtime_requirements_match_audited_hash_lock():
    root = Path(__file__).resolve().parents[2]
    assert (root / "requirements.txt").read_bytes() == (root / "backend/requirements.lock").read_bytes()
