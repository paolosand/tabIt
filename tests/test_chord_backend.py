import http.client

import pytest

from engine import chord_backend, chords_btc
from engine.chords_btc import BtcChordModel, BtcWeightsUnavailable


def test_selects_the_btc_model_when_weights_are_available(monkeypatch, tmp_path):
    p = tmp_path / "w.pt"
    monkeypatch.setattr(chord_backend, "ensure_weights", lambda: p)
    model = chord_backend.select_chord_model()
    assert isinstance(model, BtcChordModel)


def test_no_weights_is_a_clear_error_not_a_fallback(monkeypatch, tmp_path):
    """BTC is the only backend: a failed weights fetch must raise, naming where
    the file belongs, where it comes from and how to retry."""
    monkeypatch.setenv("TABIT_MODELS_DIR", str(tmp_path))

    def dropped(url, timeout=None):
        raise http.client.IncompleteRead(b"par")
    monkeypatch.setattr(chords_btc.urllib.request, "urlopen", dropped)

    with pytest.raises(BtcWeightsUnavailable) as e:
        chord_backend.select_chord_model()
    msg = str(e.value)
    assert str(tmp_path) in msg                # the cache dir
    assert chords_btc.WEIGHTS_URL in msg       # the pinned source
    assert "tabit warmup" in msg               # how to retry
    assert "crema" not in msg.lower()


def test_backend_selection_env_var_is_gone():
    assert not hasattr(chord_backend, "requested_backend")
    assert not hasattr(chord_backend, "backend_of")


def test_engine_version_is_the_package_version():
    from engine import __version__, engine_version
    assert engine_version() == __version__ == "0.5.1"
