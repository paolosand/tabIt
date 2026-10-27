import hashlib
import os

import numpy as np
import pytest
import soundfile as sf
import torch

from engine import chords_btc
from engine.chords import RawChord
from engine.chords_btc import (
    MIN_SEGMENT_SEC, BtcChordModel, BtcWeightsUnavailable, ensure_weights,
    filter_short_segments, voca_label,
)
from engine.vendor.btc.model import BTCModel


def _raw(start, end, root="C", quality="maj", conf=0.8):
    return RawChord(start, end, root, quality, root, conf)


# ---- vocabulary ----

def test_voca_label_follows_upstream_index_layout():
    assert voca_label(0) == "C:min"          # 14 qualities per root, min first
    assert voca_label(1) == "C"              # maj is written bare
    assert voca_label(9 * 14 + 9) == "A:7"
    assert voca_label(11 * 14 + 11) == "B:hdim7"
    assert voca_label(168) == "N"            # X (unknown) is treated as no chord
    assert voca_label(169) == "N"


# ---- short-segment filter ----

def test_short_segment_merges_into_the_longer_neighbour():
    out = filter_short_segments([
        _raw(0, 4, "C"), _raw(4, 4.3, "D", "min"), _raw(4.3, 6, "G")])
    # C (4 s) is longer than G (1.7 s): the flicker is absorbed by C
    assert [(r.root, r.start, r.end) for r in out] == [("C", 0, 4.3), ("G", 4.3, 6)]


def test_first_and_last_segments_extend_their_only_neighbour():
    out = filter_short_segments([_raw(0, 0.2, "D"), _raw(0.2, 3, "C"), _raw(3, 3.1, "G")])
    assert [(r.root, r.start, r.end) for r in out] == [("C", 0, 3.1)]


def test_neighbours_that_become_identical_are_merged():
    out = filter_short_segments([
        _raw(0, 2, "C", conf=0.9), _raw(2, 2.2, "D", "min"), _raw(2.2, 4, "C", conf=0.5)])
    assert len(out) == 1 and (out[0].start, out[0].end) == (0, 4)
    assert 0.5 < out[0].confidence < 0.9   # duration-weighted, not max


def test_a_short_chord_is_never_absorbed_by_no_chord():
    # a short chord next to silence is absorbed by the chord side, not by N
    out = filter_short_segments([_raw(0, 5, "N", "N"), _raw(5, 5.2, "C"), _raw(5.2, 8, "G")])
    assert [(r.root, r.start, r.end) for r in out] == [("N", 0, 5), ("G", 5, 8)]


def test_filter_leaves_long_segments_and_input_untouched():
    segs = [_raw(0, 2, "C"), _raw(2, 2.5, "G"), _raw(2.5, 4, "A", "min")]
    out = filter_short_segments(segs)
    assert [(r.root, r.start, r.end) for r in out] == [("C", 0, 2), ("G", 2, 2.5), ("A", 2.5, 4)]
    assert segs[1].end == 2.5 and MIN_SEGMENT_SEC == 0.5


def test_filter_keeps_a_lone_short_segment():
    assert len(filter_short_segments([_raw(0, 0.3, "C")])) == 1
    assert filter_short_segments([]) == []


# ---- weights ----

PAYLOAD = b"fake-weights"


@pytest.fixture
def pinned(monkeypatch):
    monkeypatch.setattr(chords_btc, "WEIGHTS_SHA256", hashlib.sha256(PAYLOAD).hexdigest())


def test_models_dir_env_override(monkeypatch, tmp_path):
    monkeypatch.setenv("TABIT_MODELS_DIR", str(tmp_path / "m"))
    assert chords_btc.models_dir() == tmp_path / "m"


def test_default_models_dir_lives_beside_the_helper_data(monkeypatch):
    from helper import paths
    monkeypatch.delenv("TABIT_MODELS_DIR", raising=False)
    assert chords_btc.models_dir() == paths.APP_SUPPORT / "models"


def test_weights_url_is_pinned_to_a_commit():
    assert "2682317be668032e6e4b269ded36adaa2ad57df0" in chords_btc.WEIGHTS_URL
    assert len(chords_btc.WEIGHTS_SHA256) == 64


