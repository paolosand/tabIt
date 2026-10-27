import pytest


def test_warm_all_loads_the_weights_then_runs_one_tiny_inference():
    from helper.warmup import warm_all

    events: list = []

    class Btc:
        def load(self):
            events.append("load")

        def predict(self, wav_path):
            import soundfile as sf
            data, sr = sf.read(wav_path)      # a real, readable, short clip
            events.append(("predict", len(data) / sr))
            return []

    messages: list[str] = []
    warm_all(progress=messages.append, get_chord_model=Btc)

    assert events[0] == "load"
    assert events[1][0] == "predict" and 0 < events[1][1] <= 5
    assert any("test inference" in m for m in messages)
    assert messages[-1] == "all models ready"


def test_warm_all_propagates_failures():
    from helper.warmup import warm_all

    def broken():
        raise OSError("no space left on device")
    with pytest.raises(OSError, match="no space"):
        warm_all(progress=lambda m: None, get_chord_model=broken)


def test_warm_all_propagates_an_inference_failure():
    from helper.warmup import warm_all

    class Bad:
        def load(self):
            pass

        def predict(self, wav_path):
            raise RuntimeError("torch is broken")
    with pytest.raises(RuntimeError, match="torch"):
        warm_all(progress=lambda m: None, get_chord_model=Bad)


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
