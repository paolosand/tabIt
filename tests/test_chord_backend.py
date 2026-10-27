import logging

import pytest

from engine import chord_backend, chords_btc
from engine.chords import CremaChordModel
from engine.chords_btc import BtcChordModel, BtcWeightsUnavailable


def _weights_ok(monkeypatch, tmp_path):
    p = tmp_path / "w.pt"
    monkeypatch.setattr(chord_backend, "ensure_weights", lambda: p)
    return p


def _weights_missing(monkeypatch):
    def boom():
        raise BtcWeightsUnavailable("offline")
    monkeypatch.setattr(chord_backend, "ensure_weights", boom)


def test_default_is_btc_and_not_explicit(monkeypatch):
    monkeypatch.delenv("TABIT_CHORD_BACKEND", raising=False)
    assert chord_backend.requested_backend() == ("btc", False)


@pytest.mark.parametrize("raw,name", [("crema", "crema"), (" BTC ", "btc")])
def test_env_choice_is_explicit_and_normalised(monkeypatch, raw, name):
    monkeypatch.setenv("TABIT_CHORD_BACKEND", raw)
    assert chord_backend.requested_backend() == (name, True)


def test_unknown_backend_is_an_error(monkeypatch):
    monkeypatch.setenv("TABIT_CHORD_BACKEND", "chordino")
    with pytest.raises(ValueError, match="TABIT_CHORD_BACKEND"):
        chord_backend.requested_backend()


def test_btc_default_returns_btc_model(monkeypatch, tmp_path):
    monkeypatch.delenv("TABIT_CHORD_BACKEND", raising=False)
    _weights_ok(monkeypatch, tmp_path)
    assert isinstance(chord_backend.select_chord_model(), BtcChordModel)


def test_crema_choice_never_touches_weights(monkeypatch):
    monkeypatch.setenv("TABIT_CHORD_BACKEND", "crema")
    _weights_missing(monkeypatch)
    model = chord_backend.select_chord_model()
    assert isinstance(model, CremaChordModel) and model.backend == "crema"


def test_default_btc_falls_back_to_crema_with_a_warning(monkeypatch, caplog):
    monkeypatch.delenv("TABIT_CHORD_BACKEND", raising=False)
    _weights_missing(monkeypatch)
    with caplog.at_level(logging.WARNING, logger=chord_backend.__name__):
        model = chord_backend.select_chord_model()
    assert isinstance(model, CremaChordModel)
    assert "falling back to crema" in caplog.text and "offline" in caplog.text


def test_explicit_btc_raises_when_weights_are_unavailable(monkeypatch):
    monkeypatch.setenv("TABIT_CHORD_BACKEND", "btc")
    _weights_missing(monkeypatch)
    with pytest.raises(BtcWeightsUnavailable):
        chord_backend.select_chord_model()


def test_backend_of_defaults_to_crema_for_plain_models():
    class Legacy:
        def predict(self, wav):
            return []
    assert chord_backend.backend_of(Legacy()) == "crema"
    assert chord_backend.backend_of(BtcChordModel()) == "btc"


def test_engine_version_carries_the_backend():
    from engine import __version__, engine_version
    assert engine_version("btc") == f"{__version__}-btc"
    assert engine_version("crema") != engine_version("btc")


def _incomplete_read(monkeypatch, tmp_path):
    import http.client
    monkeypatch.setenv("TABIT_MODELS_DIR", str(tmp_path))
    monkeypatch.setattr(chord_backend, "ensure_weights", chords_btc.ensure_weights)

    def dropped(url, timeout=None):
        raise http.client.IncompleteRead(b"par")
    monkeypatch.setattr(chords_btc.urllib.request, "urlopen", dropped)


def test_dropped_connection_mid_download_falls_back_to_crema(monkeypatch, tmp_path, caplog):
    monkeypatch.delenv("TABIT_CHORD_BACKEND", raising=False)
    _incomplete_read(monkeypatch, tmp_path)
    with caplog.at_level(logging.WARNING, logger=chord_backend.__name__):
        model = chord_backend.select_chord_model()
    assert isinstance(model, CremaChordModel) and "falling back to crema" in caplog.text


def test_dropped_connection_with_explicit_btc_raises_a_clear_error(monkeypatch, tmp_path):
    monkeypatch.setenv("TABIT_CHORD_BACKEND", "btc")
    _incomplete_read(monkeypatch, tmp_path)
    with pytest.raises(BtcWeightsUnavailable, match="TABIT_CHORD_BACKEND=crema"):
        chord_backend.select_chord_model()
