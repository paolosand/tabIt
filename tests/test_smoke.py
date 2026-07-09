import importlib
import pytest


@pytest.mark.integration
@pytest.mark.parametrize("mod", ["essentia.standard", "demucs.api", "crepe", "crema.analyze"])
def test_heavy_deps_import(mod):
    importlib.import_module(mod)


def test_engine_imports():
    import engine
    assert engine.__version__ == "0.1.0"
