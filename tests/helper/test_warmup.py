import sys
import types

import pytest


@pytest.fixture
def stubbed_models(monkeypatch):
    """Stub every heavy import warm_all touches; record what loads."""
    loaded: list[str] = []

    crema = types.ModuleType("crema")
    crema_analyze = types.ModuleType("crema.analyze")
    crema.analyze = crema_analyze
    monkeypatch.setitem(sys.modules, "crema", crema)
    monkeypatch.setitem(sys.modules, "crema.analyze", crema_analyze)

    separate = types.ModuleType("engine.separate")
    separate._pick_device = lambda: "cpu"
    separate._get_separator = lambda name, device: loaded.append(f"demucs:{name}:{device}")
    monkeypatch.setitem(sys.modules, "engine.separate", separate)

    crepe = types.ModuleType("crepe")
    crepe_core = types.ModuleType("crepe.core")
    crepe_core.build_and_load_model = lambda size: loaded.append(f"crepe:{size}")
    crepe.core = crepe_core
    monkeypatch.setitem(sys.modules, "crepe", crepe)
    monkeypatch.setitem(sys.modules, "crepe.core", crepe_core)

    return loaded


def test_warm_all_loads_everything_in_order(stubbed_models):
    from helper.warmup import warm_all

    messages: list[str] = []
    warm_all(progress=messages.append,
             get_chord_model=lambda: stubbed_models.append("crema-chords"))
    assert stubbed_models == ["crema-chords", "demucs:htdemucs:cpu", "crepe:small"]
    assert any("crema" in m for m in messages)
    assert any("Demucs" in m for m in messages)
    assert any("CREPE" in m for m in messages)


def test_warm_all_propagates_failures(stubbed_models, monkeypatch):
    from helper.warmup import warm_all

    def broken(name, device):
        raise OSError("no space left on device")
    sys.modules["engine.separate"]._get_separator = broken
    with pytest.raises(OSError, match="no space"):
        warm_all(progress=lambda m: None, get_chord_model=lambda: None)


def test_api_warm_models_delegates_with_its_cached_model(monkeypatch):
    import api.main as api_main
    from helper import warmup

    captured: dict = {}

    def fake_warm_all(progress, get_chord_model):
        captured["get_chord_model"] = get_chord_model
    monkeypatch.setattr(warmup, "warm_all", fake_warm_all)
    api_main._warm_models()
    assert captured["get_chord_model"] is api_main._get_chord_model


def test_api_warm_models_stays_nonfatal(monkeypatch):
    import api.main as api_main
    from helper import warmup

    def boom(progress, get_chord_model):
        raise RuntimeError("download failed")
    monkeypatch.setattr(warmup, "warm_all", boom)
    api_main._warm_models()  # must not raise
