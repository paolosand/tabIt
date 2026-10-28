import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

import engine

ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="module")
def wheel(tmp_path_factory):
    out = tmp_path_factory.mktemp("wheel")
    # Build from a scratch copy of the sources so build/ and *.egg-info never
    # land in (or leak stale files from) the working tree.
    src = out / "src"
    src.mkdir()
    shutil.copy(ROOT / "pyproject.toml", src)
    for pkg in ("engine", "api", "helper"):
        shutil.copytree(ROOT / pkg, src / pkg,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    subprocess.run(
        [sys.executable, "-m", "pip", "wheel", str(src), "--no-deps",
         "--no-build-isolation", "-w", str(out / "dist")],
        check=True, capture_output=True, text=True,
    )
    wheels = list((out / "dist").glob("*.whl"))
    assert len(wheels) == 1
    return wheels[0]


def test_wheel_contents(wheel):
    assert wheel.name.startswith(f"tabit_engine-{engine.__version__}-")
    assert wheel.name.endswith("-py3-none-any.whl")
    with zipfile.ZipFile(wheel) as z:
        names = z.namelist()
        for required in [
            "engine/vendor/btc/model.py",
            "engine/vendor/btc/LICENSE",
            "engine/vendor/btc/NOTICE.md",
            "api/main.py",
            "api/guard.py",
            "helper/cli.py",
            "engine/pipeline.py",
        ]:
            assert required in names, required
        meta_name = next(n for n in names if n.endswith(".dist-info/METADATA"))
        meta = z.read(meta_name).decode()
    assert "Provides-Extra: api" in meta
    assert any(
        line.startswith("Requires-Dist: torch") for line in meta.splitlines()
    )
    for n in names:
        assert not n.endswith((".wav", ".pt", ".pth")), n
        assert not n.startswith("tests/") and "/tests/" not in n, n
        assert not n.startswith("docs/"), n
