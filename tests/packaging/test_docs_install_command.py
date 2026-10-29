"""The one install command users see must be identical everywhere it is documented."""
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


def _install_command() -> str:
    src = (ROOT / "extension/src/install.ts").read_text()
    m = re.search(r"INSTALL_COMMAND\s*=\s*\n?\s*'([^']+)'", src)
    assert m, "could not parse INSTALL_COMMAND from extension/src/install.ts"
    return m.group(1)


@pytest.mark.parametrize("doc", ["README.md", "docs/store/reviewer-instructions.md"])
def test_doc_contains_exact_install_command(doc):
    assert _install_command() in (ROOT / doc).read_text(), doc
