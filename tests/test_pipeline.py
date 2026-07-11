from engine.pipeline import analyze
from engine.chords import RawChord
from engine import __version__


class FakeChordModel:
    def predict(self, wav_path):
        return [RawChord(0.0, 1.0, "A", "min", "A", 0.8),
                RawChord(1.0, 2.0, "F", "maj", "F", 0.7)]


def test_analyze_local_file_end_to_end(tone_440_wav, tmp_path, monkeypatch):
    # Stub the heavy stages so this stays a fast unit test of the wiring.
    import engine.pipeline as p
    monkeypatch.setattr(p, "separate", lambda w, o: {"harmonic": w, "bass": w})
    monkeypatch.setattr(p, "harmonic_mix", lambda stems, o: tone_440_wav)
    # Fine-grained beat grid so each 1-second chord segment is >= 2 local
    # beats long and merge_short (pipeline order: ... -> merge_short -> ...)
    # doesn't absorb one chord into the other; this test is about pipeline
    # wiring, not merge_short's own behavior (see test_postprocess.py).
    monkeypatch.setattr(p, "track_beats", lambda w: (120.0, [0.0, 0.5, 1.0, 1.5, 2.0]))
    monkeypatch.setattr(p, "detect_key", lambda w: __import__(
        "engine.schema", fromlist=["Key"]).Key(tonic="A", mode="minor", confidence=0.7))
    monkeypatch.setattr(p, "detect_bass_notes", lambda w, segs: [(s.root, 1.0) for s in segs])

    chart = analyze(tone_440_wav, created_at="2026-07-09T00:00:00Z",
                    workdir=str(tmp_path), chord_model=FakeChordModel())

    assert chart.schemaVersion == 1
    assert chart.analysis.engineVersion == __version__
    assert chart.key.tonic == "A"
    assert chart.tempo.bpm == 120.0
    assert [c.label for c in chart.chords] == ["Am", "F"]
    assert any("pentatonic" in s.name for s in chart.scales)
