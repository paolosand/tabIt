import threading

import numpy as np

from engine.pipeline import analyze
from engine.chords import RawChord
from engine.schema import Key
from engine import __version__


class FakeChordModel:
    def predict(self, wav_path):
        return [RawChord(0.0, 1.0, "A", "min", "A", 0.8),
                RawChord(1.0, 2.0, "F", "maj", "F", 0.7)]


def _stub_common(p, monkeypatch, tone_440_wav):
    monkeypatch.setattr(p, "separate", lambda w, o: {"harmonic": w, "bass": w})
    monkeypatch.setattr(p, "harmonic_mix", lambda stems, o: tone_440_wav)
    # Fine-grained beat grid so each 1-second chord segment is >= 2 local
    # beats long and merge_short (pipeline order: ... -> merge_short -> ...)
    # doesn't absorb one chord into the other; this test is about pipeline
    # wiring, not merge_short's own behavior (see test_postprocess.py).
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 0.5, 1.0, 1.5, 2.0]))
    monkeypatch.setattr(p, "detect_key", lambda w: Key(tonic="A", mode="minor", confidence=0.7))
    monkeypatch.setattr(p, "predict_bass_pitch",
                        lambda w: (np.array([]), np.array([]), np.array([])))
    monkeypatch.setattr(p, "window_bass_notes",
                        lambda track, segs: [(s.root, 1.0) for s in segs])


def test_analyze_local_file_end_to_end(tone_440_wav, tmp_path, monkeypatch):
    # Stub the heavy stages so this stays a fast unit test of the wiring.
    import engine.pipeline as p
    _stub_common(p, monkeypatch, tone_440_wav)

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=FakeChordModel())

    assert chart.schemaVersion == 1
    assert chart.analysis.engineVersion == __version__
    assert chart.key.tonic == "A"
    assert chart.tempo.bpm == 120.0
    assert [c.label for c in chart.chords] == ["Am", "F"]
    assert any("pentatonic" in s.name for s in chart.scales)
    # Meter is always wired up; the stub's degenerate 2-chord/5-beat input has
    # too few beats and changes for detect_meter to report anything, so the
    # ribbon should fall back to %4 rather than carry a leftover downbeat list.
    assert chart.meter is not None
    assert chart.downbeats == []


def test_analyze_overlaps_independent_stages(tone_440_wav, tmp_path, monkeypatch):
    """Key detection must run while separation is in flight, and the bulk bass
    pitch track must run while the chord model is predicting. Serial execution
    fails this test after the wait timeouts (it does not hang)."""
    import engine.pipeline as p

    key_ran = threading.Event()
    crepe_started = threading.Event()
    overlap = {}

    def fake_detect_key(w):
        key_ran.set()
        return Key(tonic="A", mode="minor", confidence=0.7)

    def fake_separate(w, o):
        overlap["key_during_separation"] = key_ran.wait(5.0)
        return {"harmonic": w, "bass": w}

    def fake_predict_bass_pitch(w):
        crepe_started.set()
        return (np.array([0.25, 0.75]), np.array([110.0, 110.0]), np.array([0.9, 0.9]))

    class ChordModelThatChecksOverlap:
        def predict(self, wav_path):
            overlap["bass_during_chords"] = crepe_started.wait(5.0)
            return [RawChord(0.0, 1.0, "A", "min", "A", 0.8),
                    RawChord(1.0, 2.0, "F", "maj", "F", 0.7)]

    monkeypatch.setattr(p, "separate", fake_separate)
    monkeypatch.setattr(p, "harmonic_mix", lambda stems, o: tone_440_wav)
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 0.5, 1.0, 1.5, 2.0]))
    monkeypatch.setattr(p, "detect_key", fake_detect_key)
    monkeypatch.setattr(p, "predict_bass_pitch", fake_predict_bass_pitch)

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=ChordModelThatChecksOverlap())

    assert overlap == {"key_during_separation": True, "bass_during_chords": True}
    assert chart.key.tonic == "A"
    assert [c.label for c in chart.chords] == ["Am", "F"]
