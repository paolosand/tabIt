"""Every place that carries the release version must agree.

RELEASE is the version being prepared. Update it at each release together
with the other places listed in docs/RELEASING.md, so this test doubles as a
release checklist item.
"""
import json
import re
import tomllib
from pathlib import Path

import engine

ROOT = Path(__file__).resolve().parents[2]
RELEASE = "0.5.0"


def _json(rel):
    return json.loads((ROOT / rel).read_text())


def test_all_versions_equal():
    install = (ROOT / "packaging/install.sh").read_text()
    ref = re.search(r'^TABIT_REF="\$\{TABIT_REF:-v([^}"]+)\}"', install, re.M)
    e2e = (ROOT / ".github/workflows/installer-e2e.yml").read_text()
    health = re.search(r'"engineVersion":"([^"]+)"', e2e)
    lock = _json("extension/package-lock.json")
    found = {
        "pyproject.toml": tomllib.loads((ROOT / "pyproject.toml").read_text())["project"]["version"],
        "engine.__version__": engine.__version__,
        "extension/manifest.json": _json("extension/manifest.json")["version"],
        "extension/package.json": _json("extension/package.json")["version"],
        "package-lock.json (top)": lock["version"],
        "package-lock.json (packages[''])": lock["packages"][""]["version"],
        "install.sh TABIT_REF": ref and ref.group(1),
        "installer-e2e.yml engineVersion": health and health.group(1),
    }
    assert found == {k: RELEASE for k in found}