def test_ensure_weights_downloads_verifies_and_caches(pinned, tmp_path):
    calls = []
    fetch = lambda url: calls.append(url) or PAYLOAD
    p = ensure_weights(tmp_path, fetch=fetch)
    assert p.read_bytes() == PAYLOAD and p.parent == tmp_path
    ensure_weights(tmp_path, fetch=fetch)
    assert calls == [chords_btc.WEIGHTS_URL]          # second call is a cache hit
    assert not list(tmp_path.glob("*.part"))


def test_ensure_weights_rejects_a_hash_mismatch_and_keeps_nothing(pinned, tmp_path):
    with pytest.raises(BtcWeightsUnavailable, match="sha256"):
        ensure_weights(tmp_path, fetch=lambda url: b"tampered")
    assert list(tmp_path.iterdir()) == []


def test_ensure_weights_refetches_a_corrupt_cached_file(pinned, tmp_path):
    (tmp_path / chords_btc.WEIGHTS_FILENAME).write_bytes(b"truncated")
    p = ensure_weights(tmp_path, fetch=lambda url: PAYLOAD)
    assert p.read_bytes() == PAYLOAD


def test_offline_error_is_actionable(pinned, tmp_path):
    def offline(url):
        raise OSError("Network is unreachable")
    with pytest.raises(BtcWeightsUnavailable) as e:
        ensure_weights(tmp_path, fetch=offline)
    msg = str(e.value)
    assert "Network is unreachable" in msg
    assert str(tmp_path / chords_btc.WEIGHTS_FILENAME) in msg
    assert "TABIT_CHORD_BACKEND=crema" in msg


# ---- inference with tiny fake weights ----

TINY = dict(chords_btc.MODEL_CONFIG, num_layers=1, hidden_size=16, total_key_depth=16,
            total_value_depth=16, filter_size=16, num_heads=2)


@pytest.fixture
def fake_weights(tmp_path):
    """A checkpoint whose output bias pins every frame to A:7 (random body)."""
    torch.manual_seed(0)
    model = BTCModel(TINY)
    with torch.no_grad():
        model.output_layer.output_projection.weight.zero_()
        model.output_layer.output_projection.bias.zero_()
        model.output_layer.output_projection.bias[9 * 14 + 9] = 50.0
    path = tmp_path / "fake.pt"
    torch.save({"model": model.state_dict(), "mean": 0.0, "std": 1.0}, path)
    return path


def test_predict_returns_contiguous_rawchords_covering_the_song(fake_weights, tmp_path):
    sr = 22050
    t = np.arange(int(sr * 25.0)) / sr   # 25 s: spans 3 ten-second windows
    wav = tmp_path / "t.wav"
    sf.write(str(wav), (0.3 * np.sin(2 * np.pi * 220 * t)).astype("float32"), sr)

    raws = BtcChordModel(fake_weights, config=TINY).predict(str(wav))

    assert len(raws) == 1
    r = raws[0]
    assert (r.root, r.quality, r.bass) == ("A", "dom7", "A")   # no slash chords in BTC
    assert r.start == 0.0 and r.end == pytest.approx(25.0, abs=0.01)
    assert r.confidence > 0.99          # softmax top-1 probability, not a constant


def test_backend_attribute_names_the_backend():
    assert BtcChordModel.backend == "btc"


def test_a_pinned_hash_is_checked_against_the_bytes_loaded(fake_weights):
    with pytest.raises(BtcWeightsUnavailable, match="sha256"):
        BtcChordModel(fake_weights, config=TINY, sha256="0" * 64).load()
    good = hashlib.sha256(fake_weights.read_bytes()).hexdigest()
    assert BtcChordModel(fake_weights, config=TINY, sha256=good).load()


def test_checkpoint_loads_without_arbitrary_unpickling(fake_weights, tmp_path):
    import pickle

    class Evil:
        def __reduce__(self):
            return (os.system, ("true",))
    bad = tmp_path / "evil.pt"
    torch.save({"model": {}, "mean": Evil(), "std": 1.0}, bad)
    with pytest.raises(pickle.UnpicklingError):
        BtcChordModel(bad, config=TINY).load()
